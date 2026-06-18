import { useState, useEffect, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiClient } from "@api/axios.client";
import { API_ENDPOINTS } from "@constants/app.constants";
import { useAuthStore } from "@store/auth.store";
import { useGetQuery } from "@hooks/queries/core.queries";

interface GlobalLoaderProps {
  children: ReactNode;
}

export const GlobalLoader = ({ children }: GlobalLoaderProps) => {
  const { t } = useTranslation();
  const loadingMessages = t("loader.messages", { returnObjects: true }) as string[];
  const [messageIndex, setMessageIndex] = useState(0);
  const { isAuthenticatedHint, setAuthenticatedHint } = useAuthStore();

  const { isSuccess: isHealthSuccess, isError: isHealthError } = useQuery({
    queryKey: [API_ENDPOINTS.SYSTEM.HEALTH],
    queryFn: async () => {
      // Cascada: si un adblocker (ej. Brave) bloquea /health por su nombre,
      // reintenta contra /ping y luego /status (mismo endpoint en el backend).
      const fallbacks = [API_ENDPOINTS.SYSTEM.HEALTH, API_ENDPOINTS.SYSTEM.PING, API_ENDPOINTS.SYSTEM.STATUS];
      let lastError: unknown;
      for (const endpoint of fallbacks) {
        try {
          const { data } = await apiClient.get(endpoint);
          return data;
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError;
    },
    retry: 12,
    retryDelay: 5000,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const { isSuccess: isConfigSuccess, isError: isConfigError } = useGetQuery({
    endpoint: API_ENDPOINTS.CONFIG.GET_ALL,
    enabled: isHealthSuccess,
    retry: 3,
    staleTime: Infinity,
    showToast: false,
  });

  const { isLoading: isAuthLoading, isError: isAuthError } = useGetQuery({
    endpoint: API_ENDPOINTS.AUTH.ME,
    enabled: isHealthSuccess && isAuthenticatedHint,
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (isHealthSuccess || isHealthError || isConfigError) return;

    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % loadingMessages.length);
    }, 3000);

    return () => clearInterval(interval);
  }, [isHealthSuccess, isHealthError, isConfigError, loadingMessages.length]);

  useEffect(() => {
    if (isAuthError) {
      setAuthenticatedHint(false);
    }
  }, [isAuthError, setAuthenticatedHint]);

  if (isHealthError || isConfigError) {
    return (
      <div className="min-h-dvh bg-bg-base flex flex-col items-center justify-center p-4 text-center">
        <div className="w-16 h-16 text-red-500 mb-4">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-text-base mb-2">{t("loader.unavailableTitle")}</h1>
        <p className="text-text-muted max-w-md">
          {isHealthError ? t("loader.connectError") : t("loader.webError")}
          {t("loader.tryAgainHint")}
        </p>
        <button onClick={() => window.location.reload()} className="mt-6 px-6 py-2 bg-primary-500 text-white rounded-xl hover:bg-primary-600 transition-colors">
          {t("loader.retry")}
        </button>
      </div>
    );
  }

  const isAppReady = isHealthSuccess && isConfigSuccess && !isAuthLoading;

  if (!isAppReady) {
    return (
      <div className="min-h-dvh bg-bg-base flex flex-col items-center justify-center p-4">
        <div className="relative w-20 h-20 mb-8">
          <div className="absolute inset-0 border-4 border-border-base rounded-full"></div>
          <div className="absolute inset-0 border-4 border-primary-500 rounded-full border-t-transparent animate-spin"></div>
        </div>

        <p className="text-lg font-medium text-text-muted animate-in fade-in slide-in-from-bottom-2 duration-500 text-center">
          {!isHealthSuccess ? loadingMessages[messageIndex] : t("loader.preparing")}
        </p>
      </div>
    );
  }

  return <>{children}</>;
};
