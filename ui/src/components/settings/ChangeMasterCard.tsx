import { useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { useGetQuery, useMutationQuery } from "@hooks/queries/core.queries";
import { useVaultStore } from "@store/vault.store";
import { API_ENDPOINTS } from "@constants/app.constants";
import { deriveLoginCredentials, buildMasterReset, MasterResetCrypto } from "@utils/vault";
import { KdfParams } from "@utils/crypto";
import { isMasterAcceptable } from "@utils/password-strength";
import { Card, CardTitle } from "@components/ui/Card";
import { Input } from "@components/ui/Input";
import { Button } from "@components/ui/Button";

interface VaultKeysResponse {
  kdf_salt: string;
  kdf_params: KdfParams;
}

interface ChangeMasterPayload extends MasterResetCrypto {
  current_password: string;
}

export const ChangeMasterCard = () => {
  const { t } = useTranslation();
  const vaultKeyRaw = useVaultStore((s) => s.vaultKeyRaw);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isWorking, setIsWorking] = useState(false);

  const { data: keys } = useGetQuery<VaultKeysResponse>({ endpoint: API_ENDPOINTS.VAULT.KEYS });

  const { mutateAsync: changeMaster } = useMutationQuery<{ message: string }, ChangeMasterPayload>({
    endpoint: API_ENDPOINTS.AUTH.MASTER,
    method: "put",
    messageSuccess: t("settings.master.success"),
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vaultKeyRaw || !keys) {
      toast.error(t("settings.master.needUnlock"));
      return;
    }
    if (next.length < 12) {
      toast.error(t("register.errors.passwordShort"));
      return;
    }
    if (!isMasterAcceptable(next)) {
      toast.error(t("register.errors.passwordWeak"));
      return;
    }
    if (next !== confirm) {
      toast.error(t("register.errors.passwordMismatch"));
      return;
    }
    setIsWorking(true);
    try {
      // Verifica la maestra actual (authHash) y re-envuelve la vaultKey con la nueva.
      const { authHash } = await deriveLoginCredentials(current, keys.kdf_salt, keys.kdf_params);
      const crypto = await buildMasterReset(next, vaultKeyRaw);
      await changeMaster({ current_password: authHash, ...crypto });
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch {
      // El toast del hook ya muestra el error del server (ej. maestra incorrecta).
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-primary-500" />
        <CardTitle className="mb-0">{t("settings.master.title")}</CardTitle>
      </div>
      <p className="text-sm text-text-muted">{t("settings.master.description")}</p>

      {!vaultKeyRaw ? (
        <p className="rounded-xl bg-bg-base p-3 text-sm text-text-muted">
          {t("settings.master.needUnlock")}
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Input
            label={t("settings.master.current")}
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
          <Input
            label={t("settings.master.new")}
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
          <Input
            label={t("settings.master.confirm")}
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <Button
            type="submit"
            icon={KeyRound}
            isLoading={isWorking}
            disabled={!current || !next || !confirm}
          >
            {t("settings.master.submit")}
          </Button>
        </form>
      )}
    </Card>
  );
};
