import { useMemo } from "react";
import { useNavigate, Navigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LogIn } from "lucide-react";
import { useMutationQuery } from "@hooks/queries/core.queries";
import { useAuthQuery } from "@hooks/queries/auth.queries";
import { useAuthStore } from "@store/auth.store";
import { ROUTES, API_ENDPOINTS } from "@constants/app.constants";
import { createLoginSchema, LoginForm } from "@validators/auth.schema";
import { Card } from "@components/ui/Card";
import { Input } from "@components/ui/Input";
import { Button } from "@components/ui/Button";

export const Login = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: authData, isLoading: isAuthLoading } = useAuthQuery();
  const { setAuthenticatedHint } = useAuthStore();

  const schema = useMemo(() => createLoginSchema(t), [t]);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(schema),
    defaultValues: { username: "", password: "" },
  });

  const { mutateAsync: login, isPending } = useMutationQuery({
    endpoint: API_ENDPOINTS.AUTH.LOGIN,
    invalidateQueryKey: [API_ENDPOINTS.AUTH.ME],
    messageSuccess: t("login.success"),
  });

  const usernameField = register("username");

  if (isAuthLoading) {
    return null;
  }

  if (authData?.user) {
    return <Navigate to={ROUTES.DASHBOARD} replace />;
  }

  const onSubmit = async (values: LoginForm) => {
    try {
      await login(values);
      setAuthenticatedHint(true);
      navigate(ROUTES.DASHBOARD);
    } catch {
      // El error ya se muestra mediante el toast de useMutationQuery.
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
            disabled={isPending}
            error={errors.username?.message}
            {...usernameField}
            onChange={(e) => {
              // Sanea en vivo: sin espacios y siempre en minúsculas.
              e.target.value = e.target.value.replace(/\s/g, "").toLowerCase();
              usernameField.onChange(e);
            }}
          />

          <Input
            label={t("login.password")}
            type="password"
            autoComplete="current-password"
            disabled={isPending}
            error={errors.password?.message}
            {...register("password")}
          />

          <Button type="submit" isLoading={isPending} icon={LogIn} className="w-full mt-4">
            {t("login.submit")}
          </Button>
        </form>
      </Card>
    </div>
  );
};
