import { create } from "zustand";

/**
 * Guarda la vaultKey SOLO en memoria. Nunca se persiste: al recargar la página
 * o cerrar la pestaña se pierde → el baúl queda "bloqueado" aunque la sesión
 * (cookie) siga viva. Esto es auto-lock por diseño.
 *
 * - `vaultKey`: CryptoKey AES-GCM para cifrar/descifrar items.
 * - `vaultKeyRaw`: los mismos 32 bytes en crudo, necesarios para RE-envolver la
 *   vaultKey (registrar passkey, etc.). También solo en memoria.
 * - `pendingSync`: hubo una escritura local (alta, edición, borrado, import) y
 *   el manifiesto de integridad todavía no se re-firmó. Sin esta marca, el
 *   verificador confundiría un cambio propio con una manipulación del server.
 */
interface VaultState {
  vaultKey: CryptoKey | null;
  vaultKeyRaw: Uint8Array | null;
  isUnlocked: boolean;
  pendingSync: boolean;
  setVaultKey: (key: CryptoKey, raw: Uint8Array) => void;
  markPendingSync: () => void;
  clearPendingSync: () => void;
  lock: () => void;
}

export const useVaultStore = create<VaultState>((set) => ({
  vaultKey: null,
  vaultKeyRaw: null,
  isUnlocked: false,
  pendingSync: false,
  setVaultKey: (key, raw) => set({ vaultKey: key, vaultKeyRaw: raw, isUnlocked: true }),
  markPendingSync: () => set({ pendingSync: true }),
  clearPendingSync: () => set({ pendingSync: false }),
  // `pendingSync` NO se limpia al bloquear: si el baúl se bloquea antes de
  // re-firmar, el manifiesto sigue pendiente y se escribe al desbloquear.
  lock: () => set({ vaultKey: null, vaultKeyRaw: null, isUnlocked: false }),
}));
