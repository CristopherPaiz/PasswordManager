import { useTranslation } from "react-i18next";
import { estimateStrength } from "@utils/password-strength";

interface StrengthMeterProps {
  password: string;
  className?: string;
}

const BAR_COLORS = ["bg-signal-danger", "bg-signal-danger", "bg-signal-accent", "bg-signal-info", "bg-signal-success"];
const TEXT_COLORS = [
  "text-signal-danger",
  "text-signal-danger",
  "text-signal-accent",
  "text-signal-info",
  "text-signal-success",
];

// Barra de 4 segmentos + etiqueta. Reutiliza el estimador de `password-strength`.
// No se muestra nada si el campo está vacío (evita ruido en formularios nuevos).
export const StrengthMeter = ({ password, className = "" }: StrengthMeterProps) => {
  const { t } = useTranslation();
  if (!password) return null;

  const { score, labelKey } = estimateStrength(password);

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex gap-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={`h-0.5 flex-1 rounded-full transition-colors ${
              i < score ? BAR_COLORS[score] : "bg-border-base"
            }`}
          />
        ))}
      </div>
      <p className={`text-caption font-medium ${TEXT_COLORS[score]}`}>{t(labelKey)}</p>
    </div>
  );
};
