import {
  DEFAULT_KDF_PARAMS,
  EncryptedBlob,
  KdfParams,
  aesDecrypt,
  aesEncrypt,
  deriveMasterKey,
  importAesKey,
  randomBytes,
  toBase64,
} from "./crypto";
import { VaultItemData } from "@apptypes";

// Archivo de respaldo cifrado: portable y abrible en cualquier instalación con
// la contraseña de exportación. Los items van cifrados con AES-256-GCM usando
// una llave derivada (Argon2id) de esa contraseña.
export interface VaultExportFile {
  format: "passwordmanager-vault";
  version: 1;
  kdf: KdfParams;
  salt: string; // base64
  data: EncryptedBlob;
}

const EMPTY_ITEM: VaultItemData = { title: "", username: "", password: "", url: "", notes: "" };

export const buildExport = async (
  items: VaultItemData[],
  exportPassword: string,
): Promise<VaultExportFile> => {
  const salt = toBase64(randomBytes(16));
  const keyBytes = await deriveMasterKey(exportPassword, salt, DEFAULT_KDF_PARAMS);
  const aesKey = await importAesKey(keyBytes);
  const data = await aesEncrypt(aesKey, JSON.stringify(items));
  return { format: "passwordmanager-vault", version: 1, kdf: DEFAULT_KDF_PARAMS, salt, data };
};

export const parseExport = async (
  file: VaultExportFile,
  password: string,
): Promise<VaultItemData[]> => {
  if (file.format !== "passwordmanager-vault") throw new Error("BAD_FORMAT");
  const keyBytes = await deriveMasterKey(password, file.salt, file.kdf);
  const aesKey = await importAesKey(keyBytes);
  // Si la contraseña es incorrecta, el tag GCM falla y lanza aquí.
  const json = await aesDecrypt(aesKey, file.data);
  return JSON.parse(json) as VaultItemData[];
};

// ---------- CSV (Chrome / Bitwarden / genérico) ----------

// Parser CSV mínimo RFC4180 (soporta comillas y comas/saltos dentro de campos).
const parseCsvRows = (text: string): string[][] => {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.length > 0)) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((f) => f.length > 0)) rows.push(row);
  }
  return rows;
};

const pick = (obj: Record<string, string>, keys: string[]): string => {
  for (const k of keys) if (obj[k] !== undefined) return obj[k];
  return "";
};

// Mapea un CSV (Chrome: name,url,username,password / Bitwarden: login_*) a items.
export const parseCsv = (text: string): VaultItemData[] => {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());

  return rows.slice(1).map((cols) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => (obj[h] = cols[i] ?? ""));
    return {
      ...EMPTY_ITEM,
      title: pick(obj, ["name", "title", "nombre"]),
      username: pick(obj, ["username", "login_username", "user", "usuario", "email"]),
      password: pick(obj, ["password", "login_password", "pass", "contraseña"]),
      url: pick(obj, ["url", "login_uri", "website", "sitio"]),
      notes: pick(obj, ["notes", "note", "notas"]),
    };
  });
};
