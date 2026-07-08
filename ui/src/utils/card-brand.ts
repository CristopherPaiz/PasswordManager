/**
 * Detecta la marca de una tarjeta por su prefijo (IIN/BIN), 100% local.
 * Solo para presentación (icono + gradiente); nada de esto viaja al server.
 */

export type CardBrand = "visa" | "mastercard" | "amex" | "discover" | "generic";

interface CardBrandInfo {
  brand: CardBrand;
  label: string;
  // Gradiente para el mini-visual de la tarjeta (se ve bien en claro y oscuro).
  gradient: string;
}

const BRAND_INFO: Record<CardBrand, CardBrandInfo> = {
  visa: { brand: "visa", label: "Visa", gradient: "from-blue-600 to-blue-800" },
  mastercard: { brand: "mastercard", label: "Mastercard", gradient: "from-orange-500 to-red-600" },
  amex: { brand: "amex", label: "American Express", gradient: "from-teal-500 to-cyan-700" },
  discover: { brand: "discover", label: "Discover", gradient: "from-amber-500 to-orange-600" },
  generic: { brand: "generic", label: "", gradient: "from-slate-600 to-slate-800" },
};

export const detectCardBrand = (rawNumber: string): CardBrandInfo => {
  const num = rawNumber.replace(/\D/g, "");
  if (/^4/.test(num)) return BRAND_INFO.visa;
  if (/^(5[1-5]|2[2-7])/.test(num)) return BRAND_INFO.mastercard;
  if (/^3[47]/.test(num)) return BRAND_INFO.amex;
  if (/^6(011|5|4[4-9])/.test(num)) return BRAND_INFO.discover;
  return BRAND_INFO.generic;
};

// Agrupa dígitos para mostrar: Amex 4-6-5, resto 4-4-4-4.
export const formatCardNumber = (rawNumber: string): string => {
  const num = rawNumber.replace(/\D/g, "");
  const isAmex = /^3[47]/.test(num);
  const groups = isAmex ? [4, 6, 5] : [4, 4, 4, 4];
  const parts: string[] = [];
  let i = 0;
  for (const g of groups) {
    if (i >= num.length) break;
    parts.push(num.slice(i, i + g));
    i += g;
  }
  if (i < num.length) parts.push(num.slice(i));
  return parts.join(" ");
};

// Últimos 4 dígitos, para mostrar sin exponer la tarjeta completa.
export const cardLast4 = (rawNumber: string): string => {
  const num = rawNumber.replace(/\D/g, "");
  return num.length >= 4 ? num.slice(-4) : num;
};
