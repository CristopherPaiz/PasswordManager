import { ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Eye, Copy } from "lucide-react";
import { usePaginatedQuery } from "@hooks/queries/usePaginatedQuery";
import { API_ENDPOINTS } from "@constants/app.constants";
import { ErrorLog } from "@apptypes";
import { Card, CardTitle } from "@components/ui/Card";
import { Table, Column } from "@components/ui/Table";
import { Badge } from "@components/ui/Badge";
import { Button } from "@components/ui/Button";
import { Modal } from "@components/ui/Modal";
import { StackTrace } from "@components/ui/StackTrace";

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div>
    <p className="text-caption font-semibold text-text-base opacity-70 mb-1">
      {label}
    </p>
    {children}
  </div>
);

export const Errors = () => {
  const { t } = useTranslation();
  const {
    items,
    isLoading,
    page,
    pagination,
    hasPrev,
    hasNext,
    prevPage,
    nextPage,
  } = usePaginatedQuery<ErrorLog>({
    endpoint: API_ENDPOINTS.ERRORS.LIST,
    limit: 10,
  });
  const [selected, setSelected] = useState<ErrorLog | null>(null);

  // Copia el error completo (método, endpoint, mensaje, fechas y stack) para pegarlo a una IA.
  const handleCopy = async (err: ErrorLog) => {
    const text = [
      `Método: ${err.method}`,
      `Endpoint: ${err.endpoint}`,
      `Mensaje: ${err.error_message}`,
      `Fecha (Guatemala): ${err.fecha_guatemala}`,
      `Fecha servidor (UTC): ${err.fecha_creacion} UTC`,
      "",
      "Stack trace:",
      err.stack_trace ?? "(sin stack trace)",
    ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("errors.copied"));
    } catch {
      toast.error(t("errors.copyError"));
    }
  };

  const columns: Column<ErrorLog>[] = [
    {
      key: "id",
      header: "ID",
      className: "w-16",
      render: (row) => `#${row.id}`,
    },
    {
      key: "error_message",
      header: t("errors.message"),
      render: (row) => (
        <span className="block max-w-xs truncate">{row.error_message}</span>
      ),
    },
    {
      key: "fecha_guatemala",
      header: t("errors.date"),
      render: (row) => row.fecha_guatemala,
    },
    {
      key: "resuelto",
      header: t("errors.status"),
      render: (row) => (
        <Badge variant={row.resuelto ? "success" : "warning"}>
          {row.resuelto ? t("errors.resolved") : t("errors.unresolved")}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) => (
        <button
          type="button"
          onClick={() => setSelected(row)}
          aria-label={t("errors.view")}
          className="p-1.5 text-text-muted hover:text-primary-500 hover:bg-bg-base rounded-button transition-colors cursor-pointer"
        >
          <Eye className="w-4 h-4" />
        </button>
      ),
    },
  ];

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in duration-300">
      <Card className="min-w-0">
        <CardTitle>{t("errors.title")}</CardTitle>
        <Table
          columns={columns}
          data={items}
          rowKey={(row) => row.id}
          isLoading={isLoading}
          skeletonRows={10}
          pagination={{
            page,
            totalPages: pagination?.totalPages ?? 0,
            hasPrev,
            hasNext,
            onPrev: prevPage,
            onNext: nextPage,
          }}
        />
      </Card>

      <Modal
        isOpen={selected !== null}
        onClose={() => setSelected(null)}
        title={t("errors.detailTitle")}
        size="lg"
        footer={
          selected ? (
            <Button
              variant="secondary"
              size="sm"
              icon={Copy}
              onClick={() => handleCopy(selected)}
            >
              {t("errors.copy")}
            </Button>
          ) : undefined
        }
      >
        {selected && (
          <div className="space-y-4 text-body">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="neutral">#{selected.id}</Badge>
              <Badge variant="primary">{selected.method}</Badge>
              <span className="font-mono text-text-base break-all">
                {selected.endpoint}
              </span>
            </div>

            <Field label={t("errors.fullMessage")}>
              <p className="text-text-base break-words">
                {selected.error_message}
              </p>
            </Field>

            <div className="grid sm:grid-cols-2 gap-4">
              <Field label={t("errors.dateGuatemala")}>
                <p className="text-text-base font-mono">
                  {selected.fecha_guatemala}
                </p>
              </Field>
              <Field label={t("errors.dateServer")}>
                <p className="text-text-muted font-mono">
                  {selected.fecha_creacion} UTC
                </p>
              </Field>
            </div>

            <Field label={t("errors.stack")}>
              {selected.stack_trace ? (
                <StackTrace stack={selected.stack_trace} />
              ) : (
                <p className="text-text-muted">{t("errors.noStack")}</p>
              )}
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
};
