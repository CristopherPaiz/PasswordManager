import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Lock, LogOut, Fingerprint } from "lucide-react";
import { toast } from "sonner";
import { useGetQuery, useMutationQuery } from "@hooks/queries/core.queries";
import { useVaultStore } from "@store/vault.store";
import { useAuthStore } from "@store/auth.store";
import { API_ENDPOINTS } from "@constants/app.constants";
import { deriveLoginCredentials, openVaultKey } from "@utils/vault";
import { EncryptedBlob, KdfParams, deriveWrapKeyBytes } from "@utils/crypto";
import { getPasskeySecret, isPasskeySupported } from "@utils/webauthn";
import { Card } from "@components/ui/Card";
import { Input } from "@components/ui/Input";
import { Button } from "@components/ui/Button";

interface VaultKeysResponse {
  kdf_salt: string;
  kdf_params: KdfParams;
  wrapped_vault_key: EncryptedBlob | null;
  passkey_cred_id: string | null;
  wrapped_vault_key_passkey: EncryptedBlob | null;
}

export const UnlockVault = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const setVaultKey = useVaultStore((s) => s.setVaultKey);
  const { setAuthenticatedHint } = useAuthStore();

  const [masterPassword, setMasterPassword] = useState("");
  const [error, setError] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [isPasskeyWorking, setIsPasskeyWorking] = useState(false);

  const { data: keys, isLoading } = useGetQuery<VaultKeysResponse>({
    endpoint: API_ENDPOINTS.VAULT.KEYS,
  });

  const { mutateAsync: logout } = useMutationQuery({
    endpoint: API_ENDPOINTS.AUTH.LOGOUT,
    showToast: false,
  });

  const canUsePasskey =
    isPasskeySupported() && !!keys?.passkey_cred_id && !!keys?.wrapped_vault_key_passkey;

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keys?.wrapped_vault_key) return;
    setError("");
    setIsWorking(true);
    try {
      const { wrapKeyBytes } = await deriveLoginCredentials(
        masterPassword,
        keys.kdf_salt,
        keys.kdf_params,
      );
      // Si la maestra es incorrecta, el tag GCM falla y lanza → contraseña mala.
      const { key, raw } = await openVaultKey(keys.wrapped_vault_key, wrapKeyBytes);
      setVaultKey(key, raw);
      setMasterPassword("");
    } catch {
      setError(t("unlock.wrongPassword"));
    } finally {
      setIsWorking(false);
    }
  };

  const handlePasskeyUnlock = async () => {
    if (!keys?.passkey_cred_id || !keys?.wrapped_vault_key_passkey) return;
    setError("");
    setIsPasskeyWorking(true);
    try {
      const prfSecret = await getPasskeySecret(keys.passkey_cred_id);
      const wrapKey = await deriveWrapKeyBytes(prfSecret);
      const { key, raw } = await openVaultKey(keys.wrapped_vault_key_passkey, wrapKey);
      setVaultKey(key, raw);
    } catch {
      toast.error(t("unlock.passkeyError"));
    } finally {
      setIsPasskeyWorking(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout({});
    } finally {
      setAuthenticatedHint(false);
      queryClient.removeQueries({ queryKey: [API_ENDPOINTS.AUTH.ME] });
      toast.success(t("nav.logoutSuccess"));
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[70dvh] animate-in fade-in duration-300">
      <Card className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary-500/10">
            <Lock className="h-7 w-7 text-primary-500" />
          </div>
          <h2 className="text-2xl font-bold text-text-base">{t("unlock.title")}</h2>
          <p className="text-text-muted text-sm">{t("unlock.subtitle")}</p>
        </div>

        {canUsePasskey && (
          <Button
            type="button"
            variant="secondary"
            icon={Fingerprint}
            isLoading={isPasskeyWorking}
            onClick={handlePasskeyUnlock}
            className="w-full"
          >
            {t("unlock.usePasskey")}
          </Button>
        )}

        <form onSubmit={handleUnlock} className="space-y-5" noValidate>
          <Input
            label={t("unlock.masterPassword")}
            type="password"
            autoComplete="current-password"
            autoFocus
            disabled={isWorking || isLoading}
            error={error}
            value={masterPassword}
            onChange={(e) => setMasterPassword(e.target.value)}
          />

          <Button
            type="submit"
            isLoading={isWorking}
            disabled={isLoading || masterPassword.length === 0}
            icon={Lock}
            className="w-full"
          >
            {t("unlock.submit")}
          </Button>
        </form>

        <button
          type="button"
          onClick={handleLogout}
          className="mx-auto flex items-center gap-2 text-sm text-text-muted hover:text-text-base transition-colors cursor-pointer"
        >
          <LogOut className="h-4 w-4" />
          {t("nav.logoutFull")}
        </button>
      </Card>
    </div>
  );
};
