// Hora de Guatemala = GMT-6 (sin horario de verano).
// Se deriva SIEMPRE del instante UTC, así da igual la zona horaria real del
// servidor de deploy (Render, etc.): la hora de Guatemala se calcula correcta.
export const TIMEZONE = 'America/Guatemala'
export const GMT_OFFSET = '-06:00'

const guatemalaFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23'
})

// 'YYYY-MM-DD HH:mm:ss' en hora de Guatemala.
export const formatGuatemala = (date: Date = new Date()): string => guatemalaFormatter.format(date).replace(',', '')

// Convierte un timestamp UTC de SQLite ("YYYY-MM-DD HH:MM:SS", sin zona) a Date.
export const sqliteUtcToDate = (value: string): Date => new Date(value.replace(' ', 'T') + 'Z')

export interface ServerTimeInfo {
  epoch: number // milisegundos desde epoch (instante UTC, independiente de zona)
  utc: string // ISO en UTC
  guatemala: string // hora de Guatemala formateada
  timezone: string // 'America/Guatemala'
  offset: string // '-06:00'
  serverTimezone: string // zona real del servidor (para diagnóstico)
}

export const getServerTimeInfo = (): ServerTimeInfo => {
  const now = new Date()
  return {
    epoch: now.getTime(),
    utc: now.toISOString(),
    guatemala: formatGuatemala(now),
    timezone: TIMEZONE,
    offset: GMT_OFFSET,
    serverTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  }
}
