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
