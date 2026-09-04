/**
 * Patrones procedurales para el fondo de la tarjeta.
 *
 * Todo se genera con CSS o con SVG embebido como data URI: **cero peticiones de
 * red y cero bytes de assets**. Un patrón pesa unos cientos de bytes de texto
 * frente a los ~40 KB de una imagen, y escala a cualquier tamaño sin pixelarse.
 *
 * Los patrones son ORTOGONALES al color: se dibujan en blanco translúcido sobre
 * el fondo de color, así los 12 colores × 10 acabados dan 120 combinaciones sin
 * tener que declararlas una por una.
 */

/**
 * SVG a data URI apto para `background-image`.
 *
 * Se codifica con `encodeURIComponent` en vez de base64: pesa menos y queda
 * legible al depurar. `#` DEBE ir escapado o el navegador lo lee como
 * fragmento y el patrón desaparece — es el error clásico con SVG en CSS.
 */
const svgUrl = (svg: string): string =>
  `url("data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, " ").trim())}")`;

/** Guilloché: las curvas finas entrelazadas del papel moneda y las tarjetas. */
const guilloche = (): string => {
  const paths = Array.from({ length: 7 }, (_, i) => {
    const offset = i * 13;
    return `<path d="M0 ${28 + offset} Q 40 ${4 + offset}, 80 ${28 + offset} T 160 ${28 + offset}" />`;
  }).join("");
  return svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120" fill="none"
      stroke="rgba(255,255,255,0.5)" stroke-width="0.7">${paths}</svg>`,
  );
};

/** Ondas amplias, más suaves que el guilloché. */
const waves = (): string =>
  svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" fill="none"
      stroke="rgba(255,255,255,0.55)" stroke-width="1.1">
      <path d="M-20 70 Q 30 20, 100 60 T 220 45" />
      <path d="M-20 88 Q 40 44, 110 78 T 220 62" />
      <path d="M-20 52 Q 25 8, 95 40 T 220 28" />
    </svg>`,
  );

/** Arcos concéntricos saliendo de una esquina. */
const arcs = (): string =>
  svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="140" fill="none"
      stroke="rgba(255,255,255,0.4)" stroke-width="1">
      <circle cx="220" cy="140" r="40" /><circle cx="220" cy="140" r="70" />
      <circle cx="220" cy="140" r="100" /><circle cx="220" cy="140" r="130" />
      <circle cx="220" cy="140" r="160" />
    </svg>`,
  );

/** Retícula fina, tipo tarjeta corporativa. */
const grid = (): string =>
  "repeating-linear-gradient(0deg, rgba(255,255,255,0.10) 0 1px, transparent 1px 14px)," +
  "repeating-linear-gradient(90deg, rgba(255,255,255,0.10) 0 1px, transparent 1px 14px)";

/** Diagonales finas. */
const stripes = (): string =>
  "repeating-linear-gradient(115deg, rgba(255,255,255,0.12) 0 2px, transparent 2px 12px)";

/** Malla de luces suaves, muy usada por los neobancos. */
const mesh = (): string =>
  "radial-gradient(120% 90% at 12% 8%, rgba(255,255,255,0.30), transparent 55%)," +
  "radial-gradient(100% 80% at 92% 20%, rgba(255,255,255,0.18), transparent 50%)," +
  "radial-gradient(120% 100% at 60% 108%, rgba(0,0,0,0.30), transparent 60%)";

/** Barrido holográfico. `conic-gradient` tiene soporte amplio desde 2021. */
const holo = (): string =>
  "conic-gradient(from 210deg at 30% 20%, rgba(255,255,255,0.34), rgba(255,255,255,0) 22%," +
  " rgba(255,255,255,0.26) 42%, rgba(255,255,255,0) 62%, rgba(255,255,255,0.30) 84%," +
  " rgba(255,255,255,0) 100%)";

export interface PatternSpec {
  /** Capa que se dibuja SOBRE el color de fondo. */
  image: string;
  opacity: number;
}

/**
 * Se calculan una sola vez al cargar el módulo: construir los data URI en cada
 * render sería desperdicio, y son constantes.
 */
export const PATTERNS = {
  guilloche: { image: guilloche(), opacity: 0.5 },
  waves: { image: waves(), opacity: 0.55 },
  arcs: { image: arcs(), opacity: 0.6 },
  grid: { image: grid(), opacity: 1 },
  stripes: { image: stripes(), opacity: 1 },
  mesh: { image: mesh(), opacity: 1 },
  holo: { image: holo(), opacity: 1 },
} as const satisfies Record<string, PatternSpec>;

export type PatternId = keyof typeof PATTERNS;
