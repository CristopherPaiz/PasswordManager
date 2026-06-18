import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
  isAuthenticatedHint: boolean;
  setAuthenticatedHint: (val: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticatedHint: false,
      setAuthenticatedHint: (val) => set({ isAuthenticatedHint: val }),
    }),
    { name: "auth_hint" },
  ),
);
