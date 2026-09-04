import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { UserCheck, BadgeCheck, Fingerprint, Layers } from "lucide-react";
import { useAuthQuery } from "@hooks/queries/auth.queries";
import { Card, CardTitle } from "@components/ui/Card";
import { Button } from "@components/ui/Button";
import { Modal } from "@components/ui/Modal";
import { Skeleton } from "@components/ui/Skeleton";
import { Badge } from "@components/ui/Badge";
import { Avatar } from "@components/ui/Avatar";
import { Table, Column } from "@components/ui/Table";

interface DemoRow {
  id: number;
  name: string;
  role: "admin" | "user";
  status: "active" | "inactive";
}

const PAGE_SIZE = 5;

export const Dashboard = () => {
  const { t } = useTranslation();
  const { data, isLoading: isLoadingUser } = useAuthQuery();
  const user = data?.user;

  const [isModalOpen, setIsModalOpen] = useState(false);

  // Datos de ejemplo para la tabla (en un caso real vendrían de usePaginatedQuery).
  const demoRows = useMemo<DemoRow[]>(
    () =>
      Array.from({ length: 13 }, (_, i) => ({
        id: i + 1,
        name: `Usuario ${i + 1}`,
        role: i % 3 === 0 ? "admin" : "user",
        status: i % 2 === 0 ? "active" : "inactive",
      })),
    [],
  );
  const [tablePage, setTablePage] = useState(1);
  const totalPages = Math.ceil(demoRows.length / PAGE_SIZE);
  const pagedRows = demoRows.slice(
    (tablePage - 1) * PAGE_SIZE,
    tablePage * PAGE_SIZE,
  );

  const columns: Column<DemoRow>[] = [
    {
      key: "id",
      header: "ID",
      className: "w-16",
      render: (row) => `#${row.id}`,
    },
    { key: "name", header: t("dashboard.table.name") },
    {
      key: "role",
      header: t("dashboard.table.role"),
      render: (row) => (
        <Badge variant={row.role === "admin" ? "primary" : "neutral"}>
          {row.role}
        </Badge>
      ),
    },
    {
      key: "status",
      header: t("dashboard.table.status"),
      align: "right",
      render: (row) => (
        <Badge variant={row.status === "active" ? "success" : "danger"}>
          {t(`dashboard.table.${row.status}`)}
        </Badge>
      ),
    },
  ];

  const fullName = [user?.nombre, user?.apellido].filter(Boolean).join(" ");

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto animate-in fade-in duration-300">
      <Card>
        <CardTitle>{t("dashboard.profileInfo")}</CardTitle>

        {/* Skeleton-first: mientras carga el usuario mostramos placeholders, no vacío. */}
        <div className="flex items-center gap-4 mb-6">
          {isLoadingUser ? (
            <>
              <Skeleton className="w-14 h-14 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
            </>
          ) : (
            <>
              <Avatar name={fullName || user?.username} size="lg" />
              <div>
                <p className="text-title font-medium text-text-base">
                  {fullName || user?.username}
                </p>
                <p className="text-body text-text-muted">@{user?.username}</p>
              </div>
            </>
          )}
        </div>

        <div className="space-y-5 text-text-muted">
          <div className="flex items-center gap-4 p-4 bg-bg-base rounded-input border border-border-base">
            <div className="w-12 h-12 rounded-full bg-primary-50 dark:bg-primary-500/10 text-primary-500 flex items-center justify-center border border-primary-100 dark:border-primary-800">
              <Fingerprint className="w-6 h-6" />
            </div>
            <div className="flex flex-col">
              <span className="text-caption font-semibold text-text-base opacity-70">
                {t("dashboard.userId")}
              </span>
              {isLoadingUser ? (
                <Skeleton className="h-5 w-16 mt-1" />
              ) : (
                <span className="font-mono text-body text-text-base">
                  #{user?.id}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 p-4 bg-bg-base rounded-input border border-border-base">
            <div className="w-12 h-12 rounded-full bg-primary-50 dark:bg-primary-500/10 text-primary-500 flex items-center justify-center border border-primary-100 dark:border-primary-800">
              <UserCheck className="w-6 h-6" />
            </div>
            <div className="flex flex-col">
              <span className="text-caption font-semibold text-text-base opacity-70">
                {t("dashboard.username")}
              </span>
              {isLoadingUser ? (
                <Skeleton className="h-6 w-32 mt-1" />
              ) : (
                <span className="text-title font-medium text-text-base">
                  {user?.username}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 p-4 bg-bg-base rounded-input border border-border-base">
            <div className="w-12 h-12 rounded-full bg-primary-50 dark:bg-primary-500/10 text-primary-500 flex items-center justify-center border border-primary-100 dark:border-primary-800">
              <BadgeCheck className="w-6 h-6" />
            </div>
            <div className="flex flex-col">
              <span className="text-caption font-semibold text-text-base opacity-70">
                {t("dashboard.fullName")}
              </span>
              {isLoadingUser ? (
                <Skeleton className="h-6 w-40 mt-1" />
              ) : (
                <span className="text-title font-medium text-text-base">
                  {fullName || t("dashboard.na")}
                </span>
              )}
            </div>
          </div>

          <Button
            onClick={() => setIsModalOpen(true)}
            variant="secondary"
            icon={Layers}
            className="w-full"
          >
            {t("dashboard.demoButton")}
          </Button>
        </div>
      </Card>

      <Card className="min-w-0">
        <CardTitle>{t("dashboard.tableTitle")}</CardTitle>
        <Table
          columns={columns}
          data={pagedRows}
          rowKey={(row) => row.id}
          isLoading={isLoadingUser}
          skeletonRows={PAGE_SIZE}
          pagination={{
            page: tablePage,
            totalPages,
            hasPrev: tablePage > 1,
            hasNext: tablePage < totalPages,
            onPrev: () => setTablePage((p) => Math.max(1, p - 1)),
            onNext: () => setTablePage((p) => Math.min(totalPages, p + 1)),
          }}
        />
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={t("dashboard.demoTitle")}
        size="lg"
        footer={
          <Button onClick={() => setIsModalOpen(false)} size="sm">
            {t("dashboard.demoClose")}
          </Button>
        }
      >
        <p className="mb-4">{t("dashboard.demoIntro")}</p>
        <div className="space-y-2">
          {Array.from({ length: 30 }).map((_, i) => (
            <p key={i} className="text-body">
              {t("dashboard.demoLine", { n: i + 1 })}
            </p>
          ))}
        </div>
      </Modal>
    </div>
  );
};
