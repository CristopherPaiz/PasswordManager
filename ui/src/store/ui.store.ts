import { create } from "zustand";
import { persist } from "zustand/middleware";
import { STORAGE_KEYS, THEMES } from "@constants/app.constants";

type ThemeType = typeof THEMES.LIGHT | typeof THEMES.DARK;

interface UiState {
  theme: ThemeType;
  toggleTheme: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: THEMES.LIGHT,
      toggleTheme: () =>
        set((state) => ({
          theme: state.theme === THEMES.LIGHT ? THEMES.DARK : THEMES.LIGHT,
        })),
    }),
    {
      name: STORAGE_KEYS.THEME,
    },
  ),
);
