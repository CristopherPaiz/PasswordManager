import { ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, Eye, EyeOff } from "lucide-react";

/**
 * Fila de un dato sensible: etiqueta, valor enmascarado, revelar y copiar.
 * Una sola pieza para contraseña, número de tarjeta, CVV y PIN — antes cada
 * uno repetía el mismo bloque con variaciones.
 *
 * Móvil primero: los botones miden 44×44 (el mínimo táctil recomendado) aunque
 * el icono sea de 16px, y el valor va en `min-w-0 truncate` para que un número
 * largo NO desborde la tarjeta (Regla 0).
 */

interface SecretRowProps {
  label: string;
  /** Valor real, el que se copia. */
  value: string;
  /** Cómo se ve mientras está oculto. Por defecto, puntos. */
  masked?: string;
  /** Cómo se ve al revelarse. Por defecto, el valor tal cual. */
  formatted?: string;
  /** Etiqueta accesible del botón de copiar. */
  copyLabel: string;
  /** Mensaje del toast al copiar. */
  copiedMessage: string;
  onCopy: (value: string, message: string) => void;
  /** Se muestra a la izquierda del valor (p. ej. el logo de la marca). */
  icon?: ReactNode;
  /** `true` deja el valor siempre visible (no es secreto, p. ej. el titular). */
  alwaysVisible?: boolean;
  className?: string;
}

const ICON_BUTTON =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-button text-text-muted transition-colors hover:bg-bg-surface hover:text-text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 cursor-pointer";

export const SecretRow = ({
  label,
  value,
  masked,
  formatted,
  copyLabel,
  copiedMessage,
  onCopy,
  icon,
  alwaysVisible = false,
  className = "",
}: SecretRowProps) => {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(alwaysVisible);
  const [justCopied, setJustCopied] = useState(false);

  if (!value) return null;

  const shown = revealed
    ? (formatted ?? value)
    : (masked ?? "•".repeat(Math.min(value.length, 12)));

  const handleCopy = () => {
    onCopy(value, copiedMessage);
    setJustCopied(true);
    window.setTimeout(() => setJustCopied(false), 1500);
  };

  return (
    <div
      className={`flex items-center gap-1 rounded-input bg-bg-base pl-3 ${className}`}
    >
      <div className="flex min-w-0 flex-1 flex-col py-1.5">
        <span className="text-caption text-text-muted">{label}</span>
        <span className="min-w-0 truncate font-mono text-body tabular-nums text-text-base">
          {icon}
          {shown}
        </span>
      </div>

      {!alwaysVisible && (
        <button
          type="button"
          onClick={() => setRevealed((v) => !v)}
          className={ICON_BUTTON}
          aria-label={
            revealed
              ? t("vault.hideValue", { label })
              : t("vault.showValue", { label })
          }
          aria-pressed={revealed}
        >
          {revealed ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      )}

      <button
        type="button"
        onClick={handleCopy}
        className={ICON_BUTTON}
        aria-label={copyLabel}
      >
        {justCopied ? (
          <Check className="h-4 w-4 text-signal-success" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </button>
    </div>
  );
};
