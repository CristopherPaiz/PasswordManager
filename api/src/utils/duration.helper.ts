// Convierte duraciones estilo jsonwebtoken ("7d", "12h", "30m", "45s" o un
// número "puro" en segundos) a milisegundos. La cookie de sesión y la fila de
// Sesiones deben vivir EXACTAMENTE lo mismo que el JWT: si difieren, quedan
// cookies vivas con tokens muertos (o al revés).
const UNIT_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000
}

export const durationToMs = (value: string, fallbackMs = 7 * 86_400_000): number => {
  const trimmed = value.trim()
  // jsonwebtoken interpreta un número sin unidad como SEGUNDOS.
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1_000
  const match = /^(\d+(?:\.\d+)?)\s*(s|m|h|d|w)$/i.exec(trimmed)
  if (!match) return fallbackMs
  return Math.round(Number(match[1]) * UNIT_MS[match[2].toLowerCase()])
}
