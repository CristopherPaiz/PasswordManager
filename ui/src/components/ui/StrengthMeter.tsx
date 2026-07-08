import { useTranslation } from "react-i18next";
import { estimateStrength } from "@utils/password-strength";

interface StrengthMeterProps {
  password: string;
  className?: string;
}

const BAR_COLORS = ["bg-red-500", "bg-red-500", "bg-amber-500", "bg-lime-500", "bg-green-500"];
const TEXT_COLORS = [
  "text-red-600 dark:text-red-400",
  "text-red-600 dark:text-red-400",
  "text-amber-600 dark:text-amber-400",
  "text-lime-600 dark:text-lime-400",
  "text-green-600 dark:text-green-400",
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
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i < score ? BAR_COLORS[score] : "bg-border-base"
            }`}
          />
        ))}
      </div>
      <p className={`text-xs font-medium ${TEXT_COLORS[score]}`}>{t(labelKey)}</p>
    </div>
  );
};
