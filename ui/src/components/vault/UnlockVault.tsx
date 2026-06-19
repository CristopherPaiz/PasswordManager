import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Lock, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useGetQuery, useMutationQuery } from "@hooks/queries/core.queries";
import { useVaultStore } from "@store/vault.store";
import { useAuthStore } from "@store/auth.store";
import { API_ENDPOINTS } from "@constants/app.constants";
import { deriveLoginCredentials, openVaultKey } from "@utils/vault";
import { EncryptedBlob, KdfParams } from "@utils/crypto";
import { Card } from "@components/ui/Card";
import { Input } from "@components/ui/Input";
import { Button } from "@components/ui/Button";

interface VaultKeysResponse {
  kdf_salt: string;
  kdf_params: KdfParams;
  wrapped_vault_key: EncryptedBlob | null;
}

export const UnlockVault = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const setVaultKey = useVaultStore((s) => s.setVaultKey);
  const { setAuthenticatedHint } = useAuthStore();

  const [masterPassword, setMasterPassword] = useState("");
  const [error, setError] = useState("");
  const [isWorking, setIsWorking] = useState(false);

  // La sesión (cookie) ya es válida: pedimos los params para re-derivar la llave.
  const { data: keys, isLoading } = useGetQuery<VaultKeysResponse>({
    endpoint: API_ENDPOINTS.VAULT.KEYS,
  });

  const { mutateAsync: logout } = useMutationQuery({
    endpoint: API_ENDPOINTS.AUTH.LOGOUT,
    showToast: false,
  });

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
      const vaultKey = await openVaultKey(keys.wrapped_vault_key, wrapKeyBytes);
      setVaultKey(vaultKey);
      setMasterPassword("");
    } catch {
      setError(t("unlock.wrongPassword"));
    } finally {
      setIsWorking(false);
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
