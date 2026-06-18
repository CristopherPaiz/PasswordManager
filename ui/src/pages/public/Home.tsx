import { LogIn, LayoutDashboard } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ROUTES } from "@constants/app.constants";
import { useAuthQuery } from "@hooks/queries/auth.queries";
import { LinkButton } from "@components/ui/Button";

export const Home = () => {
  const { t } = useTranslation();
  const { data } = useAuthQuery();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60dvh] gap-6 text-center animate-in fade-in duration-500">
      <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-text-base tracking-tight transition-all">
        {t("home.welcome")} <span className="text-primary-500">{t("home.brand")}</span>
      </h1>
      <p className="text-base md:text-lg text-text-muted max-w-2xl px-4 md:px-0">{t("home.subtitle")}</p>

      <div className="mt-8 w-full px-4 sm:px-0 sm:w-auto flex flex-col sm:flex-row gap-4 justify-center">
        {data?.user ? (
          <LinkButton to={ROUTES.DASHBOARD} size="lg" icon={LayoutDashboard}>
            {t("home.goToDashboard")}
          </LinkButton>
        ) : (
          <LinkButton to={ROUTES.LOGIN} variant="secondary" size="lg" icon={LogIn}>
            {t("home.login")}
          </LinkButton>
        )}
      </div>
    </div>
  );
};
