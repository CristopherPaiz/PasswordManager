import { Home } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ROUTES } from "@constants/app.constants";
import { LinkButton } from "@components/ui/Button";

export const NotFound = () => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60dvh] gap-4 text-center animate-in fade-in duration-300">
      <p className="text-7xl font-semibold text-primary-500">
        {t("notFound.code")}
      </p>
      <h1 className="text-subheading md:text-3xl font-medium text-text-base">
        {t("notFound.title")}
      </h1>
      <p className="text-text-muted max-w-md px-4">
        {t("notFound.description")}
      </p>
      <LinkButton to={ROUTES.HOME} icon={Home} className="mt-2">
        {t("notFound.back")}
      </LinkButton>
    </div>
  );
};
