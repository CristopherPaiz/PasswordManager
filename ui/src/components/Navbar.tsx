import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Menu, X, LogOut, User as UserIcon, Languages, Loader2 } from "lucide-react";
import { useAuthQuery } from "@hooks/queries/auth.queries";
import { useMutationQuery, useGetQuery } from "@hooks/queries/core.queries";
import { useUiStore } from "@store/ui.store";
import { useAuthStore } from "@store/auth.store";
import { ROUTES, API_ENDPOINTS, THEMES, NAVIGATION, LANGUAGES } from "@constants/app.constants";
import { useQueryClient } from "@tanstack/react-query";
import { ApiResponse } from "@apptypes";
import { Skeleton } from "./ui/Skeleton";

export const Navbar = () => {
  const { t, i18n } = useTranslation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { data, isLoading } = useAuthQuery();
  const { theme, toggleTheme } = useUiStore();
  const { setAuthenticatedHint } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: configData } = useGetQuery<ApiResponse<Record<string, string>>>({
    endpoint: API_ENDPOINTS.CONFIG.GET_ALL,
    staleTime: Infinity,
    showToast: false,
  });

  const { mutateAsync: logout, isPending: isLoggingOut } = useMutationQuery({
    endpoint: API_ENDPOINTS.AUTH.LOGOUT,
    messageSuccess: t("nav.logoutSuccess"),
  });

  const user = data?.user;
  const appName = configData?.data?.nombreApp || t("common.appName");

  const currentLang = i18n.language.startsWith("es") ? LANGUAGES.ES : LANGUAGES.EN;
  const toggleLanguage = () => i18n.changeLanguage(currentLang === LANGUAGES.ES ? LANGUAGES.EN : LANGUAGES.ES);

  const handleLogout = async () => {
    if (isLoggingOut) return; // evita doble click mientras cierra sesión
    setIsMobileMenuOpen(false);
    try {
      await logout({});
    } finally {
      setAuthenticatedHint(false);
      queryClient.removeQueries({ queryKey: [API_ENDPOINTS.AUTH.ME] });
      navigate(ROUTES.HOME);
    }
  };

  const closeMenu = () => setIsMobileMenuOpen(false);

  return (
    <nav className="bg-bg-surface/75 backdrop-blur-lg border-b border-border-base sticky top-0 z-50 transition-colors shadow-sm">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link to={ROUTES.HOME} onClick={closeMenu} className="text-xl font-bold text-primary-500">
            {appName}
          </Link>

          <div className="hidden md:flex items-center gap-6">
            {NAVIGATION.PUBLIC.map((item) => (
              <Link key={item.path} to={item.path} className="flex items-center gap-2 text-text-muted hover:text-primary-500 font-medium transition-colors">
                {item.icon && <item.icon className="w-4 h-4" />}
                {t(item.labelKey)}
              </Link>
            ))}

            {user &&
              NAVIGATION.PRIVATE.map((item) => (
                <Link key={item.path} to={item.path} className="flex items-center gap-2 text-text-muted hover:text-primary-500 font-medium transition-colors">
                  {item.icon && <item.icon className="w-4 h-4" />}
                  {t(item.labelKey)}
                </Link>
              ))}
          </div>
        </div>

        <div className="hidden md:flex items-center gap-4">
          <button
            onClick={toggleLanguage}
            className="flex items-center gap-1.5 p-2 text-text-muted hover:bg-bg-base rounded-lg border border-border-base transition-colors cursor-pointer text-sm font-semibold uppercase"
            aria-label={t("nav.language")}
            title={t("nav.language")}
          >
            <Languages className="w-4 h-4" />
            {currentLang}
          </button>

          <button
            onClick={toggleTheme}
            className="p-2 text-text-muted hover:bg-bg-base rounded-lg border border-border-base transition-colors cursor-pointer flex items-center justify-center text-xl"
            aria-label={t("nav.themeToggle")}
            title={theme === THEMES.DARK ? t("nav.themeToLight") : t("nav.themeToDark")}
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
                  <div className="flex items-center gap-2 text-sm font-medium text-text-base">
                    <div className="w-8 h-8 rounded-full bg-primary-50 dark:bg-primary-900/20 text-primary-500 flex items-center justify-center">
                      <UserIcon className="w-4 h-4" />
                    </div>
                    {user.username}
                  </div>
                  <button
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                    className="flex items-center gap-2 text-sm px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20 rounded-lg font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                    {t("nav.logout")}
                  </button>
                </div>
              ) : (
                <Link to={ROUTES.LOGIN} className="text-sm px-4 py-2 bg-primary-500 text-white hover:bg-primary-600 rounded-lg font-medium transition-colors">
                  {t("nav.login")}
                </Link>
              )}
            </>
          )}
        </div>

        <div className="md:hidden flex items-center gap-2">
          <button onClick={toggleLanguage} className="flex items-center gap-1 p-2 text-text-muted hover:bg-bg-base rounded-lg transition-colors text-sm font-semibold uppercase" aria-label={t("nav.language")}>
            <Languages className="w-5 h-5" />
            {currentLang}
          </button>

          <button onClick={toggleTheme} className="p-2 text-text-muted hover:bg-bg-base rounded-lg transition-colors flex items-center justify-center text-xl">
            {theme === THEMES.DARK ? "☀️" : "🌙"}
          </button>

          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-text-muted hover:bg-bg-base rounded-lg transition-colors focus:outline-none" aria-label={t("nav.menu")}>
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {isMobileMenuOpen && (
        <div className="md:hidden bg-bg-surface border-t border-border-base px-4 py-4 space-y-2 animate-in slide-in-from-top-2 duration-200 shadow-xl">
          {NAVIGATION.PUBLIC.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              onClick={closeMenu}
              className="flex items-center gap-3 w-full p-3 text-text-muted hover:text-primary-500 hover:bg-bg-base rounded-xl font-medium transition-colors"
            >
              {item.icon && <item.icon className="w-5 h-5" />}
              {t(item.labelKey)}
            </Link>
          ))}

          {user &&
            NAVIGATION.PRIVATE.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={closeMenu}
                className="flex items-center gap-3 w-full p-3 text-text-muted hover:text-primary-500 hover:bg-bg-base rounded-xl font-medium transition-colors"
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
                      <div className="w-10 h-10 rounded-full bg-primary-50 dark:bg-primary-900/20 text-primary-500 flex items-center justify-center">
                        <UserIcon className="w-5 h-5" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-text-muted">{t("nav.connectedAs")}</span>
                        <span className="text-sm font-medium text-text-base">{user.username}</span>
                      </div>
                    </div>
                    <button
                      onClick={handleLogout}
                      disabled={isLoggingOut}
                      className="flex items-center justify-center gap-2 w-full py-3 bg-red-50 text-red-600 dark:bg-red-500/10 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoggingOut ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogOut className="w-5 h-5" />}
                      {t("nav.logoutFull")}
                    </button>
                  </div>
                ) : (
                  <Link to={ROUTES.LOGIN} onClick={closeMenu} className="block w-full py-3 bg-primary-500 text-white rounded-xl font-medium transition-colors text-center">
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
