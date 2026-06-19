import { useMemo, useState } from "react";
import { useNavigate, Navigate, Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useMutationQuery } from "@hooks/queries/core.queries";
import { useAuthQuery } from "@hooks/queries/auth.queries";
import { ROUTES, API_ENDPOINTS } from "@constants/app.constants";
import { createRecoverySchema, RecoveryForm } from "@validators/auth.schema";
import { recoverVaultKeyRaw, buildMasterReset, MasterResetCrypto } from "@utils/vault";
import { deriveRecoveryAuth, recoveryKeyToBytes, EncryptedBlob } from "@utils/crypto";
import { Card } from "@components/ui/Card";
import { Input } from "@components/ui/Input";
import { Button } from "@components/ui/Button";

interface RecoveryStartResponse {
  wrapped_vault_key_recovery: EncryptedBlob;
}

interface RecoveryResetPayload extends MasterResetCrypto {
  username: string;
  recovery_auth: string;
}

export const Recovery = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: authData, isLoading: isAuthLoading } = useAuthQuery();
  const [isWorking, setIsWorking] = useState(false);

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

      await recoveryReset({ username, recovery_auth, ...crypto });

      toast.success(t("recovery.success"));
      navigate(ROUTES.LOGIN);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("recovery.errors.generic"));
    } finally {
      setIsWorking(false);
    }
  };

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
