import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { apiClient } from "@api/axios.client";
import { PaginatedResponse } from "@apptypes";

interface UsePaginatedQueryParams {
  endpoint: string;
  initialPage?: number;
  limit?: number;
  enabled?: boolean;
  staleTime?: number;
  params?: Record<string, string | number>;
}

// Query paginada reusable. Espera que el backend responda { data, pagination }.
// keepPreviousData evita el parpadeo al cambiar de página.
export const usePaginatedQuery = <TItem = unknown>({
  endpoint,
  initialPage = 1,
  limit = 10,
  enabled = true,
  staleTime,
  params,
}: UsePaginatedQueryParams) => {
  const [page, setPage] = useState(initialPage);

  const query = useQuery<PaginatedResponse<TItem>, Error>({
    queryKey: [endpoint, page, limit, params],
    queryFn: async () => {
      const search = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (params) {
        Object.entries(params).forEach(([key, value]) => search.set(key, String(value)));
      }
      const { data } = await apiClient.get<PaginatedResponse<TItem>>(`${endpoint}?${search.toString()}`);
      return data;
    },
    enabled,
    staleTime,
    placeholderData: keepPreviousData,
  });

  const totalPages = query.data?.pagination.totalPages ?? 0;

  const goToPage = (next: number) => {
    setPage((prev) => {
      const target = Math.max(1, totalPages > 0 ? Math.min(next, totalPages) : next);
      return target === prev ? prev : target;
    });
  };

  return {
    ...query,
    items: query.data?.data ?? [],
    pagination: query.data?.pagination,
    page,
    setPage: goToPage,
    nextPage: () => goToPage(page + 1),
    prevPage: () => goToPage(page - 1),
    hasNext: totalPages > 0 ? page < totalPages : false,
    hasPrev: page > 1,
  };
};
