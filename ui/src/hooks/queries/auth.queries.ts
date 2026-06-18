import { useEffect } from "react";
import { useGetQuery } from "./core.queries";
import { API_ENDPOINTS } from "@constants/app.constants";
import { User } from "@apptypes";
import { useAuthStore } from "@store/auth.store";

interface AuthMeResponse {
  user: User;
}

export const useAuthQuery = () => {
  const { isAuthenticatedHint, setAuthenticatedHint } = useAuthStore();

  const query = useGetQuery<AuthMeResponse>({
    endpoint: API_ENDPOINTS.AUTH.ME,
    showToast: false,
    enabled: isAuthenticatedHint,
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (query.isError) {
      setAuthenticatedHint(false);
    }
  }, [query.isError, setAuthenticatedHint]);

  return {
    ...query,
    isLoading: isAuthenticatedHint ? query.isLoading : false,
  };
};
