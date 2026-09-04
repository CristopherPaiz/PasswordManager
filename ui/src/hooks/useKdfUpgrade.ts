import { useCallback } from "react";
import { useMutationQuery } from "@hooks/queries/core.queries";
import { API_ENDPOINTS } from "@constants/app.constants";
import { buildKdfUpgrade, isKdfOutdated } from "@utils/vault";
import { EncryptedBlob, KdfParams } from "@utils/crypto";

interface KdfUpgradePayload {
  current_password: string;
  password: string;
  kdf_salt: string;
  kdf_params: KdfParams;
  wrapped_vault_key: EncryptedBlob;
}

interface UpgradeArgs {
  masterPassword: string;
  currentParams: KdfParams;
  currentAuthHash: string;
  vaultKeyRaw: Uint8Array;
}

/**
 * Endurece el Argon2id de una cuenta vieja en el único momento en que se puede:
 * justo después de un desbloqueo con la maestra, cuando el navegador tiene a la
 * vez la contraseña y la vaultKey abierta.
 *
 * Es silencioso y best-effort: si falla (red caída, sesión vencida) no se le
 * dice nada al usuario y se reintenta en el siguiente desbloqueo. No cambia la
 * contraseña maestra ni la vaultKey, así que la llave de recuperación y las
 * passkeys siguen sirviendo igual.
 *
 * Con passkey no aplica: ahí no pasa la maestra por el navegador.
 */
export const useKdfUpgrade = () => {
  const { mutateAsync } = useMutationQuery<{ message: string }, KdfUpgradePayload>({
    endpoint: API_ENDPOINTS.AUTH.KDF,
    method: "put",
    invalidateQueryKey: [API_ENDPOINTS.VAULT.KEYS],
    showToast: false,
  });

  return useCallback(
    async ({
      masterPassword,
      currentParams,
      currentAuthHash,
      vaultKeyRaw,
    }: UpgradeArgs): Promise<boolean> => {
      if (!isKdfOutdated(currentParams)) return false;
      try {
        const payload = await buildKdfUpgrade(masterPassword, vaultKeyRaw, currentAuthHash);
        await mutateAsync(payload);
        return true;
      } catch {
        return false;
      }
    },
    [mutateAsync],
  );
};
