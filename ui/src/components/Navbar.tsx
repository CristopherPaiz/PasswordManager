import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import {
  Menu,
  X,
  LogOut,
  User as UserIcon,
  Languages,
  Loader2,
} from "lucide-react";
import { useAuthQuery } from "@hooks/queries/auth.queries";
import { useMutationQuery, useGetQuery } from "@hooks/queries/core.queries";
import { useUiStore } from "@store/ui.store";
import { useAuthStore } from "@store/auth.store";
import { useVaultStore } from "@store/vault.store";
import {
  ROUTES,
  API_ENDPOINTS,
  THEMES,
  NAVIGATION,
  navigationFor,
  LANGUAGES,
} from "@constants/app.constants";
import { useQueryClient } from "@tanstack/react-query";
import { ApiResponse } from "@apptypes";
import { Skeleton } from "./ui/Skeleton";

export const Navbar = () => {
  const { t, i18n } = useTranslation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { data, isLoading } = useAuthQuery();
  const { theme, toggleTheme } = useUiStore();
  const { setAuthenticatedHint } = useAuthStore();
  const lockVault = useVaultStore((s) => s.lock);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: configData } = useGetQuery<ApiResponse<Record<string, string>>>(
    {
      endpoint: API_ENDPOINTS.CONFIG.GET_ALL,
      staleTime: Infinity,
      showToast: false,
    },
  );

  const { mutateAsync: logout, isPending: isLoggingOut } = useMutationQuery({
    endpoint: API_ENDPOINTS.AUTH.LOGOUT,
    messageSuccess: t("nav.logoutSuccess"),
  });

  const user = data?.user;
  const appName = configData?.data?.nombreApp || t("common.appName");

  const currentLang = i18n.language.startsWith("es")
    ? LANGUAGES.ES
    : LANGUAGES.EN;
  const toggleLanguage = () =>
    i18n.changeLanguage(
      currentLang === LANGUAGES.ES ? LANGUAGES.EN : LANGUAGES.ES,
    );

  const handleLogout = async () => {
    if (isLoggingOut) return; // evita doble click mientras cierra sesión
    setIsMobileMenuOpen(false);
    try {
      await logout({});
    } finally {
      setAuthenticatedHint(false);
      lockVault(); // borra la vaultKey de memoria al cerrar sesión
      queryClient.removeQueries({ queryKey: [API_ENDPOINTS.AUTH.ME] });
      navigate(ROUTES.HOME);
    }
  };

  const closeMenu = () => setIsMobileMenuOpen(false);

  return (
    <nav className="bg-bg-surface/75 backdrop-blur-lg border-b border-border-base sticky top-0 z-50 transition-colors">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link
            to={ROUTES.HOME}
            onClick={closeMenu}
            className="text-body font-semibold text-text-base tracking-tight"
          >
            {appName}
          </Link>

          <div className="hidden md:flex items-center gap-6">
            {NAVIGATION.PUBLIC.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className="flex items-center gap-2 text-caption font-medium text-text-muted hover:text-text-base transition-colors"
              >
                {item.icon && <item.icon className="w-4 h-4" />}
                {t(item.labelKey)}
              </Link>
            ))}

            {user &&
              navigationFor(user?.rol).map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className="flex items-center gap-2 text-caption font-medium text-text-muted hover:text-text-base transition-colors"
                >
                  {item.icon && <item.icon className="w-4 h-4" />}
                  {t(item.labelKey)}
                </Link>
              ))}
          </div>
        </div>

        <div className="hidden md:flex items-center gap-4">
          <button
            onClick={toggleLanguage}
            className="inline-flex items-center gap-1.5 h-7 px-2 text-caption font-medium uppercase text-text-muted border border-border-base rounded-button hover:bg-bg-elevated hover:text-text-base transition-colors cursor-pointer"
            aria-label={t("nav.language")}
            title={t("nav.language")}
          >
            <Languages className="w-4 h-4" />
            {currentLang}
          </button>

          <button
            onClick={toggleTheme}
            className="inline-flex items-center justify-center w-7 h-7 text-caption text-text-muted border border-border-base rounded-button hover:bg-bg-elevated transition-colors cursor-pointer"
            aria-label={t("nav.themeToggle")}
            title={
              theme === THEMES.DARK
                ? t("nav.themeToLight")
                : t("nav.themeToDark")
            }
          >
            {theme === THEMES.DARK ? "☀️" : "🌙"}
          </button>

          {isLoading ? (
            <div className="flex items-center gap-3 border-l border-border-base pl-4 ml-2">
              <Skeleton className="w-8 h-8 rounded-full" />
              <Skeleton className="h-4 w-20" />
            </div>
          ) : (
            <>
              {user ? (
                <div className="flex items-center gap-4 border-l border-border-base pl-4 ml-2">
                  <div className="flex items-center gap-2 text-body font-medium text-text-base">
                    <div className="w-7 h-7 rounded-full bg-bg-elevated border border-border-base text-text-muted flex items-center justify-center">
                      <UserIcon className="w-4 h-4" />
                    </div>
                    {user.username}
                  </div>
                  <button
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                    className="inline-flex items-center gap-2 h-7 px-2.5 text-caption font-medium text-signal-danger border border-signal-danger/30 rounded-button hover:bg-signal-danger/10 hover:border-signal-danger/50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isLoggingOut ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <LogOut className="w-4 h-4" />
                    )}
                    {t("nav.logout")}
                  </button>
                </div>
              ) : (
                <Link
                  to={ROUTES.LOGIN}
                  className="inline-flex items-center h-7 px-3 text-caption font-medium bg-primary-500 text-white rounded-button hover:bg-primary-600 transition-colors"
                >
                  {t("nav.login")}
                </Link>
              )}
            </>
          )}
        </div>

        <div className="md:hidden flex items-center gap-2">
          <button
            onClick={toggleLanguage}
            className="inline-flex items-center gap-1 h-7 px-2 text-caption font-medium uppercase text-text-muted rounded-button hover:bg-bg-elevated transition-colors cursor-pointer"
            aria-label={t("nav.language")}
          >
            <Languages className="w-5 h-5" />
            {currentLang}
          </button>

          <button
            onClick={toggleTheme}
            className="inline-flex items-center justify-center w-7 h-7 text-caption text-text-muted rounded-button hover:bg-bg-elevated transition-colors cursor-pointer"
          >
            {theme === THEMES.DARK ? "☀️" : "🌙"}
          </button>

          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="inline-flex items-center justify-center w-7 h-7 text-text-muted rounded-button hover:bg-bg-elevated transition-colors focus:outline-none cursor-pointer"
            aria-label={t("nav.menu")}
          >
            {isMobileMenuOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>
        </div>
      </div>

      {isMobileMenuOpen && (
        <div className="md:hidden bg-bg-surface border-t border-border-base px-4 py-4 space-y-2 animate-in slide-in-from-top-2 duration-200">
          {NAVIGATION.PUBLIC.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              onClick={closeMenu}
              className="flex items-center gap-2.5 w-full h-9 px-2.5 text-body font-medium text-text-muted hover:text-text-base hover:bg-bg-elevated rounded-button transition-colors"
            >
              {item.icon && <item.icon className="w-5 h-5" />}
              {t(item.labelKey)}
            </Link>
          ))}

          {user &&
            navigationFor(user?.rol).map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={closeMenu}
                className="flex items-center gap-2.5 w-full h-9 px-2.5 text-body font-medium text-text-muted hover:text-text-base hover:bg-bg-elevated rounded-button transition-colors"
              >
                {item.icon && <item.icon className="w-5 h-5" />}
                {t(item.labelKey)}
              </Link>
            ))}

          <div className="pt-4 mt-2 border-t border-border-base">
            {isLoading ? (
              <div className="flex items-center gap-3 p-3">
                <Skeleton className="w-10 h-10 rounded-full" />
                <Skeleton className="h-4 w-24" />
              </div>
            ) : (
              <>
                {user ? (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3 p-3">
                      <div className="w-8 h-8 rounded-full bg-bg-elevated border border-border-base text-text-muted flex items-center justify-center">
                        <UserIcon className="w-5 h-5" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-caption text-text-muted">
                          {t("nav.connectedAs")}
                        </span>
                        <span className="text-body font-medium text-text-base">
                          {user.username}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={handleLogout}
                      disabled={isLoggingOut}
                      className="inline-flex items-center justify-center gap-2 w-full h-9 text-body font-medium text-signal-danger border border-signal-danger/30 rounded-button hover:bg-signal-danger/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isLoggingOut ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <LogOut className="w-5 h-5" />
                      )}
                      {t("nav.logoutFull")}
                    </button>
                  </div>
                ) : (
                  <Link
                    to={ROUTES.LOGIN}
                    onClick={closeMenu}
                    className="block w-full h-9 leading-9 bg-primary-500 text-white rounded-button text-body font-medium transition-colors text-center"
                  >
                    {t("nav.login")}
                  </Link>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};
