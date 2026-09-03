/**
 * Detección de marca de tarjeta por prefijo (IIN/BIN), 100% local.
 * Nada de esto viaja al server: el número vive dentro del blob cifrado y la
 * detección solo sirve para presentar (color, etiqueta, agrupación de dígitos)
 * y para validar la entrada del usuario.
 *
 * Los colores son de MARCA, no del sistema de diseño: una tarjeta es la
 * representación de un objeto real, así que se declaran como hex explícitos y
 * se aplican por `style`, nunca como clases de Tailwind. Así el sistema de
 * tokens sigue siendo la única fuente de verdad para el chrome de la app.
 */

export type CardBrand =
  | "visa"
  | "mastercard"
  | "amex"
  | "discover"
  | "diners"
  | "jcb"
  | "unionpay"
  | "maestro"
  | "generic";

export interface CardBrandInfo {
  brand: CardBrand;
  label: string;
  /** Extremos del degradado del mini-visual. */
  from: string;
  to: string;
  /** Color de texto legible sobre ese degradado. */
  fg: string;
  /** Longitud del código de seguridad: Amex usa 4, el resto 3. */
  cvvLength: number;
  /** Longitudes válidas del número (sin espacios). */
  lengths: number[];
  /** Agrupación de dígitos al mostrar. */
  groups: number[];
}

const BRANDS: Record<CardBrand, CardBrandInfo> = {
  visa: {
    brand: "visa",
    label: "Visa",
    from: "#1a1f71",
    to: "#2b4fb8",
    fg: "#ffffff",
    cvvLength: 3,
    lengths: [13, 16, 19],
    groups: [4, 4, 4, 4],
  },
  mastercard: {
    brand: "mastercard",
    label: "Mastercard",
    from: "#c2410c",
    to: "#f59e0b",
    fg: "#ffffff",
    cvvLength: 3,
    lengths: [16],
    groups: [4, 4, 4, 4],
  },
  amex: {
    brand: "amex",
    label: "American Express",
    from: "#0f6fa8",
    to: "#22a9e0",
    fg: "#ffffff",
    cvvLength: 4,
    lengths: [15],
    groups: [4, 6, 5],
  },
  discover: {
    brand: "discover",
    label: "Discover",
    from: "#c2410c",
    to: "#fb923c",
    fg: "#ffffff",
    cvvLength: 3,
    lengths: [16, 19],
    groups: [4, 4, 4, 4],
  },
  diners: {
    brand: "diners",
    label: "Diners Club",
    from: "#0d4f7c",
    to: "#0086c8",
    fg: "#ffffff",
    cvvLength: 3,
    lengths: [14, 16, 19],
    groups: [4, 6, 4],
  },
  jcb: {
    brand: "jcb",
    label: "JCB",
    from: "#0e4c96",
    to: "#1f7a3d",
    fg: "#ffffff",
    cvvLength: 3,
    lengths: [16, 17, 18, 19],
    groups: [4, 4, 4, 4],
  },
  unionpay: {
    brand: "unionpay",
    label: "UnionPay",
    from: "#9f1239",
    to: "#0369a1",
    fg: "#ffffff",
    cvvLength: 3,
    lengths: [16, 17, 18, 19],
    groups: [4, 4, 4, 4],
  },
  maestro: {
    brand: "maestro",
    label: "Maestro",
    from: "#0f4c81",
    to: "#c2410c",
    fg: "#ffffff",
    cvvLength: 3,
    lengths: [12, 13, 14, 15, 16, 17, 18, 19],
    groups: [4, 4, 4, 4],
  },
  generic: {
    brand: "generic",
    label: "",
    from: "#23252a",
    to: "#383b3f",
    fg: "#ffffff",
    cvvLength: 3,
    lengths: [12, 13, 14, 15, 16, 17, 18, 19],
    groups: [4, 4, 4, 4],
  },
};

/**
 * El ORDEN importa: los prefijos se solapan. Amex (34/37) debe probarse antes
 * que Diners (30/36/38), y Maestro antes que Mastercard y Discover.
 */
const MATCHERS: [RegExp, CardBrand][] = [
  [/^4/, "visa"],
  [/^3[47]/, "amex"],
  [/^3(?:0[0-5]|[68])/, "diners"],
  [/^35(?:2[89]|[3-8])/, "jcb"],
  [/^62/, "unionpay"],
  [/^(?:5018|5020|5038|5893|6304|6759|676[1-3])/, "maestro"],
  [/^(?:5[1-5]|2(?:2[2-9]|[3-6]\d|7[01]|720))/, "mastercard"],
  [/^6(?:011|4[4-9]|5)/, "discover"],
];

