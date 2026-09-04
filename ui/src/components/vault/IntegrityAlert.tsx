import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ShieldAlert } from "lucide-react";
import { IntegrityReport } from "@utils/manifest";
import { Button } from "@components/ui/Button";

interface IntegrityAlertProps {
  report: IntegrityReport;
  onAcknowledge: () => Promise<void>;
}

/**
 * Aviso de que lo que el servidor entregó no coincide con el inventario que el
 * usuario firmó (items borrados, revertidos o inyectados, o el baúl completo
 * servido en una versión vieja).
 *
 * "Reconocer" vuelve a firmar el estado actual: es lo correcto cuando el cambio
 * viene de otro dispositivo del propio usuario. Si no fue así, el aviso es
 * exactamente lo que debía verse.
 */
export const IntegrityAlert = ({ report, onAcknowledge }: IntegrityAlertProps) => {
  const { t } = useTranslation();
  const [isWorking, setIsWorking] = useState(false);

  const handleAcknowledge = async () => {
    setIsWorking(true);
    try {
      await onAcknowledge();
    } finally {
      setIsWorking(false);
    }
  };

  const lines: string[] = [];
  if (report.unreadable) lines.push(t("vault.integrity.unreadable"));
  if (report.rolledBack) lines.push(t("vault.integrity.rolledBack"));
  if (report.missing.length > 0)
    lines.push(t("vault.integrity.missing", { count: report.missing.length }));
  if (report.modified.length > 0)
    lines.push(t("vault.integrity.modified", { count: report.modified.length }));
  if (report.unknown.length > 0)
    lines.push(t("vault.integrity.unknown", { count: report.unknown.length }));
  if (report.missingLegacy > 0)
    lines.push(t("vault.integrity.missingLegacy", { count: report.missingLegacy }));

  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-card border border-signal-danger/40 bg-signal-danger/10 p-4 sm:flex-row sm:items-start"
    >
      <ShieldAlert className="h-5 w-5 shrink-0 text-signal-danger" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-semibold text-text-base">{t("vault.integrity.title")}</p>
        <ul className="list-disc space-y-0.5 pl-5 text-body text-text-muted">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="text-caption text-text-muted">{t("vault.integrity.hint")}</p>
      </div>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        isLoading={isWorking}
        onClick={handleAcknowledge}
        className="shrink-0"
      >
        {t("vault.integrity.acknowledge")}
      </Button>
    </div>
  );
};
