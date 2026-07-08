/**
 * Búsqueda tolerante para el baúl:
 * - Insensible a mayúsculas y a tildes/diacríticos ("Débito" ≡ "debito").
 * - Fuzzy por subsecuencia dentro de palabra: "dbito" encuentra "débito"
 *   (letras en orden, se permiten letras faltantes), estilo autocompletado.
 *
 * Todo ocurre en memoria sobre los items YA descifrados: nada de esto viaja
 * al server (la búsqueda no rompe el modelo zero-knowledge).
 */

// NFD separa la letra base del acento; el rango U+0300–U+036F son los acentos.
export const normalizeText = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

// ¿`query` es subsecuencia de `word`? (letras en orden, no necesariamente
// contiguas). Se exige que la primera letra coincida para acotar el ruido.
const isSubsequence = (query: string, word: string): boolean => {
  if (query.length === 0 || word.length === 0) return false;
  if (query[0] !== word[0]) return false;
  let qi = 0;
  for (let wi = 0; wi < word.length && qi < query.length; wi++) {
    if (word[wi] === query[qi]) qi++;
  }
  return qi === query.length;
};

// ¿El texto contiene la consulta? Primero substring normalizado (rápido y
// preciso); si no, subsecuencia palabra por palabra (tolera letras faltantes).
export const fuzzyMatch = (rawQuery: string, rawText: string): boolean => {
  const query = normalizeText(rawQuery.trim());
  if (query.length === 0) return true;
  const text = normalizeText(rawText);
  if (text.includes(query)) return true;
  return text.split(/[^a-z0-9]+/).some((word) => isSubsequence(query, word));
};

// Un item coincide si CUALQUIERA de sus campos coincide. La consulta puede
// traer varias palabras: todas deben encontrarse (en cualquier campo).
export const matchesSearch = (rawQuery: string, fields: string[]): boolean => {
  const terms = rawQuery.trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  return terms.every((term) => fields.some((field) => field && fuzzyMatch(term, field)));
};
