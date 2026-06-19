import { create } from "zustand";

/**
 * Guarda la vaultKey SOLO en memoria. Nunca se persiste: al recargar la página
 * o cerrar la pestaña se pierde → el baúl queda "bloqueado" aunque la sesión
 * (cookie) siga viva. Esto es auto-lock por diseño.
 *
 * - `vaultKey`: CryptoKey AES-GCM para cifrar/descifrar items.
 * - `vaultKeyRaw`: los mismos 32 bytes en crudo, necesarios para RE-envolver la
 *   vaultKey (registrar passkey, etc.). También solo en memoria.
 */
interface VaultState {
  vaultKey: CryptoKey | null;
  vaultKeyRaw: Uint8Array | null;
  isUnlocked: boolean;
  setVaultKey: (key: CryptoKey, raw: Uint8Array) => void;
  lock: () => void;
}

export const useVaultStore = create<VaultState>((set) => ({
  vaultKey: null,
  vaultKeyRaw: null,
  isUnlocked: false,
  setVaultKey: (key, raw) => set({ vaultKey: key, vaultKeyRaw: raw, isUnlocked: true }),
  lock: () => set({ vaultKey: null, vaultKeyRaw: null, isUnlocked: false }),
}));
