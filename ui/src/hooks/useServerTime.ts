import { useGetQuery } from "@hooks/queries/core.queries";
import { API_ENDPOINTS } from "@constants/app.constants";
import { ApiResponse, ServerTimeInfo } from "@apptypes";

// Trae la hora del servidor (ya calculada en Guatemala) y el desfase con el reloj del cliente.
export const useServerTime = () => {
  const query = useGetQuery<ApiResponse<ServerTimeInfo>>({
    endpoint: API_ENDPOINTS.SYSTEM.TIME,
    showToast: false,
    staleTime: 0,
  });

  const info = query.data?.data ?? null;
  const driftMs = info ? Date.now() - info.epoch : null;

  return { ...query, info, driftMs };
};
