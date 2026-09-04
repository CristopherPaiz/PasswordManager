import { describe, expect, it, beforeEach } from "vitest";
import { generateVaultKey, importAesKey, randomBytes, toBase64 } from "./crypto";
import {
  buildManifest,
  decryptManifest,
  digestRow,
  encryptManifest,
  readVersionWatermark,
  verifyManifest,
  writeVersionWatermark,
} from "./manifest";

/**
 * El manifiesto cubre lo que el AAD por item no puede: que el SERVIDOR borre
 * filas o devuelva contenido viejo. Estos tests simulan justo eso — un server
 * que entrega una lista manipulada — y verifican que el cliente lo note.
 */

const row = (uid: string | null) => ({
  uid,
  iv: toBase64(randomBytes(12)),
  ciphertext: toBase64(randomBytes(48)),
});

const vaultKey = () => importAesKey(generateVaultKey());

describe("digestRow", () => {
  it("es estable para la misma fila", async () => {
    const r = row("uid-1");
    expect(await digestRow(r)).toBe(await digestRow(r));
  });

  it("cambia si cambia el ciphertext, el iv o el uid", async () => {
    const r = row("uid-1");
    const base = await digestRow(r);

    expect(await digestRow({ ...r, ciphertext: toBase64(randomBytes(48)) })).not.toBe(base);
    expect(await digestRow({ ...r, iv: toBase64(randomBytes(12)) })).not.toBe(base);
    expect(await digestRow({ ...r, uid: "uid-2" })).not.toBe(base);
  });
});

describe("manifiesto cifrado", () => {
  it("hace round-trip con la vaultKey", async () => {
    const key = await vaultKey();
    const manifest = await buildManifest([row("a"), row("b")], 3);

    const blob = await encryptManifest(key, manifest);
    expect(await decryptManifest(key, blob)).toEqual(manifest);
  });

  it("no se abre con otra llave", async () => {
    const manifest = await buildManifest([row("a")], 1);
    const blob = await encryptManifest(await vaultKey(), manifest);

    await expect(decryptManifest(await vaultKey(), blob)).rejects.toThrow();
  });

  it("el blob no revela los uid en claro", async () => {
    const key = await vaultKey();
    const manifest = await buildManifest([row("uid-super-identificable")], 1);

    const blob = await encryptManifest(key, manifest);
    expect(blob.ct).not.toContain("uid-super-identificable");
  });

  it("cuenta aparte los items legacy (sin uid)", async () => {
    const manifest = await buildManifest([row("a"), row(null), row(null)], 1);

    expect(Object.keys(manifest.items)).toEqual(["a"]);
    expect(manifest.legacy).toBe(2);
  });
});

describe("verifyManifest", () => {
  it("da OK cuando el server devuelve exactamente lo firmado", async () => {
    const rows = [row("a"), row("b"), row(null)];
    const manifest = await buildManifest(rows, 5);

    const report = await verifyManifest(manifest, rows, 5, 5);

    expect(report.ok).toBe(true);
    expect(report.missing).toEqual([]);
    expect(report.modified).toEqual([]);
    expect(report.unknown).toEqual([]);
  });

  // Ataque 1: el server simplemente deja de devolver una fila.
  it("detecta un item borrado por el servidor", async () => {
    const a = row("a");
    const b = row("b");
    const manifest = await buildManifest([a, b], 2);

    const report = await verifyManifest(manifest, [a], 2, 2);

    expect(report.ok).toBe(false);
    expect(report.missing).toEqual(["b"]);
  });

  // Ataque 2: el server devuelve la MISMA fila con un ciphertext viejo.
  it("detecta un item revertido a una versión anterior", async () => {
    const viejo = row("a");
    const nuevo = { ...viejo, ciphertext: toBase64(randomBytes(48)) };
    const manifest = await buildManifest([nuevo], 2);

    const report = await verifyManifest(manifest, [viejo], 2, 2);

    expect(report.ok).toBe(false);
    expect(report.modified).toEqual(["a"]);
    expect(report.missing).toEqual([]);
  });

  it("detecta items que el server agrega y no estaban firmados", async () => {
    const a = row("a");
    const manifest = await buildManifest([a], 1);

    const report = await verifyManifest(manifest, [a, row("intruso")], 1, 1);

    expect(report.ok).toBe(false);
    expect(report.unknown).toEqual(["intruso"]);
  });

  it("detecta la baja de items legacy aunque no tengan uid", async () => {
    const manifest = await buildManifest([row(null), row(null)], 1);

    const report = await verifyManifest(manifest, [row(null)], 1, 1);

    expect(report.ok).toBe(false);
    expect(report.missingLegacy).toBe(1);
  });

  // Ataque 3: el server revierte el baúl COMPLETO (items + manifiesto viejos).
  // Consigo mismo es consistente; solo la marca de agua local lo delata.
  it("detecta un rollback del baúl completo por la versión", async () => {
    const rows = [row("a")];
    const manifest = await buildManifest(rows, 4);

    const report = await verifyManifest(manifest, rows, 4, 9);

    expect(report.ok).toBe(false);
    expect(report.rolledBack).toBe(true);
  });

  it("no marca rollback cuando la versión avanza", async () => {
    const rows = [row("a")];
    const manifest = await buildManifest(rows, 10);

    const report = await verifyManifest(manifest, rows, 10, 9);

    expect(report.rolledBack).toBe(false);
    expect(report.ok).toBe(true);
  });
});

describe("marca de agua de versión", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("arranca en 0 y guarda la última versión vista", () => {
    expect(readVersionWatermark(7)).toBe(0);

    writeVersionWatermark(7, 3);
    expect(readVersionWatermark(7)).toBe(3);
  });

  // Si retrocediera, un server que sirve una versión vieja borraría la prueba
  // de que existió una más nueva.
  it("nunca retrocede", () => {
    writeVersionWatermark(7, 5);
    writeVersionWatermark(7, 2);

    expect(readVersionWatermark(7)).toBe(5);
  });

  it("es independiente por cuenta", () => {
    writeVersionWatermark(1, 4);

    expect(readVersionWatermark(2)).toBe(0);
  });
});
