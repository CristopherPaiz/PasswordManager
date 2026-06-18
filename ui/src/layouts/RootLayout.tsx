import { useEffect, Suspense } from "react";
import { Outlet } from "react-router";
import { Toaster } from "sonner";
import { useUiStore } from "@store/ui.store";
import { THEMES, API_ENDPOINTS } from "@constants/app.constants";
import { Navbar } from "@components/Navbar";
import { GlobalLoader } from "@components/GlobalLoader";
import { useGetQuery } from "@hooks/queries/core.queries";
import { ApiResponse } from "@apptypes";

export const RootLayout = () => {
  const { theme } = useUiStore();

  const { data: configData } = useGetQuery<ApiResponse<Record<string, string>>>({
    endpoint: API_ENDPOINTS.CONFIG.GET_ALL,
    staleTime: Infinity,
    showToast: false,
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === THEMES.DARK) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme]);

  useEffect(() => {
    if (configData?.data?.nombreApp) {
      document.title = configData.data.nombreApp;
    }
  }, [configData]);

  return (
    <div className="min-h-dvh flex flex-col">
      <Toaster position="top-right" richColors theme={theme} duration={2500} closeButton />
      <GlobalLoader>
        <Navbar />
        <main className="flex-grow container mx-auto px-4 py-8">
          <Suspense
            fallback={
              <div className="flex h-[60dvh] items-center justify-center">
                <div className="w-12 h-12 border-4 border-border-base border-t-primary-500 rounded-full animate-spin" />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </GlobalLoader>
    </div>
  );
};