export const onlyDigits = (value: string): string => value.replace(/\D/g, "");

export const detectCardBrand = (rawNumber: string): CardBrandInfo => {
  const num = onlyDigits(rawNumber);
  for (const [pattern, brand] of MATCHERS) {
    if (pattern.test(num)) return BRANDS[brand];
  }
  return BRANDS.generic;
};

export const getBrandInfo = (brand: CardBrand): CardBrandInfo => BRANDS[brand];

/** Degradado del mini-visual, listo para `style={{ backgroundImage }}`. */
export const brandGradient = (info: CardBrandInfo): string =>
  `linear-gradient(135deg, ${info.from} 0%, ${info.to} 100%)`;

/** Agrupa según la marca: Amex 4-6-5, Diners 4-6-4, resto 4-4-4-4. */
export const formatCardNumber = (rawNumber: string): string => {
  const num = onlyDigits(rawNumber);
  const { groups } = detectCardBrand(num);
  const parts: string[] = [];
  let i = 0;
  for (const size of groups) {
    if (i >= num.length) break;
    parts.push(num.slice(i, i + size));
    i += size;
  }
  // Dígitos de sobra (p. ej. Maestro de 19) van en un grupo final.
  if (i < num.length) parts.push(num.slice(i));
  return parts.join(" ");
};

/** Máximo de dígitos aceptados, para acotar `maxLength` en el input. */
export const maxCardDigits = (rawNumber: string): number => {
  const { lengths } = detectCardBrand(rawNumber);
  return Math.max(...lengths);
};

export const cardLast4 = (rawNumber: string): string => {
  const num = onlyDigits(rawNumber);
  return num.length >= 4 ? num.slice(-4) : num;
};

/** Enmascara todo menos los últimos 4, respetando la agrupación de la marca. */
export const maskCardNumber = (rawNumber: string): string => {
  const num = onlyDigits(rawNumber);
  if (num.length <= 4) return num;
  const masked = "•".repeat(num.length - 4) + num.slice(-4);
  const { groups } = detectCardBrand(num);
  const parts: string[] = [];
  let i = 0;
  for (const size of groups) {
    if (i >= masked.length) break;
    parts.push(masked.slice(i, i + size));
    i += size;
  }
  if (i < masked.length) parts.push(masked.slice(i));
  return parts.join(" ");
};

/**
 * Algoritmo de Luhn. Detecta dígitos mal tecleados antes de guardar; NO prueba
 * que la tarjeta exista. Es una ayuda de captura, nunca una validación dura:
 * el usuario siempre puede guardar lo que quiera.
 */
export const isValidLuhn = (rawNumber: string): boolean => {
  const num = onlyDigits(rawNumber);
  if (num.length < 12) return false;
  let sum = 0;
  let double = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let digit = num.charCodeAt(i) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
};

/** ¿El número tiene una longitud válida para su marca? */
export const hasValidLength = (rawNumber: string): boolean => {
  const num = onlyDigits(rawNumber);
  return detectCardBrand(num).lengths.includes(num.length);
};

/** Normaliza el vencimiento a MM/AA mientras se escribe. */
export const formatExpiry = (raw: string): string => {
  const num = onlyDigits(raw).slice(0, 4);
  if (num.length === 0) return "";
  // Un primer dígito de 2 a 9 solo puede ser el mes 02..09: se autocompleta.
  if (num.length === 1) return Number(num) > 1 ? `0${num}/` : num;
  const month = num.slice(0, 2);
  const rest = num.slice(2);
  return rest ? `${month}/${rest}` : `${month}/`;
};

/** ¿El vencimiento es un MM/AA con mes real y no está caducado? */
export const isExpiryValid = (value: string, now = new Date()): boolean => {
  const match = /^(\d{2})\/(\d{2})$/.exec(value.trim());
  if (!match) return false;
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  if (month < 1 || month > 12) return false;
  // Una tarjeta vence al FINAL de su mes: comparamos contra el mes siguiente.
  return (
    new Date(year, month, 1) > new Date(now.getFullYear(), now.getMonth(), 1)
  );
};
