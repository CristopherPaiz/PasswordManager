import type { CardColorId, CardDesignId } from "@utils/card-design";
import type { TotpAlgorithm } from "@utils/totp";

export interface User {
  id: number;
  username: string;
  nombre: string | null;
  apellido: string | null;
  totpEnabled?: boolean;
  passkeyEnabled?: boolean;
}

export interface ApiResponse<T = null> {
  success: boolean;
  message: string;
  data: T;
}

export interface AuthResponse {
  message: string;
  user: User;
}

export interface LogoutResponse {
  message: string;
  authenticated: boolean;
}

export interface ApiError {
  message: string;
  success?: boolean;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

export interface ErrorLog {
  id: number;
  endpoint: string;
  method: string;
  error_message: string;
  stack_trace: string | null;
  resuelto: number;
  fecha_creacion: string; // UTC (lo que registró el servidor)
  fecha_guatemala: string; // ya convertida a GMT-6 por el backend
}

export interface ServerTimeInfo {
  epoch: number;
  utc: string;
  guatemala: string;
  timezone: string;
  offset: string;
  serverTimezone: string;
}

// Passkey registrada (metadatos para mostrar en Ajustes).
export interface PasskeyInfo {
  id: number;
  label: string | null;
  fecha_creacion: string;
}

// Sesión activa (para gestionarlas en Ajustes).
export interface SessionInfo {
  id: number;
  user_agent: string | null;
  ip: string | null;
  fecha_creacion: string;
  current: boolean;
}

// ---------- Baúl (vault) ----------

// Tipos de item soportados. `tipo` es lo ÚNICO del contenido que va en claro.
export type VaultItemType = "password" | "card" | "note";

// Contenido descifrado de un item (vive solo en memoria del navegador).
// Organización (folder/tags/favorite) y datos de tarjeta viven DENTRO del blob
// cifrado: el server no ve carpetas, etiquetas ni favoritos. Los campos nuevos
// son opcionales para que los items viejos sigan descifrando sin migración.
export interface VaultItemData {
  title: string;
  username: string;
  password: string;
  url: string;
  notes: string;
  folder?: string;
  tags?: string[];
  favorite?: boolean;
  /** Secreto TOTP (base32) del 2FA de ESE servicio, para generar sus códigos
   *  aquí mismo. Viaja dentro del blob cifrado: el server nunca lo ve. */
  totp?: string;
  /** Parámetros del TOTP cuando el servicio no usa los estándar (6/30/SHA1).
   *  `undefined` = valores por defecto, así los items viejos siguen valiendo. */
  totpDigits?: number;
  totpPeriod?: number;
  totpAlgorithm?: TotpAlgorithm;
  // Tarjeta (tipo "card"). Todo esto viaja DENTRO del blob cifrado, así que
  // agregar un campo NO requiere tocar la BD ni la API: los items viejos
  // simplemente no lo traen y descifran igual.
  cardHolder?: string;
  cardNumber?: string;
  cardExpiry?: string;
  cardCvv?: string;
  /** PIN de desbloqueo/cajero. Es el dato más sensible de la tarjeta: nunca se
   *  muestra por defecto y no se copia sin acción explícita del usuario. */
  cardPin?: string;
  /** Banco emisor, para distinguir dos tarjetas de la misma marca. */
  cardIssuer?: string;
  /** Color elegido por el usuario. Se guarda el ID, no el hex, para poder
   *  afinar la paleta después sin migrar datos. `undefined` = color de marca. */
  cardColor?: CardColorId;
  /** Acabado del visual. `undefined` = degradado diagonal. */
  cardDesign?: CardDesignId;
}

// Fila tal cual la guarda/devuelve el server: cifrada, ilegible para el server.
// `uid` es el AAD del cifrado GCM (null en items legacy pre-AAD).
export interface VaultItemRow {
  id: number;
  tipo: VaultItemType;
  ciphertext: string;
  iv: string;
  uid: string | null;
  fecha_creacion: string;
  fecha_modificacion: string;
}

// Item ya descifrado en el cliente: fila + datos en claro.
export interface VaultItem extends VaultItemRow {
  data: VaultItemData;
}
