import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiClient } from "@api/axios.client";

interface UseGetQueryParams {
  endpoint: string;
  enabled?: boolean;
  showToast?: boolean;
  messageSuccess?: string;
  messageError?: string;
  invalidateQueryKey?: string[];
  staleTime?: number;
  retry?: boolean | number;
}

export const useGetQuery = <TData = unknown>({
  endpoint,
  enabled = true,
  showToast = false,
  messageSuccess = "Datos cargados exitosamente",
  messageError,
  invalidateQueryKey,
  staleTime,
  retry,
}: UseGetQueryParams) => {
  const queryClient = useQueryClient();

  const query = useQuery<TData, Error>({
    queryKey: [endpoint],
    queryFn: async () => {
      const { data } = await apiClient.get<TData>(endpoint);

      if (invalidateQueryKey && invalidateQueryKey.length > 0) {
        invalidateQueryKey.forEach((key) => {
          queryClient.invalidateQueries({ queryKey: [key] });
        });
      }

      return data;
    },
    enabled,
    staleTime,
    retry,
  });

  useEffect(() => {
    if (!showToast || query.isFetching) return;

    if (query.isSuccess) {
      toast.success(messageSuccess, {
        dismissible: true,
      });
    }

    if (query.isError) {
      toast.error(messageError ?? query.error.message, {
        dismissible: true,
      });
    }
  }, [query.isSuccess, query.isError, query.isFetching, showToast, messageSuccess, messageError, query.error]);

  return query;
};

type HttpMethod = "post" | "put" | "patch" | "delete";

interface UseMutationQueryParams<TVariables> {
  endpoint: string | ((variables: TVariables) => string);
  method?: HttpMethod;
  showToast?: boolean;
  messageSuccess?: string;
  messageError?: string;
  invalidateQueryKey?: string[];
}

export const useMutationQuery = <TData = unknown, TVariables = unknown>({
  endpoint,
  method = "post",
  showToast = true,
  messageSuccess = "Operación completada exitosamente",
  messageError,
  invalidateQueryKey,
}: UseMutationQueryParams<TVariables>) => {
  const queryClient = useQueryClient();

  return useMutation<TData, Error, TVariables>({
    mutationFn: async (variables) => {
      const finalEndpoint = typeof endpoint === "function" ? endpoint(variables) : endpoint;

      if (method === "delete") {
        const { data } = await apiClient.delete<TData>(finalEndpoint, {
          data: variables,
        });
        return data;
      }

      const { data } = await apiClient[method]<TData>(finalEndpoint, variables);
      return data;
    },
    onSuccess: () => {
      if (showToast) {
        toast.success(messageSuccess, {
          dismissible: true,
        });
      }
      if (invalidateQueryKey && invalidateQueryKey.length > 0) {
        invalidateQueryKey.forEach((key) => {
          queryClient.invalidateQueries({ queryKey: [key] });
        });
      }
    },
    onError: (error) => {
      if (showToast) {
        toast.error(messageError ?? error.message, {
          dismissible: true,
        });
      }
    },
  });
};
