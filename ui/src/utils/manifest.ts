import { EncryptedBlob, aesDecrypt, aesEncrypt, toBase64 } from "./crypto";
import { VaultItemRow } from "@apptypes";

/**
 * Manifiesto del baúl: defensa contra un servidor que BORRA o REVIERTE items.
 *
 * El AAD por item (uid) ya impide que el server intercambie ciphertexts entre
 * filas, pero no cubre dos ataques silenciosos:
 *   - borrar una fila (el cliente no sabe que existía),
 *   - devolver un ciphertext viejo de esa misma fila (rollback de un cambio).
 *
 * El manifiesto es un inventario CIFRADO con la vaultKey: para cada item guarda
 * su uid y un digest SHA-256 de su blob. El server no puede leerlo ni forjarlo
 * (no tiene la llave), así que al abrir el baúl se compara lo que el server
 * entrega contra lo que el propio usuario firmó la última vez.
 *
 * `version` solo avanza. El cliente recuerda en localStorage la última que vio:
 * si el server devuelve una menor, está sirviendo un estado viejo del baúl
 * completo (rollback), y eso se avisa aunque el manifiesto en sí sea válido.
 */

// AAD del blob del manifiesto: lo ata a su propósito. Un manifiesto no puede
// hacerse pasar por un item ni al revés.
const MANIFEST_AAD = "pm-vault-manifest-v1";

export interface VaultManifest {
  v: 1;
  version: number;
  updatedAt: string;
  // uid -> digest del blob cifrado.
  items: Record<string, string>;
  // Items LEGACY (sin uid): no se pueden rastrear individualmente, pero su
  // cantidad sí. Adquieren uid en su primera edición y salen de aquí.
  legacy: number;
}

export interface IntegrityReport {
  // Items que el usuario tenía y el server ya no devuelve.
  missing: string[];
  // Items cuyo blob no coincide con el que el usuario firmó (contenido revertido
  // o sustituido).
  modified: string[];
  // Items que el server devuelve y no estaban en el inventario firmado.
  unknown: string[];
  // Items legacy que desaparecieron (solo se detecta la baja de cantidad).
  missingLegacy: number;
  // El server devolvió una versión anterior a la última vista por este navegador.
  rolledBack: boolean;
  // El manifiesto no se pudo descifrar: blob manipulado o llave equivocada.
  unreadable: boolean;
  ok: boolean;
}

type ManifestRow = Pick<VaultItemRow, "ciphertext" | "iv" | "uid">;

// Digest del blob tal como lo guarda el server. Cambia si cambia el contenido
// cifrado, el nonce o el uid: cualquier sustitución se nota.
export const digestRow = async (row: ManifestRow): Promise<string> => {
  const data = new TextEncoder().encode(`${row.uid ?? ""}|${row.iv}|${row.ciphertext}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return toBase64(new Uint8Array(hash));
};

export const buildManifest = async (
  rows: ManifestRow[],
  version: number,
): Promise<VaultManifest> => {
  const items: Record<string, string> = {};
  let legacy = 0;

  for (const row of rows) {
    if (!row.uid) {
      legacy += 1;
      continue;
    }
    items[row.uid] = await digestRow(row);
  }

  return { v: 1, version, updatedAt: new Date().toISOString(), items, legacy };
};

export const encryptManifest = (
  vaultKey: CryptoKey,
  manifest: VaultManifest,
): Promise<EncryptedBlob> => aesEncrypt(vaultKey, JSON.stringify(manifest), MANIFEST_AAD);

export const decryptManifest = async (
  vaultKey: CryptoKey,
  blob: EncryptedBlob,
): Promise<VaultManifest> => {
  const plaintext = await aesDecrypt(vaultKey, blob, MANIFEST_AAD);
  return JSON.parse(plaintext) as VaultManifest;
};

/**
 * Compara lo que el server entregó contra el inventario firmado.
 *
 * `lastSeenVersion` viene de localStorage (por cuenta y navegador). No es
 * infalible —un navegador nuevo no tiene con qué comparar—, pero en el equipo
 * de siempre convierte un rollback silencioso en una alerta visible.
 */
export const verifyManifest = async (
  manifest: VaultManifest,
  rows: ManifestRow[],
  serverVersion: number,
  lastSeenVersion: number,
): Promise<IntegrityReport> => {
  const missing: string[] = [];
  const modified: string[] = [];
  const unknown: string[] = [];
  let legacy = 0;

  const seen = new Set<string>();

  for (const row of rows) {
    if (!row.uid) {
      legacy += 1;
      continue;
    }
    seen.add(row.uid);
    const expected = manifest.items[row.uid];
    if (expected === undefined) {
      unknown.push(row.uid);
      continue;
    }
    if ((await digestRow(row)) !== expected) modified.push(row.uid);
  }

  for (const uid of Object.keys(manifest.items)) {
    if (!seen.has(uid)) missing.push(uid);
  }

  const missingLegacy = Math.max(0, (manifest.legacy ?? 0) - legacy);
  const rolledBack = serverVersion < lastSeenVersion;

  return {
    missing,
    modified,
    unknown,
    missingLegacy,
    rolledBack,
    unreadable: false,
    ok:
      missing.length === 0 &&
      modified.length === 0 &&
      unknown.length === 0 &&
      missingLegacy === 0 &&
      !rolledBack,
  };
};

// Marca de agua local: la última versión de manifiesto que este navegador vio
// para esta cuenta. Sin ella, un server que revierta TODO el baúl (items +
// manifiesto a la vez) sería consistente consigo mismo y pasaría desapercibido.
const watermarkKey = (userId: number): string => `pm_vault_manifest_v:${userId}`;

export const readVersionWatermark = (userId: number): number => {
  try {
    return Number(localStorage.getItem(watermarkKey(userId)) ?? 0) || 0;
  } catch {
    return 0;
  }
};

export const writeVersionWatermark = (userId: number, version: number): void => {
  try {
    const current = readVersionWatermark(userId);
    if (version > current) localStorage.setItem(watermarkKey(userId), String(version));
  } catch {
    // localStorage bloqueado (modo privado): se pierde la detección de rollback,
    // no la del resto del manifiesto.
  }
};
