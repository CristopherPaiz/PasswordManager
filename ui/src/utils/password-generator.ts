import { randomBytes } from "./crypto";

export interface PasswordOptions {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
}

export const DEFAULT_PASSWORD_OPTIONS: PasswordOptions = {
  length: 20,
  uppercase: true,
  lowercase: true,
  numbers: true,
  symbols: true,
};

const SETS = {
  uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  lowercase: "abcdefghijklmnopqrstuvwxyz",
  numbers: "0123456789",
  symbols: "!@#$%^&*()-_=+[]{};:,.?/",
};

/**
 * Genera una contraseña con aleatoriedad criptográfica (crypto.getRandomValues),
 * nunca Math.random. Rechaza por módulo para evitar sesgo.
 */
export const generatePassword = (opts: PasswordOptions): string => {
  let pool = "";
  if (opts.uppercase) pool += SETS.uppercase;
  if (opts.lowercase) pool += SETS.lowercase;
  if (opts.numbers) pool += SETS.numbers;
  if (opts.symbols) pool += SETS.symbols;
  if (pool.length === 0) pool = SETS.lowercase;

  const max = Math.floor(256 / pool.length) * pool.length;
  let result = "";
  while (result.length < opts.length) {
    const bytes = randomBytes(opts.length * 2);
    for (let i = 0; i < bytes.length && result.length < opts.length; i++) {
      if (bytes[i] < max) result += pool[bytes[i] % pool.length];
    }
  }
  return result;
};
