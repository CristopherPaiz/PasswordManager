import { useTranslation } from "react-i18next";
import { CardBrandInfo } from "@utils/card-brand";
import {
  CARD_COLOR_IDS,
  CARD_DESIGN_IDS,
  CardColorId,
  CardDesignId,
  colorSwatch,
  resolveCardStyle,
} from "@utils/card-design";

/**
 * Selector de color y acabado de la tarjeta.
 *
 * Existe porque la app NO puede adivinar el arte real de la tarjeta: eso lo
 * resuelven los wallets del sistema pidiéndoselo al emisor a través de la red
 * (VTS / MDES) usando el BIN, y hacer esa consulta contra un servicio externo
 * rompería el zero-knowledge. Así que elige la persona.
 *
 * Móvil primero: cuadrícula de muestras de 44px (mínimo táctil) que se adapta
 * al ancho, con `aria-pressed` para que se anuncie el estado.
 */

interface CardStylePickerProps {
  brand: CardBrandInfo;
  color: CardColorId;
  design: CardDesignId;
  onColorChange: (color: CardColorId) => void;
  onDesignChange: (design: CardDesignId) => void;
}

export const CardStylePicker = ({
  brand,
  color,
  design,
  onColorChange,
  onDesignChange,
}: CardStylePickerProps) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <span className="block text-caption font-medium text-text-muted">
          {t("vault.card.color")}
        </span>
        <div className="flex flex-wrap gap-2">
          {CARD_COLOR_IDS.map((id) => {
            const selected = color === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onColorChange(id)}
                aria-pressed={selected}
                aria-label={t(`vault.card.colors.${id}`)}
                title={t(`vault.card.colors.${id}`)}
                className={`h-11 w-11 rounded-input border-2 transition-transform cursor-pointer hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${
                  selected ? "border-primary-500" : "border-border-base"
                }`}
                style={{ backgroundImage: colorSwatch(brand, id) }}
              />
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <span className="block text-caption font-medium text-text-muted">
          {t("vault.card.design")}
        </span>
        {/* Cada opción se pinta con SU acabado: la muestra ES el resultado. */}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {CARD_DESIGN_IDS.map((id) => {
            const selected = design === id;
            const preview = resolveCardStyle(brand, color, id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => onDesignChange(id)}
                aria-pressed={selected}
                className={`flex min-h-11 flex-col items-center gap-1.5 rounded-input border p-2 text-caption font-medium transition-colors cursor-pointer ${
                  selected
                    ? "border-primary-500 text-text-base"
                    : "border-border-base text-text-muted hover:border-primary-500/40"
                }`}
              >
                <span
                  className="relative h-6 w-full overflow-hidden rounded-badge"
                  style={{ backgroundImage: preview.backgroundImage }}
                  aria-hidden="true"
                >
                  {/* La muestra ES el resultado: si el acabado lleva patrón, se
                      ve aquí. Sin esto, siete opciones se verían idénticas. */}
                  {preview.pattern && (
                    <span
                      className="absolute inset-0"
                      style={{
                        backgroundImage: preview.pattern.image,
                        opacity: preview.pattern.opacity,
                      }}
                    />
                  )}
                </span>
                {t(`vault.card.designs.${id}`)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
