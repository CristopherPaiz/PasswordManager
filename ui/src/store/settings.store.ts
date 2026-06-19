import { create } from "zustand";
import { persist } from "zustand/middleware";
import { STORAGE_KEYS, ROUTES } from "@constants/app.constants";

// Preferencias de UI del usuario (solo cliente, persistidas en localStorage).
interface SettingsState {
  autoLockMinutes: number; // inactividad antes de bloquear el baúl
  startPage: string; // ruta a la que entrar tras autenticarse
  setAutoLockMinutes: (minutes: number) => void;
  setStartPage: (path: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      autoLockMinutes: 10,
      startPage: ROUTES.VAULT,
      setAutoLockMinutes: (minutes) => set({ autoLockMinutes: minutes }),
      setStartPage: (path) => set({ startPage: path }),
    }),
    { name: STORAGE_KEYS.SETTINGS },
  ),
);
