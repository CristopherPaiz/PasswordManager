import { useMemo, useState } from "react";
import { useNavigate, Navigate, Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, ArrowLeft, ArrowRight, Check, Copy, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useMutationQuery } from "@hooks/queries/core.queries";
import { useAuthQuery } from "@hooks/queries/auth.queries";
import { ROUTES, API_ENDPOINTS } from "@constants/app.constants";
import { createRecoverySchema, RecoveryForm } from "@validators/auth.schema";
import {
  recoverVaultKeyRaw,
  buildMasterReset,
  buildRecoveryRotation,
  MasterResetCrypto,
} from "@utils/vault";
import { deriveRecoveryAuth, recoveryKeyToBytes, EncryptedBlob } from "@utils/crypto";
import { Card } from "@components/ui/Card";
import { Input } from "@components/ui/Input";
import { Button } from "@components/ui/Button";

interface RecoveryStartResponse {
  wrapped_vault_key_recovery: EncryptedBlob;
}

// El reset ROTA la llave de recuperación: la usada queda quemada y se manda el
// blob + hash de una llave nueva (que se muestra al usuario una sola vez).
interface RecoveryResetPayload extends MasterResetCrypto {
  username: string;
  recovery_auth: string;
  wrapped_vault_key_recovery: EncryptedBlob;
  new_recovery_auth: string;
}

export const Recovery = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: authData, isLoading: isAuthLoading } = useAuthQuery();
  const [isWorking, setIsWorking] = useState(false);
  const [newRecoveryKey, setNewRecoveryKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [savedConfirmed, setSavedConfirmed] = useState(false);

  const schema = useMemo(() => createRecoverySchema(t), [t]);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RecoveryForm>({
    resolver: zodResolver(schema),
    defaultValues: { username: "", recoveryKey: "", password: "", confirmPassword: "" },
  });

  const { mutateAsync: recoveryStart } = useMutationQuery<RecoveryStartResponse, { username: string }>({
    endpoint: API_ENDPOINTS.AUTH.RECOVERY_START,
    showToast: false,
  });

  const { mutateAsync: recoveryReset } = useMutationQuery<{ message: string }, RecoveryResetPayload>({
    endpoint: API_ENDPOINTS.AUTH.RECOVERY_RESET,
    showToast: false,
  });

  const usernameField = register("username");

  if (isAuthLoading) return null;
  if (authData?.user) return <Navigate to={ROUTES.VAULT} replace />;

  const onSubmit = async (values: RecoveryForm) => {
    setIsWorking(true);
    try {
      const username = values.username.toLowerCase();
      const { wrapped_vault_key_recovery } = await recoveryStart({ username });

      // Desenvuelve la vaultKey con la llave de recuperación. Si es incorrecta,
      // el tag GCM falla aquí mismo.
      let vaultKeyRaw: Uint8Array;
      try {
        vaultKeyRaw = await recoverVaultKeyRaw(wrapped_vault_key_recovery, values.recoveryKey);
      } catch {
        setError("recoveryKey", { message: t("recovery.errors.keyInvalid") });
        return;
      }

      // Re-envuelve la misma vaultKey con la maestra nueva y autoriza el reset.
      const crypto = await buildMasterReset(values.password, vaultKeyRaw);
      const recovery_auth = await deriveRecoveryAuth(recoveryKeyToBytes(values.recoveryKey));

      // Rotación: la llave usada queda quemada; se genera y registra una nueva.
      const rotation = await buildRecoveryRotation(vaultKeyRaw);

      await recoveryReset({
        username,
        recovery_auth,
        ...crypto,
        wrapped_vault_key_recovery: rotation.wrapped_vault_key_recovery,
        new_recovery_auth: rotation.new_recovery_auth,
      });

      toast.success(t("recovery.success"));
      setNewRecoveryKey(rotation.recoveryKey);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("recovery.errors.generic"));
    } finally {
      setIsWorking(false);
    }
  };

  const handleCopyNewKey = async () => {
    if (!newRecoveryKey) return;
    await navigator.clipboard.writeText(newRecoveryKey);
    setCopied(true);
    toast.success(t("recovery.newKey.copied"));
    setTimeout(() => setCopied(false), 2000);
  };

  // ---- Paso 2: mostrar la NUEVA llave de recuperación (una sola vez) ----
  if (newRecoveryKey) {
    return (
      <div className="flex items-center justify-center min-h-[70dvh] animate-in fade-in duration-300">
        <Card className="w-full max-w-md space-y-6">
          <div className="flex items-start gap-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 p-4">
            <ShieldAlert className="w-6 h-6 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <h2 className="font-bold text-text-base">{t("recovery.newKey.title")}</h2>
              <p className="text-sm text-text-muted mt-1">{t("recovery.newKey.warning")}</p>
            </div>
          </div>

          <div className="rounded-xl border border-border-base bg-bg-base p-4">
            <p className="font-mono text-center text-lg tracking-wider text-text-base break-all select-all">
              {newRecoveryKey}
            </p>
          </div>

          <Button
            type="button"
            variant="secondary"
            icon={copied ? Check : Copy}
            onClick={handleCopyNewKey}
            className="w-full"
          >
            {copied ? t("recovery.newKey.copied") : t("recovery.newKey.copy")}
          </Button>

          <label className="flex items-start gap-3 cursor-pointer text-sm text-text-base">
            <input
              type="checkbox"
              checked={savedConfirmed}
              onChange={(e) => setSavedConfirmed(e.target.checked)}
              className="mt-1 h-4 w-4 accent-primary-500"
            />
            <span>{t("recovery.newKey.confirm")}</span>
          </label>

          <Button
            type="button"
            icon={ArrowRight}
            disabled={!savedConfirmed}
            onClick={() => navigate(ROUTES.LOGIN)}
            className="w-full"
          >
            {t("recovery.newKey.continue")}
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[70dvh] animate-in fade-in scale-in-95 duration-300">
      <Card className="w-full max-w-md space-y-6 shadow-xl shadow-primary-500/5">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-text-base">{t("recovery.title")}</h2>
          <p className="text-text-muted text-sm">{t("recovery.subtitle")}</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <Input
            label={t("recovery.username")}
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            disabled={isWorking}
            error={errors.username?.message}
            {...usernameField}
            onChange={(e) => {
              e.target.value = e.target.value.replace(/\s/g, "").toLowerCase();
              usernameField.onChange(e);
            }}
          />
          <Input
            label={t("recovery.recoveryKey")}
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="XXXX-XXXX-XXXX-..."
            disabled={isWorking}
            error={errors.recoveryKey?.message}
            {...register("recoveryKey")}
          />
          <Input
            label={t("recovery.newPassword")}
            type="password"
            autoComplete="new-password"
            disabled={isWorking}
            error={errors.password?.message}
            {...register("password")}
          />
          <Input
            label={t("recovery.confirmPassword")}
            type="password"
            autoComplete="new-password"
            disabled={isWorking}
            error={errors.confirmPassword?.message}
            {...register("confirmPassword")}
          />

          <Button type="submit" isLoading={isWorking} icon={KeyRound} className="w-full">
            {t("recovery.submit")}
          </Button>
        </form>

        <Link
          to={ROUTES.LOGIN}
          className="flex items-center justify-center gap-2 text-sm text-text-muted hover:text-text-base transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("recovery.backToLogin")}
        </Link>
      </Card>
    </div>
  );
};
