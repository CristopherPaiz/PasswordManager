import { useMemo, useState } from "react";
import { useNavigate, Navigate, Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { UserPlus, ShieldAlert, Copy, Check, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useMutationQuery } from "@hooks/queries/core.queries";
import { useAuthQuery } from "@hooks/queries/auth.queries";
import { useAuthStore } from "@store/auth.store";
import { useVaultStore } from "@store/vault.store";
import { ROUTES, API_ENDPOINTS } from "@constants/app.constants";
import { createRegisterSchema, RegisterForm } from "@validators/auth.schema";
import { buildRegistration, RegistrationCrypto } from "@utils/vault";
import { User } from "@apptypes";
import { Card } from "@components/ui/Card";
import { Input } from "@components/ui/Input";
import { Button } from "@components/ui/Button";

interface RegisterPayload extends RegistrationCrypto {
  username: string;
  email: string;
}

interface PendingUnlock {
  username: string;
  authHash: string;
  vaultCryptoKey: CryptoKey;
}

export const Register = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: authData, isLoading: isAuthLoading } = useAuthQuery();
  const { setAuthenticatedHint } = useAuthStore();
  const setVaultKey = useVaultStore((s) => s.setVaultKey);

  const [isWorking, setIsWorking] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [savedConfirmed, setSavedConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState<PendingUnlock | null>(null);

  const schema = useMemo(() => createRegisterSchema(t), [t]);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(schema),
    defaultValues: { username: "", email: "", password: "", confirmPassword: "" },
  });

  const { mutateAsync: registerAccount } = useMutationQuery<{ message: string }, RegisterPayload>({
    endpoint: API_ENDPOINTS.AUTH.REGISTER,
    showToast: false,
  });

  const { mutateAsync: login } = useMutationQuery<
    { message: string; user: User },
    { username: string; password: string }
  >({
    endpoint: API_ENDPOINTS.AUTH.LOGIN,
    invalidateQueryKey: [API_ENDPOINTS.AUTH.ME],
    showToast: false,
  });

  const usernameField = register("username");

  if (isAuthLoading) return null;
  if (authData?.user) return <Navigate to={ROUTES.VAULT} replace />;

  const onSubmit = async (values: RegisterForm) => {
    setIsWorking(true);
    try {
      // Toda la cripto se construye en el navegador a partir de la maestra.
      const built = await buildRegistration(values.password);

      await registerAccount({
        username: values.username.toLowerCase(),
        email: values.email,
        ...built.crypto,
      });

      setPending({
        username: values.username.toLowerCase(),
        authHash: built.crypto.password,
        vaultCryptoKey: built.vaultCryptoKey,
      });
      setRecoveryKey(built.recoveryKey);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("register.genericError"));
    } finally {
      setIsWorking(false);
    }
  };

  const handleCopy = async () => {
    if (!recoveryKey) return;
    await navigator.clipboard.writeText(recoveryKey);
    setCopied(true);
    toast.success(t("register.recovery.copied"));
    setTimeout(() => setCopied(false), 2000);
  };

  const handleContinue = async () => {
    if (!pending) return;
    setIsWorking(true);
    try {
      await login({ username: pending.username, password: pending.authHash });
      setVaultKey(pending.vaultCryptoKey);
      setAuthenticatedHint(true);
      navigate(ROUTES.VAULT);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("register.genericError"));
    } finally {
      setIsWorking(false);
    }
  };

  // ---- Paso 2: mostrar la llave de recuperación (una sola vez) ----
  if (recoveryKey) {
    return (
      <div className="flex items-center justify-center min-h-[70dvh] animate-in fade-in duration-300">
        <Card className="w-full max-w-md space-y-6">
          <div className="flex items-start gap-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 p-4">
            <ShieldAlert className="w-6 h-6 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <h2 className="font-bold text-text-base">{t("register.recovery.title")}</h2>
              <p className="text-sm text-text-muted mt-1">{t("register.recovery.warning")}</p>
            </div>
          </div>

          <div className="rounded-xl border border-border-base bg-bg-base p-4">
            <p className="font-mono text-center text-lg tracking-wider text-text-base break-all select-all">
              {recoveryKey}
            </p>
          </div>

          <Button
            type="button"
            variant="secondary"
            icon={copied ? Check : Copy}
            onClick={handleCopy}
            className="w-full"
          >
            {copied ? t("register.recovery.copied") : t("register.recovery.copy")}
          </Button>

          <label className="flex items-start gap-3 cursor-pointer text-sm text-text-base">
            <input
              type="checkbox"
              checked={savedConfirmed}
              onChange={(e) => setSavedConfirmed(e.target.checked)}
              className="mt-1 h-4 w-4 accent-primary-500"
            />
            <span>{t("register.recovery.confirm")}</span>
          </label>

          <Button
            type="button"
            icon={ArrowRight}
            disabled={!savedConfirmed}
            isLoading={isWorking}
            onClick={handleContinue}
            className="w-full"
          >
            {t("register.recovery.continue")}
          </Button>
        </Card>
      </div>
    );
  }

  // ---- Paso 1: formulario ----
  return (
    <div className="flex items-center justify-center min-h-[70dvh] animate-in fade-in scale-in-95 duration-300">
      <Card className="w-full max-w-md space-y-8 shadow-xl shadow-primary-500/5">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-text-base">{t("register.title")}</h2>
          <p className="text-text-muted mt-2">{t("register.subtitle")}</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <Input
            label={t("register.username")}
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
            label={t("register.email")}
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            disabled={isWorking}
            error={errors.email?.message}
            {...register("email")}
          />

          <Input
            label={t("register.masterPassword")}
            type="password"
            autoComplete="new-password"
            disabled={isWorking}
            error={errors.password?.message}
            {...register("password")}
          />

          <Input
            label={t("register.confirmPassword")}
            type="password"
            autoComplete="new-password"
            disabled={isWorking}
            error={errors.confirmPassword?.message}
            {...register("confirmPassword")}
          />

          <p className="text-xs text-text-muted leading-relaxed">{t("register.masterHint")}</p>

          <Button type="submit" isLoading={isWorking} icon={UserPlus} className="w-full mt-2">
            {t("register.submit")}
          </Button>
        </form>

        <p className="text-center text-sm text-text-muted">
          {t("register.haveAccount")}{" "}
          <Link to={ROUTES.LOGIN} className="font-semibold text-primary-500 hover:text-primary-600">
            {t("register.signIn")}
          </Link>
        </p>
      </Card>
    </div>
  );
};
