/**
 * TOTP (RFC 6238) en el navegador, para los códigos 2FA guardados DENTRO de un
 * item del baúl.
 *
 * Se implementa a mano en vez de traer una librería por dos razones:
 * - WebCrypto ya trae HMAC-SHA1/256/512; el algoritmo son ~30 líneas.
 * - Una dependencia menos en la superficie de ataque de un gestor de
 *   contraseñas, y nada de peso extra en el bundle.
 *
 * El secreto vive cifrado dentro del blob del item: el server nunca lo ve, y
 * los códigos se calculan en memoria del cliente. Guardarlo junto a la
 * contraseña debilita el 2FA de ese servicio (un solo cofre para los dos
 * factores) — es el mismo compromiso que hacen 1Password o Bitwarden, y por eso
 * la maestra y la llave de recuperación de ESTA app nunca deberían guardarse
 * aquí dentro.
 */

// Alfabeto base32 RFC 4648 (el mismo de la llave de recuperación).
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export type TotpAlgorithm = "SHA1" | "SHA256" | "SHA512";

export interface TotpConfig {
  /** Secreto en base32, sin espacios ni relleno. */
  secret: string;
  digits: number;
  period: number;
  algorithm: TotpAlgorithm;
  /** Servicio, si el URI otpauth lo traía. Solo informativo. */
  issuer?: string;
  /** Cuenta, si el URI otpauth la traía. Solo informativo. */
  account?: string;
}

export const TOTP_DEFAULTS = { digits: 6, period: 30, algorithm: "SHA1" as TotpAlgorithm };

const SUBTLE_HASH: Record<TotpAlgorithm, string> = {
  SHA1: "SHA-1",
  SHA256: "SHA-256",
  SHA512: "SHA-512",
};

/** Normaliza lo que escribió el usuario: sin espacios, guiones ni relleno. */
export const normalizeSecret = (raw: string): string =>
  raw.replace(/[\s-]/g, "").replace(/=+$/, "").toUpperCase();

const base32Decode = (secret: string): Uint8Array => {
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (const char of secret) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error("TOTP_BAD_SECRET");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  if (output.length === 0) throw new Error("TOTP_BAD_SECRET");
  return new Uint8Array(output);
};

/** ¿El texto es un secreto base32 utilizable? Sirve para validar el formulario. */
export const isValidSecret = (raw: string): boolean => {
  const secret = normalizeSecret(raw);
  if (secret.length < 16) return false;
  return [...secret].every((char) => BASE32_ALPHABET.includes(char));
};

const parseAlgorithm = (raw: string | null): TotpAlgorithm => {
  const upper = (raw ?? "").toUpperCase();
  return upper === "SHA256" || upper === "SHA512" ? upper : TOTP_DEFAULTS.algorithm;
};

// Un número del URI solo se acepta si es un entero positivo; cualquier basura
// cae al valor por defecto en vez de producir códigos que nunca cuadran.
const parsePositiveInt = (raw: string | null, fallback: number): number => {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

/**
 * Acepta lo que el usuario tenga a mano: el secreto pelado que muestra la web
 * del servicio, o el `otpauth://` completo que trae un QR escaneado.
 * Lanza `TOTP_BAD_SECRET` si no hay un secreto usable.
 */
export const parseTotpInput = (raw: string): TotpConfig => {
  const trimmed = raw.trim();

  if (!/^otpauth:\/\//i.test(trimmed)) {
    const secret = normalizeSecret(trimmed);
    if (!isValidSecret(secret)) throw new Error("TOTP_BAD_SECRET");
    return { secret, ...TOTP_DEFAULTS };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("TOTP_BAD_SECRET");
  }

  // Solo TOTP: un `otpauth://hotp/` lleva contador, no reloj, y esta app no lo
  // soporta. Aceptarlo daría códigos siempre inválidos.
  if (url.host.toLowerCase() !== "totp") throw new Error("TOTP_BAD_SECRET");

  const secret = normalizeSecret(url.searchParams.get("secret") ?? "");
  if (!isValidSecret(secret)) throw new Error("TOTP_BAD_SECRET");

  // La etiqueta es "Servicio:cuenta"; el issuer del query manda sobre el prefijo.
  const label = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const [labelIssuer, labelAccount] = label.includes(":")
    ? [label.slice(0, label.indexOf(":")), label.slice(label.indexOf(":") + 1)]
    : ["", label];
  const issuer = url.searchParams.get("issuer") ?? labelIssuer;

  return {
    secret,
    digits: parsePositiveInt(url.searchParams.get("digits"), TOTP_DEFAULTS.digits),
    period: parsePositiveInt(url.searchParams.get("period"), TOTP_DEFAULTS.period),
    algorithm: parseAlgorithm(url.searchParams.get("algorithm")),
    ...(issuer ? { issuer } : {}),
    ...(labelAccount ? { account: labelAccount } : {}),
  };
};

/**
 * Código para el instante dado (por defecto, ahora).
 *
 * RFC 6238: contador = floor(epoch / period) en 8 bytes big-endian, HMAC del
 * contador con el secreto, y truncamiento dinámico (los 4 bits bajos del último
 * byte dicen desde dónde leer los 4 bytes del código).
 */
export const generateTotpCode = async (config: TotpConfig, nowMs = Date.now()): Promise<string> => {
  const counter = Math.floor(nowMs / 1000 / config.period);

  const counterBytes = new Uint8Array(8);
  new DataView(counterBytes.buffer).setBigUint64(0, BigInt(counter), false);

  const key = await crypto.subtle.importKey(
    "raw",
    base32Decode(config.secret),
    { name: "HMAC", hash: SUBTLE_HASH[config.algorithm] },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBytes));

  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % 10 ** config.digits).padStart(config.digits, "0");
};

/** Segundos que le quedan de vida al código actual (para el contador visual). */
export const secondsRemaining = (period: number, nowMs = Date.now()): number =>
  period - (Math.floor(nowMs / 1000) % period);

/** Agrupa el código en dos mitades ("123 456"): se lee y se teclea mejor. */
export const formatCode = (code: string): string => {
  const mitad = Math.ceil(code.length / 2);
  return `${code.slice(0, mitad)} ${code.slice(mitad)}`;
};
