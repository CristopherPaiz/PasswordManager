import { CardBrandInfo } from "./card-brand";
import { PATTERNS, PatternId } from "./card-patterns";

/**
 * Personalización visual de una tarjeta: color y acabado elegidos por el usuario.
 *
 * Por qué existe: los wallets del sistema (Google Wallet, Apple Pay) muestran el
 * arte REAL de la tarjeta porque lo obtienen del emisor a través del Token
 * Service Provider de la red (VTS / MDES), indexado por el BIN. Eso exige ser
 * participante licenciado del programa de tokenización — un gestor de terceros
 * no tiene ese acceso.
 *
 * El atajo tentador sería consultar una API pública de "BIN lookup", pero eso
 * ROMPERÍA el zero-knowledge: mandaría a un tercero el prefijo de cada tarjeta,
 * revelando qué banco usa cada usuario. Así que la elección la hace la persona,
 * y viaja cifrada dentro del blob como cualquier otro campo.
 *
 * Se guarda un ID, no un hex: así el catálogo puede afinarse después sin migrar
 * datos, y nadie puede meter un color ilegible.
 */

export type CardColorId =
  | "brand"
  | "midnight"
  | "graphite"
  | "ocean"
  | "teal"
  | "forest"
  | "gold"
  | "ember"
  | "wine"
  | "violet"
  | "rose"
  | "platinum";

export type CardDesignId =
  | "gradient"
  | "solid"
  | "horizon"
  | "duotone"
  | "guilloche"
  | "waves"
  | "arcs"
  | "grid"
  | "stripes"
  | "mesh"
  | "holo";

interface Palette {
  id: CardColorId;
  from: string;
  to: string;
  /** Texto legible sobre este fondo. */
  fg: string;
}

/**
 * Doce colores que cubren la mayoría de tarjetas reales. Los bancos usan una
 * gama corta: azules y negros para clásicas, dorados y platas para premium.
 * `brand` es el marcador para "usar el color de la marca detectada".
 */
const PALETTES: Record<Exclude<CardColorId, "brand">, Palette> = {
  midnight: { id: "midnight", from: "#0b1220", to: "#1e2a45", fg: "#ffffff" },
  graphite: { id: "graphite", from: "#18181b", to: "#3f3f46", fg: "#ffffff" },
  ocean: { id: "ocean", from: "#0c4a6e", to: "#0284c7", fg: "#ffffff" },
  teal: { id: "teal", from: "#134e4a", to: "#0d9488", fg: "#ffffff" },
  forest: { id: "forest", from: "#14532d", to: "#16a34a", fg: "#ffffff" },
  gold: { id: "gold", from: "#78350f", to: "#d97706", fg: "#ffffff" },
  ember: { id: "ember", from: "#7f1d1d", to: "#dc2626", fg: "#ffffff" },
  wine: { id: "wine", from: "#4c0519", to: "#9f1239", fg: "#ffffff" },
  violet: { id: "violet", from: "#3b0764", to: "#7c3aed", fg: "#ffffff" },
  rose: { id: "rose", from: "#831843", to: "#db2777", fg: "#ffffff" },
  // La única clara: exige texto oscuro o se vuelve ilegible.
  platinum: { id: "platinum", from: "#e5e7eb", to: "#9ca3af", fg: "#111827" },
};

export const CARD_COLOR_IDS: CardColorId[] = [
  "brand",
  "midnight",
  "graphite",
  "ocean",
  "teal",
  "forest",
  "gold",
  "ember",
  "wine",
  "violet",
  "rose",
  "platinum",
];

export const CARD_DESIGN_IDS: CardDesignId[] = [
  "gradient",
  "solid",
  "horizon",
  "duotone",
  "guilloche",
  "waves",
  "arcs",
  "grid",
  "stripes",
  "mesh",
  "holo",
];

export interface ResolvedCardStyle {
  /** Listo para `style={{ backgroundImage }}`. */
  backgroundImage: string;
  /** Color de texto legible sobre ese fondo. */
  fg: string;
  /** Opacidad del brillo diagonal: los acabados planos no lo quieren. */
  sheen: number;
  /**
   * Capa de patrón que va SOBRE el color, en su propio elemento para poder
   * darle opacidad sin afectar al texto. `null` en los acabados lisos.
   */
  pattern: { image: string; opacity: number } | null;
}

/** Colores efectivos: los del usuario, o los de la marca si eligió `brand`. */
const paletteFor = (brand: CardBrandInfo, color: CardColorId): Palette =>
  color === "brand"
    ? { id: "brand", from: brand.from, to: brand.to, fg: brand.fg }
    : PALETTES[color];

/**
 * Combina color y acabado en los estilos finales. Es una función pura para que
 * la vista previa del modal y la lista del baúl no puedan divergir nunca.
 */
export const resolveCardStyle = (
  brand: CardBrandInfo,
  color: CardColorId = "brand",
  design: CardDesignId = "gradient",
): ResolvedCardStyle => {
  const { from, to, fg } = paletteFor(brand, color);

  switch (design) {
    case "solid":
      // Plano de verdad: sin brillo, o dejaría de verse plano.
      return {
        backgroundImage: `linear-gradient(${from}, ${from})`,
        fg,
        sheen: 0,
        pattern: null,
      };

    case "horizon":
      // Banda inferior más oscura, como muchas tarjetas de banco.
      return {
        backgroundImage: `linear-gradient(180deg, ${to} 0%, ${from} 62%, ${from} 100%)`,
        fg,
        sheen: 0.35,
        pattern: null,
      };

    case "duotone":
      // Corte diagonal duro entre los dos tonos.
      return {
        backgroundImage: `linear-gradient(115deg, ${from} 0%, ${from} 48%, ${to} 48%, ${to} 100%)`,
        fg,
        sheen: 0.2,
        pattern: null,
      };

    case "gradient":
      return {
        backgroundImage: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
        fg,
        sheen: 0.6,
        pattern: null,
      };

    default: {
      /**
       * Acabados con patrón: base de color en degradado suave + la capa del
       * patrón encima. Al ser ortogonales, cada patrón funciona con los doce
       * colores sin declarar 12 × 7 combinaciones a mano.
       */
      const spec = PATTERNS[design as PatternId];
      return {
        backgroundImage: `linear-gradient(150deg, ${from} 0%, ${to} 100%)`,
        fg,
        // Los patrones ya aportan luz: un brillo fuerte encima los apaga.
        sheen: 0.18,
        pattern: spec ? { image: spec.image, opacity: spec.opacity } : null,
      };
    }
  }
};

/** Muestra de color para el selector: siempre el degradado, sea cual sea el acabado. */
export const colorSwatch = (brand: CardBrandInfo, color: CardColorId): string => {
  const { from, to } = paletteFor(brand, color);
  return `linear-gradient(135deg, ${from} 0%, ${to} 100%)`;
};

/** Valida lo que venga de un blob viejo o de un respaldo importado. */
export const isCardColorId = (value: unknown): value is CardColorId =>
  typeof value === "string" && (CARD_COLOR_IDS as string[]).includes(value);

export const isCardDesignId = (value: unknown): value is CardDesignId =>
  typeof value === "string" && (CARD_DESIGN_IDS as string[]).includes(value);
