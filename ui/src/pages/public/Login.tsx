import { useMemo, useState } from "react";
import { useNavigate, Navigate, Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LogIn } from "lucide-react";
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
  message: string;
  user: User;
  wrapped_vault_key: EncryptedBlob | null;
}

export const Login = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: authData, isLoading: isAuthLoading } = useAuthQuery();
  const { setAuthenticatedHint } = useAuthStore();
  const setVaultKey = useVaultStore((s) => s.setVaultKey);

  const [isWorking, setIsWorking] = useState(false);

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

  const { mutateAsync: prelogin } = useMutationQuery<PreloginResponse, { username: string }>({
    endpoint: API_ENDPOINTS.AUTH.PRELOGIN,
    showToast: false,
  });

  const { mutateAsync: login } = useMutationQuery<LoginResponse, { username: string; password: string }>({
    endpoint: API_ENDPOINTS.AUTH.LOGIN,
    invalidateQueryKey: [API_ENDPOINTS.AUTH.ME],
    showToast: false,
  });

  const usernameField = register("username");

  if (isAuthLoading) return null;
  if (authData?.user) return <Navigate to={ROUTES.VAULT} replace />;

  const onSubmit = async (values: LoginForm) => {
    setIsWorking(true);
    try {
      // 1. Pedir salt + params (no secreto) para poder derivar.
      const params = await prelogin({ username: values.username });

      // 2. Derivar authHash (login) y wrapKey (abrir baúl) desde la maestra.
      const { authHash, wrapKeyBytes } = await deriveLoginCredentials(
        values.password,
        params.kdf_salt,
        params.kdf_params,
      );

      // 3. Login con el authHash. El server bcrypt-ea y devuelve la vaultKey envuelta.
      const res = await login({ username: values.username, password: authHash });

      // 4. Desenvolver la vaultKey en memoria.
      if (res.wrapped_vault_key) {
        const vaultKey = await openVaultKey(res.wrapped_vault_key, wrapKeyBytes);
        setVaultKey(vaultKey);
      }

      setAuthenticatedHint(true);
      navigate(ROUTES.VAULT);
    } catch {
      // prelogin (404) o login (401) fallan con credenciales malas.
      setError("password", { message: t("login.invalidCredentials") });
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[70dvh] animate-in fade-in scale-in-95 duration-300">
      <Card className="w-full max-w-md space-y-8 shadow-xl shadow-primary-500/5">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-text-base">{t("login.title")}</h2>
          <p className="text-text-muted mt-2">{t("login.subtitle")}</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
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

          <Button type="submit" isLoading={isWorking} icon={LogIn} className="w-full mt-4">
            {t("login.submit")}
          </Button>
        </form>

        <p className="text-center text-sm text-text-muted">
          {t("login.noAccount")}{" "}
          <Link to={ROUTES.REGISTER} className="font-semibold text-primary-500 hover:text-primary-600">
            {t("login.createAccount")}
          </Link>
        </p>
      </Card>
    </div>
  );
};
