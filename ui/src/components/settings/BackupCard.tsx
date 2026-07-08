import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Upload, Archive } from "lucide-react";
import { toast } from "sonner";
import { useGetQuery, useMutationQuery } from "@hooks/queries/core.queries";
import { useVaultStore } from "@store/vault.store";
import { API_ENDPOINTS } from "@constants/app.constants";
import { decryptVaultData, encryptVaultData, newVaultItemUid } from "@utils/vault";
import { buildExport, parseExport, parseCsv, VaultExportFile, VaultExportItem } from "@utils/backup";
import { VaultItemRow, VaultItemType } from "@apptypes";
import { Card, CardTitle } from "@components/ui/Card";
import { Input } from "@components/ui/Input";
import { Button } from "@components/ui/Button";

interface EncItem {
  tipo: VaultItemType;
  ciphertext: string;
  iv: string;
  uid: string;
}

export const BackupCard = () => {
  const { t } = useTranslation();
  const vaultKey = useVaultStore((s) => s.vaultKey);

  const [exportPw, setExportPw] = useState("");
  const [importPw, setImportPw] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const { data: vaultList } = useGetQuery<{ items: VaultItemRow[] }>({
    endpoint: API_ENDPOINTS.VAULT.LIST,
    enabled: !!vaultKey,
  });

  const { mutateAsync: bulkImport } = useMutationQuery<{ count: number }, { items: EncItem[] }>({
    endpoint: API_ENDPOINTS.VAULT.BULK,
    invalidateQueryKey: [API_ENDPOINTS.VAULT.LIST],
    showToast: false,
  });

  const handleExport = async () => {
    if (!vaultKey) {
      toast.error(t("settings.backup.needUnlock"));
      return;
    }
    if (exportPw.length < 6) {
      toast.error(t("settings.backup.exportPwShort"));
      return;
    }
    setIsExporting(true);
    try {
      const list = vaultList?.items ?? [];
      // Cada item exportado lleva su tipo para restaurar tarjetas/notas como tales.
      const decrypted: VaultExportItem[] = await Promise.all(
        list.map(async (r) => ({ ...(await decryptVaultData(vaultKey, r)), tipo: r.tipo })),
      );
      const file = await buildExport(decrypted, exportPw);

      const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vault-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);

      setExportPw("");
      toast.success(t("settings.backup.exported", { count: decrypted.length }));
    } catch {
      toast.error(t("settings.backup.exportError"));
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async () => {
    if (!vaultKey) {
      toast.error(t("settings.backup.needUnlock"));
      return;
    }
    if (!importFile) {
      toast.error(t("settings.backup.pickFile"));
      return;
    }
    setIsImporting(true);
    try {
      const text = await importFile.text();
      let items: VaultExportItem[];

      if (importFile.name.toLowerCase().endsWith(".csv")) {
        items = parseCsv(text);
      } else {
        const parsed = JSON.parse(text) as VaultExportFile | VaultExportItem[];
        if (Array.isArray(parsed)) {
          items = parsed;
        } else if (parsed.format === "passwordmanager-vault") {
          if (!importPw) {
            toast.error(t("settings.backup.importPwNeeded"));
            setIsImporting(false);
            return;
          }
          items = await parseExport(parsed, importPw);
        } else {
          toast.error(t("settings.backup.badFile"));
          setIsImporting(false);
          return;
        }
      }

      if (items.length === 0) {
        toast.error(t("settings.backup.nothing"));
        setIsImporting(false);
        return;
      }

      // Re-cifra cada item con la vaultKey actual y los manda en lote.
      // El tipo va fuera del blob (columna en claro); el uid nuevo es el AAD.
      const encrypted: EncItem[] = await Promise.all(
        items.map(async (it) => {
          const { tipo, ...data } = it;
          const uid = newVaultItemUid();
          const { ciphertext, iv } = await encryptVaultData(vaultKey, data, uid);
          return { tipo: tipo ?? "password", ciphertext, iv, uid };
        }),
      );

      const res = await bulkImport({ items: encrypted });
      setImportFile(null);
      setImportPw("");
      toast.success(t("settings.backup.imported", { count: res.count }));
    } catch {
      toast.error(t("settings.backup.importError"));
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Card className="space-y-5">
      <div className="flex items-center gap-2">
        <Archive className="h-5 w-5 text-primary-500" />
        <CardTitle className="mb-0">{t("settings.backup.title")}</CardTitle>
      </div>
      <p className="text-sm text-text-muted">{t("settings.backup.description")}</p>

      {/* Export */}
      <div className="space-y-3 rounded-xl border border-border-base bg-bg-base p-4">
        <p className="text-sm font-semibold text-text-base">{t("settings.backup.exportTitle")}</p>
        <p className="text-xs text-text-muted">{t("settings.backup.exportHint")}</p>
        <Input label={t("settings.backup.exportPw")} type="password" autoComplete="new-password" value={exportPw} onChange={(e) => setExportPw(e.target.value)} />
        <Button type="button" icon={Download} variant="secondary" isLoading={isExporting} onClick={handleExport}>
          {t("settings.backup.exportBtn")}
        </Button>
      </div>

      {/* Import */}
      <div className="space-y-3 rounded-xl border border-border-base bg-bg-base p-4">
        <p className="text-sm font-semibold text-text-base">{t("settings.backup.importTitle")}</p>
        <p className="text-xs text-text-muted">{t("settings.backup.importHint")}</p>
        <Input label={t("settings.backup.file")} type="file" accept=".json,.csv" onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} />
        <Input label={t("settings.backup.importPw")} type="password" autoComplete="off" value={importPw} onChange={(e) => setImportPw(e.target.value)} />
        <Button type="button" icon={Upload} variant="secondary" isLoading={isImporting} onClick={handleImport}>
          {t("settings.backup.importBtn")}
        </Button>
      </div>
    </Card>
  );
};
