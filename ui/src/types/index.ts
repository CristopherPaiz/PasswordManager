export interface User {
  id: number;
  username: string;
  nombre: string | null;
  apellido: string | null;
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

// ---------- Baúl (vault) ----------

// Contenido descifrado de un item (vive solo en memoria del navegador).
export interface VaultItemData {
  title: string;
  username: string;
  password: string;
  url: string;
  notes: string;
}

// Fila tal cual la guarda/devuelve el server: cifrada, ilegible para el server.
export interface VaultItemRow {
  id: number;
  tipo: string;
  ciphertext: string;
  iv: string;
  fecha_creacion: string;
  fecha_modificacion: string;
}

// Item ya descifrado en el cliente: fila + datos en claro.
export interface VaultItem extends VaultItemRow {
  data: VaultItemData;
}
