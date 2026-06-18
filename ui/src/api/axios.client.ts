import axios from "axios";
import { API_BASE_URL } from "@constants/api.contants";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  if (!(config.data instanceof FormData)) {
    config.headers["Content-Type"] = "application/json";
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const errorData = error.response?.data;
    let errorMessage = errorData?.message || "Ocurrió un error inesperado de red.";

    if (errorData?.errorId) {
      errorMessage += ` (ID: ${errorData.errorId})`;
    }

    const customError = new Error(errorMessage);
    return Promise.reject(customError);
  },
);
