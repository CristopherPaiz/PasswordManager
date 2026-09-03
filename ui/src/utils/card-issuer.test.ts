import { beforeEach, describe, expect, it } from "vitest";
import binTable from "../data/bins-gt.json";
import { CARD_COLOR_IDS } from "./card-design";
import { lookupIssuer, resetIssuerCache } from "./card-issuer";

/**
 * La tabla de BIN es un dato empaquetado: si se regenera mal, la app atribuye
 * tarjetas al banco equivocado. Estos tests fijan tanto la forma del archivo
 * como el comportamiento de la búsqueda.
 */

const table = binTable as unknown as {
  issuers: Record<string, { name: string; color: string }>;
  bins: Record<string, string>;
  license: string;
  source: string;
};

beforeEach(() => resetIssuerCache());

describe("integridad de la tabla bins-gt.json", () => {
  it("declara fuente y licencia (CC-BY-4.0 exige atribución)", () => {
    expect(table.license).toBe("CC-BY-4.0");
    expect(table.source).toMatch(/^https:\/\//);
  });

  it("todo BIN apunta a un emisor que existe", () => {
    const huérfanos = Object.entries(table.bins).filter(([, key]) => !table.issuers[key]);
    expect(huérfanos).toEqual([]);
  });

  it("todo emisor tiene al menos un BIN (nada de entradas muertas)", () => {
    const usados = new Set(Object.values(table.bins));
    const sinUso = Object.keys(table.issuers).filter((key) => !usados.has(key));
    expect(sinUso).toEqual([]);
  });

  it("todos los BIN son numéricos de 6 u 8 dígitos", () => {
    for (const bin of Object.keys(table.bins)) {
      expect(bin).toMatch(/^\d+$/);
      expect([6, 8]).toContain(bin.length);
    }
  });

  /** Un color fuera del catálogo dejaría la tarjeta sin fondo. */
  it("todo color pertenece a la paleta", () => {
    for (const issuer of Object.values(table.issuers)) {
      expect(CARD_COLOR_IDS).toContain(issuer.color);
    }
  });

  it("ningún nombre de emisor viene vacío", () => {
    for (const issuer of Object.values(table.issuers)) {
      expect(issuer.name.trim().length).toBeGreaterThan(0);
    }
  });

  it("cubre los bancos grandes de Guatemala", () => {
    const nombres = Object.values(table.issuers).map((i) => i.name);
    for (const banco of [
      "Banco Industrial",
      "BAC Credomatic",
      "Banrural",
      "Banco G&T Continental",
      "Banco Promerica",
      "Banco Agromercantil",
    ]) {
      expect(nombres).toContain(banco);
    }
  });
});

describe("lookupIssuer", () => {
  // Se toma un BIN real de la tabla para no acoplar el test a un banco concreto.
  const [algúnBin, algunaClave] = Object.entries(table.bins)[0];

  it("encuentra el emisor de un BIN de la tabla", async () => {
    const match = await lookupIssuer(algúnBin + "0000000000");
    expect(match?.key).toBe(algunaClave);
    expect(match?.name).toBe(table.issuers[algunaClave].name);
  });

  it("devuelve null con menos de 6 dígitos", async () => {
    expect(await lookupIssuer("41111")).toBeNull();
    expect(await lookupIssuer("")).toBeNull();
  });

  it("devuelve null si el BIN no está en la tabla", async () => {
    // 999999 no es un IIN asignado en el dataset.
    expect(await lookupIssuer("9999999999999999")).toBeNull();
  });

  it("ignora espacios y guiones", async () => {
    const espaciado = algúnBin.replace(/(\d{4})(\d{2})/, "$1 $2") + " 0000 0000";
    expect((await lookupIssuer(espaciado))?.key).toBe(algunaClave);
  });

  it("reporta cuántos dígitos hicieron match", async () => {
    const match = await lookupIssuer(algúnBin + "0000000000");
    expect([6, 8]).toContain(match?.matchedDigits);
  });

  it("el color sugerido siempre es válido", async () => {
    for (const bin of Object.keys(table.bins).slice(0, 40)) {
      const match = await lookupIssuer(bin + "0000000000");
      expect(CARD_COLOR_IDS).toContain(match?.color);
    }
  });

  it("reusa la tabla entre consultas", async () => {
    const a = await lookupIssuer(algúnBin + "0000000000");
    const b = await lookupIssuer(algúnBin + "1111111111");
    expect(a?.key).toBe(b?.key);
  });
});
