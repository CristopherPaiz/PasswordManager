import { create } from "zustand";

/**
 * Guarda la vaultKey (CryptoKey AES-GCM) SOLO en memoria. Nunca se persiste:
 * al recargar la página o cerrar la pestaña se pierde → el baúl queda
 * "bloqueado" aunque la sesión (cookie) siga viva. Esto es auto-lock por diseño.
 */
interface VaultState {
  vaultKey: CryptoKey | null;
  isUnlocked: boolean;
  setVaultKey: (key: CryptoKey) => void;
  lock: () => void;
}

export const useVaultStore = create<VaultState>((set) => ({
  vaultKey: null,
  isUnlocked: false,
  setVaultKey: (key) => set({ vaultKey: key, isUnlocked: true }),
  lock: () => set({ vaultKey: null, isUnlocked: false }),
}));
