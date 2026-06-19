import { LayoutDashboard, Home, AlertTriangle, KeyRound, ShieldCheck } from "lucide-react";
import { ElementType } from "react";

export const ROUTES = {
  HOME: "/",
  LOGIN: "/login",
  REGISTER: "/register",
  RECOVERY: "/recovery",
  VAULT: "/vault",
  SECURITY: "/security",
  DASHBOARD: "/dashboard",
  ERRORS: "/errors",
} as const;

// Inactividad antes de bloquear el baúl automáticamente (borra la vaultKey).
export const VAULT_AUTO_LOCK_MS = 10 * 60 * 1000;

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
  },
  VAULT: {
    KEYS: "/api/vault/keys",
    LIST: "/api/vault",
    ITEM: (id: number) => `/api/vault/${id}`,
  },
  UPLOAD: {
    TEST: "/api/upload/test",
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

export const FORM_FIELDS = {
  UPLOAD_TEST: "imagen_prueba",
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
  PUBLIC: [{ labelKey: "nav.home", path: ROUTES.HOME, icon: Home }] as NavigationItem[],
  PRIVATE: [
    { labelKey: "nav.vault", path: ROUTES.VAULT, icon: KeyRound },
    { labelKey: "nav.security", path: ROUTES.SECURITY, icon: ShieldCheck },
    { labelKey: "nav.dashboard", path: ROUTES.DASHBOARD, icon: LayoutDashboard },
    { labelKey: "nav.errors", path: ROUTES.ERRORS, icon: AlertTriangle },
  ] as NavigationItem[],
} as const;
