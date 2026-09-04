import { AlertTriangle, KeyRound, Settings } from "lucide-react";
import { ElementType } from "react";

export const ROUTES = {
  HOME: "/",
  LOGIN: "/login",
  REGISTER: "/register",
  RECOVERY: "/recovery",
  VAULT: "/vault",
  SETTINGS: "/settings",
  DASHBOARD: "/dashboard",
  ERRORS: "/errors",
} as const;

// Opciones (en minutos) para el bloqueo automático del baúl, configurables en Ajustes.
export const AUTO_LOCK_OPTIONS = [1, 5, 10, 15, 30, 60] as const;

export const API_ENDPOINTS = {
  AUTH: {
    REGISTER: "/api/auth/register",
    PRELOGIN: "/api/auth/prelogin",
    LOGIN: "/api/auth/login",
    LOGOUT: "/api/auth/logout",
    ME: "/api/auth/me",
    RECOVERY_START: "/api/auth/recovery/start",
    RECOVERY_RESET: "/api/auth/recovery/reset",
    TOTP_SETUP: "/api/auth/totp/setup",
    TOTP_ENABLE: "/api/auth/totp/enable",
    TOTP_DISABLE: "/api/auth/totp/disable",
    PASSKEY: "/api/auth/passkey",
    PASSKEY_LIST: "/api/auth/passkeys",
    PASSKEY_ITEM: (id: number) => `/api/auth/passkey/${id}`,
    MASTER: "/api/auth/master",
    KDF: "/api/auth/kdf",
    SESSIONS: "/api/auth/sessions",
    SESSION_ITEM: (id: number) => `/api/auth/sessions/${id}`,
  },
  VAULT: {
    KEYS: "/api/vault/keys",
    MANIFEST: "/api/vault/manifest",
    LIST: "/api/vault",
    BULK: "/api/vault/bulk",
    ITEM: (id: number) => `/api/vault/${id}`,
  },
  SYSTEM: {
    HEALTH: "/health",
    PING: "/ping",
    STATUS: "/status",
    TIME: "/api/system/time",
  },
  CONFIG: {
    GET_ALL: "/api/config",
  },
  ERRORS: {
    LIST: "/api/errors",
  },
} as const;

export const STORAGE_KEYS = {
  THEME: "app_theme",
  SETTINGS: "app_settings",
} as const;

export const THEMES = {
  LIGHT: "light",
  DARK: "dark",
} as const;

export const LANGUAGES = {
  ES: "es",
  EN: "en",
} as const;

export interface NavigationItem {
  labelKey: string;
  path: string;
  icon?: ElementType;
}

export const NAVIGATION = {
  // El logo de la app ya sirve de ancla a inicio; no hace falta enlace "Inicio".
  PUBLIC: [] as NavigationItem[],
  PRIVATE: [
    { labelKey: "nav.vault", path: ROUTES.VAULT, icon: KeyRound },
    { labelKey: "nav.settings", path: ROUTES.SETTINGS, icon: Settings },
    { labelKey: "nav.errors", path: ROUTES.ERRORS, icon: AlertTriangle },
  ] as NavigationItem[],
} as const;

// Páginas válidas como destino de inicio (reusa la navegación privada).
export const START_PAGE_PATHS = NAVIGATION.PRIVATE.map((item) => item.path);
