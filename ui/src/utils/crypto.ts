import { argon2id } from "hash-wasm";

/**
 * Núcleo criptográfico del baúl (zero-knowledge).
 *
 * Jerarquía de llaves:
 *   masterPassword --Argon2id(salt)--> masterKey (32B, solo memoria)
 *       ├─ HKDF("auth") -> authHash  (se envía al server como "password")
 *       └─ HKDF("wrap") -> wrapKey   (envuelve/desenvuelve la vaultKey)
 *   vaultKey (32B aleatorio) cifra TODOS los items con AES-256-GCM.
 *   recoveryKey (aleatorio) -> HKDF("wrap") -> recWrapKey, envuelve la misma vaultKey.
 *
 * El server jamás ve: masterPassword, masterKey, vaultKey ni texto plano.
 * Solo recibe blobs cifrados ({ iv, ct }) y el authHash (que además bcrypt-ea).
 */

export interface KdfParams {
  algo: "argon2id";
  m: number; // memoria en KiB
  t: number; // iteraciones
  p: number; // paralelismo
  hashLen: number;
}

export interface EncryptedBlob {
  iv: string; // base64
  ct: string; // base64
}

// Parámetros por defecto. 64 MiB / 3 pasadas: balance seguridad vs. móvil.
export const DEFAULT_KDF_PARAMS: KdfParams = {
  algo: "argon2id",
  m: 65536,
  t: 3,
  p: 1,
  hashLen: 32,
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// ---------- helpers de codificación ----------

export const randomBytes = (n: number): Uint8Array => crypto.getRandomValues(new Uint8Array(n));

export const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
};

export const fromBase64 = (b64: string): Uint8Array => {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

// ---------- KDF (Argon2id) ----------

export const deriveMasterKey = async (
  password: string,
  saltB64: string,
  params: KdfParams,
): Promise<Uint8Array> => {
  const hash = await argon2id({
    password,
    salt: fromBase64(saltB64),
    parallelism: params.p,
    iterations: params.t,
    memorySize: params.m,
    hashLength: params.hashLen,
    outputType: "binary",
  });
  return hash;
};

// ---------- HKDF (sub-derivación de llaves) ----------

const hkdf = async (ikm: Uint8Array, info: string, length = 32): Promise<Uint8Array> => {
  const baseKey = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: textEncoder.encode(info) },
    baseKey,
    length * 8,
  );
  return new Uint8Array(bits);
};

// authHash: lo que viaja al server para el login (base64). NO es la maestra.
export const deriveAuthHash = async (masterKey: Uint8Array): Promise<string> => {
  const bytes = await hkdf(masterKey, "pm-auth-v1");
  return toBase64(bytes);
};

// wrapKey: bytes con los que se envuelve/desenvuelve la vaultKey.
export const deriveWrapKeyBytes = (keyMaterial: Uint8Array): Promise<Uint8Array> =>
  hkdf(keyMaterial, "pm-wrap-v1");

// ---------- AES-256-GCM ----------

export const importAesKey = (raw: Uint8Array): Promise<CryptoKey> =>
  crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);

export const aesEncrypt = async (key: CryptoKey, plaintext: string): Promise<EncryptedBlob> => {
  const iv = randomBytes(12);
  const ctBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    textEncoder.encode(plaintext),
  );
  return { iv: toBase64(iv), ct: toBase64(new Uint8Array(ctBuffer)) };
};

export const aesDecrypt = async (key: CryptoKey, blob: EncryptedBlob): Promise<string> => {
  const ptBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(blob.iv) },
    key,
    fromBase64(blob.ct),
  );
  return textDecoder.decode(ptBuffer);
};

// Cifra/descifra bytes crudos (para envolver la vaultKey).
const aesEncryptBytes = async (rawKey: Uint8Array, data: Uint8Array): Promise<EncryptedBlob> => {
  const key = await importAesKey(rawKey);
  const iv = randomBytes(12);
  const ctBuffer = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  return { iv: toBase64(iv), ct: toBase64(new Uint8Array(ctBuffer)) };
};

const aesDecryptBytes = async (rawKey: Uint8Array, blob: EncryptedBlob): Promise<Uint8Array> => {
  const key = await importAesKey(rawKey);
  const ptBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(blob.iv) },
    key,
    fromBase64(blob.ct),
  );
  return new Uint8Array(ptBuffer);
};

// ---------- vaultKey: generación, envoltura y apertura ----------

export const generateVaultKey = (): Uint8Array => randomBytes(32);

// Envuelve la vaultKey con material de llave (wrapKey derivada de la maestra o recovery).
export const wrapVaultKey = async (
  vaultKey: Uint8Array,
  wrapKeyBytes: Uint8Array,
): Promise<EncryptedBlob> => aesEncryptBytes(wrapKeyBytes, vaultKey);

export const unwrapVaultKey = (
  blob: EncryptedBlob,
  wrapKeyBytes: Uint8Array,
): Promise<Uint8Array> => aesDecryptBytes(wrapKeyBytes, blob);

// ---------- llave de recuperación (base32 legible) ----------

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

const base32Encode = (bytes: Uint8Array): string => {
  let bits = 0;
  let value = 0;
  let output = "";
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
};

const base32Decode = (str: string): Uint8Array => {
  const clean = str.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(output);
};

// 20 bytes (160 bits) -> 32 chars base32, mostrados en grupos de 4.
export const generateRecoveryKey = (): { display: string; bytes: Uint8Array } => {
  const bytes = randomBytes(20);
  const raw = base32Encode(bytes);
  const display = raw.match(/.{1,4}/g)?.join("-") ?? raw;
  return { display, bytes };
};

export const recoveryKeyToBytes = (display: string): Uint8Array => base32Decode(display);
