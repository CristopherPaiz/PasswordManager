import { useTranslation } from "react-i18next";
import {
  CardBrandInfo,
  cardLast4,
  formatCardNumber,
  maskCardNumber,
} from "@utils/card-brand";
import {
  CardColorId,
  CardDesignId,
  isCardColorId,
  isCardDesignId,
  resolveCardStyle,
} from "@utils/card-design";

/**
 * Mini-visual de una tarjeta, con la proporción real (85.6 × 53.98 mm ≈ 1.586).
 * Se usa en DOS sitios con la misma pieza: la vista previa en vivo del modal y
 * la lista del baúl. Así lo que el usuario ve al capturar es exactamente lo que
 * verá después.
 *
 * Los colores vienen de `card-brand` como hex y se aplican por `style`, no por
 * clases: son colores de MARCA, no del sistema de diseño. Mantenerlos fuera de
 * Tailwind evita que se cuelen a la paleta de la app.
 */

interface CardVisualProps {
  brand: CardBrandInfo;
  number?: string;
  holder?: string;
  expiry?: string;
  issuer?: string;
  /** Muestra el número completo. Por defecto solo los últimos 4. */
  revealed?: boolean;
  /** Color elegido por el usuario. `brand` (o ausente) usa el de la marca. */
  color?: CardColorId;
  /** Acabado del fondo. Ausente = degradado diagonal. */
  design?: CardDesignId;
  /** `sm` para la lista, `md` para el modal. */
  size?: "sm" | "md";
  className?: string;
}

export const CardVisual = ({
  brand,
  number = "",
  holder,
  expiry,
  issuer,
  color = "brand",
  design = "gradient",
  revealed = false,
  size = "sm",
  className = "",
}: CardVisualProps) => {
  const { t } = useTranslation();
  const digits = number.replace(/\D/g, "");
  const isCompact = size === "sm";
  // Color y acabado se resuelven en una función pura compartida, así la vista
  // previa del modal y la lista del baúl no pueden divergir.
  //
  // Se VALIDAN antes de usarse: estos valores salen de un blob descifrado que
  // pudo venir de un respaldo importado o de una versión futura de la app. Un
  // id desconocido cae al valor por defecto en vez de romper el render.
  const style = resolveCardStyle(
    brand,
    isCardColorId(color) ? color : "brand",
    isCardDesignId(design) ? design : "gradient",
  );

  // Sin número aún, se muestran los cuatro grupos como guía visual.
  const displayNumber = digits
    ? revealed
      ? formatCardNumber(digits)
      : maskCardNumber(digits)
    : "•••• •••• •••• ••••";

  return (
    <div
      className={`relative w-full overflow-hidden rounded-card ${isCompact ? "max-w-[19rem]" : "max-w-[22rem]"} ${className}`}
      style={{
        aspectRatio: "1.586 / 1",
        backgroundImage: style.backgroundImage,
        color: style.fg,
      }}
    >
      {/* Brillo diagonal: da volumen sin necesidad de sombra. */}
      {style.sheen > 0 && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            opacity: style.sheen,
            backgroundImage:
              "linear-gradient(115deg, rgba(255,255,255,0.16) 0%, transparent 42%)",
          }}
          aria-hidden="true"
        />
      )}

      <div
        className={`relative flex h-full flex-col justify-between ${isCompact ? "p-3.5" : "p-4"}`}
      >
        <div className="flex items-start justify-between gap-2">
          {/* Chip EMV dibujado con CSS: sin imagen que cargar ni assets que versionar. */}
          <div
            className={`${isCompact ? "h-6 w-8" : "h-7 w-9"} shrink-0 rounded-[4px]`}
            style={{
              backgroundImage:
                "linear-gradient(145deg, #e8c66b 0%, #b8912f 55%, #f2dd9a 100%)",
              boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.18)",
            }}
            aria-hidden="true"
          />
          <span
            className={`truncate text-right font-semibold uppercase tracking-wide ${isCompact ? "text-caption" : "text-body"}`}
            style={{ opacity: 0.92 }}
          >
            {brand.label || issuer || ""}
          </span>
        </div>

        <p
          className={`font-mono tabular-nums ${isCompact ? "text-body" : "text-title"}`}
          style={{ letterSpacing: "0.06em" }}
        >
          {displayNumber}
        </p>

        <div
          className={`flex items-end justify-between gap-3 ${isCompact ? "text-caption" : "text-caption"}`}
        >
          <div className="min-w-0">
            <span
              className="block uppercase"
              style={{
                opacity: 0.62,
                fontSize: "0.68em",
                letterSpacing: "0.08em",
              }}
            >
              {t("vault.fields.cardHolder")}
            </span>
            <span className="block truncate font-medium uppercase">
              {holder?.trim() || "—"}
            </span>
          </div>
          <div className="shrink-0 text-right">
            <span
              className="block uppercase"
              style={{
                opacity: 0.62,
                fontSize: "0.68em",
                letterSpacing: "0.08em",
              }}
            >
              {t("vault.fields.cardExpiry")}
            </span>
            <span className="block font-mono font-medium tabular-nums">
              {expiry?.trim() || "••/••"}
            </span>
          </div>
        </div>
      </div>

      {/* El emisor va como banda inferior solo si hay espacio y dato. */}
      {issuer && brand.label && (
        <span
          className="absolute bottom-1.5 left-3.5 truncate text-caption"
          style={{ opacity: 0.55, maxWidth: "55%" }}
        >
          {issuer}
        </span>
      )}

      {/* Lectores de pantalla: el visual es decorativo, esto es el contenido. */}
      <span className="sr-only">
        {brand.label}{" "}
        {digits ? t("vault.card.endingIn", { last4: cardLast4(digits) }) : ""}
      </span>
    </div>
  );
};
