import { useState, useMemo, ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { CloudUpload, UserCheck, BadgeCheck, Fingerprint, Image as ImageIcon, Layers } from "lucide-react";
import { useAuthQuery } from "@hooks/queries/auth.queries";
import { useMutationQuery } from "@hooks/queries/core.queries";
import { API_ENDPOINTS, FORM_FIELDS } from "@constants/app.constants";
import { Card, CardTitle } from "@components/ui/Card";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { Modal } from "@components/ui/Modal";
import { Skeleton } from "@components/ui/Skeleton";
import { Badge } from "@components/ui/Badge";
import { Avatar } from "@components/ui/Avatar";
import { Table, Column } from "@components/ui/Table";

interface UploadResponse {
  data: {
    url: string;
    publicId: string;
  };
}

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

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
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
  const pagedRows = demoRows.slice((tablePage - 1) * PAGE_SIZE, tablePage * PAGE_SIZE);

  const columns: Column<DemoRow>[] = [
    { key: "id", header: "ID", className: "w-16", render: (row) => `#${row.id}` },
    { key: "name", header: t("dashboard.table.name") },
    {
      key: "role",
      header: t("dashboard.table.role"),
      render: (row) => <Badge variant={row.role === "admin" ? "primary" : "neutral"}>{row.role}</Badge>,
    },
    {
      key: "status",
      header: t("dashboard.table.status"),
      align: "right",
      render: (row) => <Badge variant={row.status === "active" ? "success" : "danger"}>{t(`dashboard.table.${row.status}`)}</Badge>,
    },
  ];

  const { mutateAsync: uploadImage, isPending: isUploading } = useMutationQuery<UploadResponse, FormData>({
    endpoint: API_ENDPOINTS.UPLOAD.TEST,
    messageSuccess: t("dashboard.uploadSuccess"),
  });

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setUploadedImageUrl(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    const formData = new FormData();
    formData.append(FORM_FIELDS.UPLOAD_TEST, selectedFile);

    const response = await uploadImage(formData);

    if (response?.data?.url) {
      setUploadedImageUrl(response.data.url);
      setPreviewUrl(null);
      setSelectedFile(null);
    }
  };

  const fullName = [user?.nombre, user?.apellido].filter(Boolean).join(" ");

  return (
    <div className="grid md:grid-cols-2 gap-6 max-w-6xl mx-auto animate-in fade-in duration-300">
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
                <p className="text-lg font-bold text-text-base">{fullName || user?.username}</p>
                <p className="text-sm text-text-muted">@{user?.username}</p>
              </div>
            </>
          )}
        </div>

        <div className="space-y-5 text-text-muted">
          <div className="flex items-center gap-4 p-4 bg-bg-base rounded-xl border border-border-base">
            <div className="w-12 h-12 rounded-full bg-primary-50 dark:bg-primary-900/20 text-primary-500 flex items-center justify-center border border-primary-100 dark:border-primary-800">
              <Fingerprint className="w-6 h-6" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-text-base opacity-70">{t("dashboard.userId")}</span>
              {isLoadingUser ? <Skeleton className="h-5 w-16 mt-1" /> : <span className="font-mono text-sm text-text-base">#{user?.id}</span>}
            </div>
          </div>

          <div className="flex items-center gap-4 p-4 bg-bg-base rounded-xl border border-border-base">
            <div className="w-12 h-12 rounded-full bg-primary-50 dark:bg-primary-900/20 text-primary-500 flex items-center justify-center border border-primary-100 dark:border-primary-800">
              <UserCheck className="w-6 h-6" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-text-base opacity-70">{t("dashboard.username")}</span>
              {isLoadingUser ? <Skeleton className="h-6 w-32 mt-1" /> : <span className="text-lg font-medium text-text-base">{user?.username}</span>}
            </div>
          </div>

          <div className="flex items-center gap-4 p-4 bg-bg-base rounded-xl border border-border-base">
            <div className="w-12 h-12 rounded-full bg-primary-50 dark:bg-primary-900/20 text-primary-500 flex items-center justify-center border border-primary-100 dark:border-primary-800">
              <BadgeCheck className="w-6 h-6" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-text-base opacity-70">{t("dashboard.fullName")}</span>
              {isLoadingUser ? <Skeleton className="h-6 w-40 mt-1" /> : <span className="text-lg font-medium text-text-base">{fullName || t("dashboard.na")}</span>}
            </div>
          </div>

          <Button onClick={() => setIsModalOpen(true)} variant="secondary" icon={Layers} className="w-full">
            {t("dashboard.demoButton")}
          </Button>
        </div>
      </Card>

      <Card>
        <CardTitle>{t("dashboard.uploadImage")}</CardTitle>

        <div className="space-y-6">
          <Input type="file" accept="image/*" onChange={handleFileChange} disabled={isUploading} label={t("dashboard.selectImage")} />

          {previewUrl && (
            <div className="animate-in fade-in zoom-in duration-300">
              <p className="text-sm font-semibold text-text-base mb-3 flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-text-muted" />
                {t("dashboard.preview")}
              </p>
              <img src={previewUrl} alt="Preview" className="w-full max-h-72 object-cover rounded-xl border-2 border-dashed border-border-base" />
            </div>
          )}

          {uploadedImageUrl && (
            <div className="p-5 border border-green-200 dark:border-green-900/50 bg-green-50/50 dark:bg-green-900/10 rounded-xl animate-in fade-in duration-300">
              <p className="text-sm font-bold text-green-700 dark:text-green-400 mb-3 flex items-center gap-2">
                <BadgeCheck className="w-5 h-5" />
                {t("dashboard.uploadSuccessTitle")}
              </p>
              <img src={uploadedImageUrl} alt="Uploaded result" className="w-full max-h-72 object-cover rounded-xl shadow-md mb-3" />
              <a href={uploadedImageUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary-500 hover:text-primary-600 transition-colors inline-flex items-center gap-1.5">
                {t("dashboard.openOriginal")} &rarr;
              </a>
            </div>
          )}

          <Button onClick={handleUpload} disabled={!selectedFile || isUploading} isLoading={isUploading} icon={CloudUpload} className="w-full">
            {t("dashboard.confirmUpload")}
          </Button>
        </div>
      </Card>

      <Card className="md:col-span-2 min-w-0">
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
            <p key={i} className="text-sm">
              {t("dashboard.demoLine", { n: i + 1 })}
            </p>
          ))}
        </div>
      </Modal>
    </div>
  );
};
