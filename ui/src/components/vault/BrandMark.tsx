import { CardBrand } from "@utils/card-brand";

/**
 * Marca de la RED de pago (Visa, Mastercard, …) dibujada como SVG inline.
 *
 * Son formas geométricas simples generadas aquí, no los archivos oficiales de
 * cada red: nada que descargar, nada que versionar, y escala sin pixelarse.
 *
 * Nota de marcas: mostrar la marca de la red para indicar a qué red pertenece
 * una tarjeta guardada es uso descriptivo — es lo que hace cualquier pasarela
 * de pago. Aun así siguen siendo marcas registradas con guías de uso propias;
 * para un producto comercial conviene revisarlas.
 *
 * Se pinta en `currentColor` con opacidad, así hereda el color legible que ya
 * calculó el estilo de la tarjeta y funciona sobre cualquier fondo.
 */

interface BrandMarkProps {
  brand: CardBrand;
  className?: string;
}

/** Mastercard es la única cuya marca ES puramente geométrica: dos círculos. */
const Interlocking = ({ from, to }: { from: string; to: string }) => (
  <>
    <circle cx="9" cy="10" r="7" fill={from} />
    <circle cx="19" cy="10" r="7" fill={to} fillOpacity="0.85" />
  </>
);

const Wordmark = ({ text, letterSpacing = 0.6 }: { text: string; letterSpacing?: number }) => (
  <text
    x="14"
    y="14"
    textAnchor="middle"
    fontSize="10"
    fontWeight="700"
    letterSpacing={letterSpacing}
    fill="currentColor"
    fontFamily="system-ui, sans-serif"
  >
    {text}
  </text>
);

export const BrandMark = ({ brand, className = "" }: BrandMarkProps) => {
  if (brand === "generic") return null;

  const svg = (children: React.ReactNode) => (
    <svg
      viewBox="0 0 28 20"
      className={`h-5 w-7 ${className}`}
      role="img"
      aria-hidden="true"
      style={{ opacity: 0.95 }}
    >
      {children}
    </svg>
  );

  switch (brand) {
    case "mastercard":
      return svg(<Interlocking from="#eb001b" to="#f79e1b" />);
    case "maestro":
      return svg(<Interlocking from="#0099df" to="#ed0006" />);
    case "visa":
      return svg(<Wordmark text="VISA" letterSpacing={1.2} />);
    case "amex":
      return svg(
        <>
          <rect x="1" y="3" width="26" height="14" rx="2" fill="currentColor" fillOpacity="0.16" />
          <Wordmark text="AMEX" />
        </>,
      );
    case "discover":
      return svg(
        <>
          <Wordmark text="DISC" />
          <circle cx="24" cy="6" r="3" fill="#ff6000" />
        </>,
      );
    case "diners":
      return svg(
        <>
          <circle cx="14" cy="10" r="7" fill="currentColor" fillOpacity="0.22" />
          <path d="M14 3.6a6.4 6.4 0 0 1 0 12.8z" fill="currentColor" />
        </>,
      );
    case "jcb":
      return svg(
        <>
          <rect x="2" y="4" width="7" height="12" rx="1.6" fill="#0e4c96" />
          <rect x="10.5" y="4" width="7" height="12" rx="1.6" fill="#d2232a" />
          <rect x="19" y="4" width="7" height="12" rx="1.6" fill="#1f7a3d" />
        </>,
      );
    case "unionpay":
      return svg(
        <>
          <rect x="2" y="4" width="11" height="12" rx="2" fill="#e21836" fillOpacity="0.9" />
          <rect x="9" y="4" width="11" height="12" rx="2" fill="#00447c" fillOpacity="0.85" />
          <rect x="16" y="4" width="10" height="12" rx="2" fill="#007b84" fillOpacity="0.85" />
        </>,
      );
    default:
      return null;
  }
};
