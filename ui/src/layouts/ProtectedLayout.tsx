import { Navigate, Outlet } from "react-router";
import { useTranslation } from "react-i18next";
import { useAuthQuery } from "@hooks/queries/auth.queries";
import { useAutoLock } from "@hooks/useAutoLock";
import { useSettingsStore } from "@store/settings.store";
import { ROUTES } from "@constants/app.constants";

export const ProtectedLayout = () => {
  const { t } = useTranslation();
  const { data, isLoading } = useAuthQuery();
  const autoLockMinutes = useSettingsStore((s) => s.autoLockMinutes);
  useAutoLock(autoLockMinutes * 60000);

  if (isLoading) {
    return (
      <div className="flex h-[60dvh] w-full items-center justify-center">
        <span className="text-lg font-medium text-text-muted">{t("common.verifying")}</span>
      </div>
    );
  }

  if (!data?.user) {
    return <Navigate to={ROUTES.LOGIN} replace />;
  }

  return (
    <div className="animate-in fade-in duration-300">
      <Outlet />
    </div>
  );
};
