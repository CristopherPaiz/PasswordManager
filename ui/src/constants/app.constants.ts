import { LayoutDashboard, Home, AlertTriangle, KeyRound } from "lucide-react";
import { ElementType } from "react";

export const ROUTES = {
  HOME: "/",
  LOGIN: "/login",
  REGISTER: "/register",
  VAULT: "/vault",
  DASHBOARD: "/dashboard",
  ERRORS: "/errors",
} as const;

export const API_ENDPOINTS = {
  AUTH: {
    REGISTER: "/api/auth/register",
    PRELOGIN: "/api/auth/prelogin",
    LOGIN: "/api/auth/login",
    LOGOUT: "/api/auth/logout",
    ME: "/api/auth/me",
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
    { labelKey: "nav.dashboard", path: ROUTES.DASHBOARD, icon: LayoutDashboard },
    { labelKey: "nav.errors", path: ROUTES.ERRORS, icon: AlertTriangle },
  ] as NavigationItem[],
} as const;
