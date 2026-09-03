import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Skeleton } from "./Skeleton";

type Align = "left" | "center" | "right";

const ALIGN: Record<Align, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

export interface Column<T> {
  key: string;
  header: ReactNode;
  render?: (row: T) => ReactNode;
  className?: string;
  align?: Align;
}

export interface TablePagination {
  page: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T, index: number) => string | number;
  isLoading?: boolean;
  skeletonRows?: number;
  emptyMessage?: ReactNode;
  pagination?: TablePagination;
}

export const Table = <T,>({ columns, data, rowKey, isLoading = false, skeletonRows = 5, emptyMessage, pagination }: TableProps<T>) => {
  const { t } = useTranslation();

  return (
    <div className="w-full min-w-0 overflow-hidden rounded-card border border-border-base bg-bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full text-body">
          <thead>
            <tr className="border-b border-border-base bg-bg-base">
              {columns.map((col) => (
                <th key={col.key} className={`px-3 py-2 text-caption font-medium uppercase tracking-wide text-text-muted ${ALIGN[col.align ?? "left"]} ${col.className ?? ""}`}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: skeletonRows }).map((_, rowIndex) => (
                <tr key={`skeleton-${rowIndex}`} className="border-b border-border-base last:border-0">
                  {columns.map((col) => (
                    <td key={col.key} className="px-3 py-2.5">
                      <Skeleton className="h-4 w-full max-w-[140px]" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-12 text-center text-caption text-text-muted">
                  {emptyMessage ?? t("table.empty")}
                </td>
              </tr>
            ) : (
              data.map((row, index) => (
                <tr key={rowKey(row, index)} className="border-b border-border-base last:border-0 hover:bg-bg-elevated transition-colors">
                  {columns.map((col) => (
                    <td key={col.key} className={`px-3 py-2.5 text-text-base ${ALIGN[col.align ?? "left"]} ${col.className ?? ""}`}>
                      {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? "")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between gap-4 px-3 py-2 border-t border-border-base">
          <span className="text-caption text-text-muted">{t("table.page", { page: pagination.page, total: pagination.totalPages })}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={pagination.onPrev}
              disabled={!pagination.hasPrev}
              className="inline-flex items-center gap-1 h-7 px-2.5 text-caption font-medium text-text-muted hover:text-text-base hover:bg-bg-base border border-border-base rounded-button transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
              {t("table.previous")}
            </button>
            <button
              type="button"
              onClick={pagination.onNext}
              disabled={!pagination.hasNext}
              className="inline-flex items-center gap-1 h-7 px-2.5 text-caption font-medium text-text-muted hover:text-text-base hover:bg-bg-base border border-border-base rounded-button transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t("table.next")}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
