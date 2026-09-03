import { useMemo, useState } from "react";
import { useNavigate, Navigate, Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LogIn, ShieldCheck } from "lucide-react";
import { useMutationQuery } from "@hooks/queries/core.queries";
import { useAuthQuery } from "@hooks/queries/auth.queries";
import { useAuthStore } from "@store/auth.store";
import { useVaultStore } from "@store/vault.store";
import { ROUTES, API_ENDPOINTS } from "@constants/app.constants";
import { createLoginSchema, LoginForm } from "@validators/auth.schema";
import { deriveLoginCredentials, openVaultKey } from "@utils/vault";
import { EncryptedBlob, KdfParams } from "@utils/crypto";
import { User } from "@apptypes";
import { Card } from "@components/ui/Card";
import { Input } from "@components/ui/Input";
import { Button } from "@components/ui/Button";

interface PreloginResponse {
  kdf_salt: string;
  kdf_params: KdfParams;
}

interface LoginResponse {
  message?: string;
  user?: User;
  wrapped_vault_key?: EncryptedBlob | null;
  totpRequired?: boolean;
}

interface PendingTotp {
  username: string;
  authHash: string;
  wrapKeyBytes: Uint8Array;
}

export const Login = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: authData, isLoading: isAuthLoading } = useAuthQuery();
  const { setAuthenticatedHint } = useAuthStore();
  const setVaultKey = useVaultStore((s) => s.setVaultKey);

  const [isWorking, setIsWorking] = useState(false);
  const [pending, setPending] = useState<PendingTotp | null>(null);
  const [totp, setTotp] = useState("");
  const [totpError, setTotpError] = useState("");

  const schema = useMemo(() => createLoginSchema(t), [t]);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(schema),
    defaultValues: { username: "", password: "" },
  });

  const { mutateAsync: prelogin } = useMutationQuery<
    PreloginResponse,
    { username: string }
  >({
    endpoint: API_ENDPOINTS.AUTH.PRELOGIN,
    showToast: false,
  });

  const { mutateAsync: login } = useMutationQuery<
    LoginResponse,
    { username: string; password: string; token?: string }
  >({
    endpoint: API_ENDPOINTS.AUTH.LOGIN,
    invalidateQueryKey: [API_ENDPOINTS.AUTH.ME],
    showToast: false,
  });

  const usernameField = register("username");

  if (isAuthLoading) return null;
  if (authData?.user) return <Navigate to={ROUTES.VAULT} replace />;

  // Desbloquea el baúl con la wrapKey ya derivada y navega.
  const finishLogin = async (res: LoginResponse, wrapKeyBytes: Uint8Array) => {
    if (res.wrapped_vault_key) {
      const { key, raw } = await openVaultKey(
        res.wrapped_vault_key,
        wrapKeyBytes,
      );
      setVaultKey(key, raw);
    }
    setAuthenticatedHint(true);
    navigate(ROUTES.VAULT);
  };

  const onSubmit = async (values: LoginForm) => {
    setIsWorking(true);
    try {
      const params = await prelogin({ username: values.username });
      const { authHash, wrapKeyBytes } = await deriveLoginCredentials(
        values.password,
        params.kdf_salt,
        params.kdf_params,
      );
      const res = await login({
        username: values.username,
        password: authHash,
      });

      if (res.totpRequired) {
        // La cuenta tiene 2FA: guarda lo derivado y pide el código.
        setPending({ username: values.username, authHash, wrapKeyBytes });
        return;
      }
      await finishLogin(res, wrapKeyBytes);
    } catch {
      setError("password", { message: t("login.invalidCredentials") });
    } finally {
      setIsWorking(false);
    }
  };

  const onSubmitTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pending) return;
    setTotpError("");
    setIsWorking(true);
    try {
      const res = await login({
        username: pending.username,
        password: pending.authHash,
        token: totp,
      });
      await finishLogin(res, pending.wrapKeyBytes);
    } catch {
      setTotpError(t("login.totpInvalid"));
    } finally {
      setIsWorking(false);
    }
  };

  // ---- Paso 2FA ----
  if (pending) {
    return (
      <div className="flex items-center justify-center min-h-[70dvh] animate-in fade-in duration-300">
        <Card className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary-500/10">
              <ShieldCheck className="h-7 w-7 text-primary-500" />
            </div>
            <h2 className="text-subheading font-medium text-text-base">
              {t("login.totpTitle")}
            </h2>
            <p className="text-text-muted text-body">
              {t("login.totpSubtitle")}
            </p>
          </div>
          <form onSubmit={onSubmitTotp} className="space-y-5" noValidate>
            <Input
              label={t("login.totpCode")}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              disabled={isWorking}
              error={totpError}
              value={totp}
              onChange={(e) =>
                setTotp(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
            />
            <Button
              type="submit"
              isLoading={isWorking}
              disabled={totp.length !== 6}
              icon={ShieldCheck}
              className="w-full"
            >
              {t("login.totpSubmit")}
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  // ---- Paso credenciales ----
  return (
    <div className="flex items-center justify-center min-h-[70dvh] animate-in fade-in scale-in-95 duration-300">
      <Card className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h2 className="text-heading font-medium text-text-base">
            {t("login.title")}
          </h2>
          <p className="text-text-muted mt-2">{t("login.subtitle")}</p>
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-5"
          noValidate
        >
          <Input
            label={t("login.username")}
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
            label={t("login.masterPassword")}
            type="password"
            autoComplete="current-password"
            disabled={isWorking}
            error={errors.password?.message}
            {...register("password")}
          />

          <Button
            type="submit"
            isLoading={isWorking}
            icon={LogIn}
            className="w-full mt-4"
          >
            {t("login.submit")}
          </Button>
        </form>

        <div className="space-y-2 text-center text-body text-text-muted">
          <p>
            {t("login.noAccount")}{" "}
            <Link
              to={ROUTES.REGISTER}
              className="font-semibold text-primary-500 hover:text-primary-600"
            >
              {t("login.createAccount")}
            </Link>
          </p>
          <p>
            <Link
              to={ROUTES.RECOVERY}
              className="text-primary-500 hover:text-primary-600"
            >
              {t("login.forgotMaster")}
            </Link>
          </p>
        </div>
      </Card>
    </div>
  );
};
