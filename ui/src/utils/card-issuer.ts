import { CardColorId, isCardColorId } from "./card-design";
import { onlyDigits } from "./card-brand";

/**
 * Identifica al banco EMISOR por el BIN, contra una tabla LOCAL.
 *
 * Por qué local y no una API: existen servicios de "BIN lookup" que devuelven
 * banco y país a partir del prefijo. Usarlos rompería el zero-knowledge —
 * mandaríamos el prefijo de cada tarjeta a un tercero, revelando qué banco usa
 * cada usuario. La tabla viaja con la app y la consulta ocurre en memoria: el
 * número nunca sale del dispositivo.
 *
 * La tabla se carga con `import()` dinámico, así que su peso NO entra al bundle
 * inicial: solo se descarga la primera vez que alguien escribe una tarjeta.
 *
 * Fuente: github.com/venelinkochev/bin-list-data (CC-BY-4.0). Son datos
 * comunitarios, no oficiales: incompletos y solo de 6 dígitos. Por eso el
 * resultado es una SUGERENCIA que el usuario puede cambiar, nunca un dato duro.
 */

export interface IssuerMatch {
  key: string;
  name: string;
  color: CardColorId;
  /** Cuántos dígitos del número hicieron match (6 u 8). */
  matchedDigits: number;
}

interface BinTable {
  issuers: Record<string, { name: string; color: string }>;
  bins: Record<string, string>;
}

// La tabla se pide una sola vez y se reusa; si falla, se recuerda el fallo para
// no reintentar en cada tecla.
let tablePromise: Promise<BinTable | null> | null = null;

const loadTable = (): Promise<BinTable | null> => {
  tablePromise ??= import("../data/bins-gt.json")
    .then((mod) => mod.default as unknown as BinTable)
    .catch(() => null);
  return tablePromise;
};

/**
 * Longitudes de prefijo a probar, de más específica a menos.
 *
 * ISO/IEC 7812 pasó el IIN de 6 a 8 dígitos (publicado en 2017; Visa y
 * Mastercard asignan de 8 desde abril de 2022), pero los de 6 siguen vigentes y
 * no tienen fecha de retiro. Hay que soportar ambos, y el más largo gana.
 */
const PREFIX_LENGTHS = [8, 6];

export const lookupIssuer = async (rawNumber: string): Promise<IssuerMatch | null> => {
  const digits = onlyDigits(rawNumber);
  if (digits.length < 6) return null;

  const table = await loadTable();
  if (!table) return null;

  for (const length of PREFIX_LENGTHS) {
    if (digits.length < length) continue;
    const key = table.bins[digits.slice(0, length)];
    if (!key) continue;
    const issuer = table.issuers[key];
    if (!issuer) continue;
    return {
      key,
      name: issuer.name,
      // El color viene de un JSON: se valida antes de confiar en él.
      color: isCardColorId(issuer.color) ? issuer.color : "graphite",
      matchedDigits: length,
    };
  }

  return null;
};

/** Solo para tests: olvida la tabla cacheada. */
export const resetIssuerCache = (): void => {
  tablePromise = null;
};
