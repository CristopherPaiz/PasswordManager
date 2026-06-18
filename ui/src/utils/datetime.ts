// Toda fecha/hora se muestra en hora de Guatemala (GMT-6), sin importar la zona
// del navegador ni del servidor. Se deriva del instante (UTC/epoch) con Intl.
export const GUATEMALA_TZ = "America/Guatemala";

type DateInput = string | number | Date;

export const formatGuatemala = (input: DateInput, options?: Intl.DateTimeFormatOptions): string =>
  new Intl.DateTimeFormat("es-GT", {
    timeZone: GUATEMALA_TZ,
    dateStyle: "medium",
    timeStyle: "medium",
    ...options,
  }).format(new Date(input));

export const formatGuatemalaDate = (input: DateInput): string =>
  new Intl.DateTimeFormat("es-GT", { timeZone: GUATEMALA_TZ, dateStyle: "medium" }).format(new Date(input));

export const formatGuatemalaTime = (input: DateInput): string =>
  new Intl.DateTimeFormat("es-GT", { timeZone: GUATEMALA_TZ, timeStyle: "medium" }).format(new Date(input));

// Formatea un instante en una zona horaria arbitraria (ej: la zona real del servidor).
export const formatInZone = (input: DateInput, timeZone: string, options?: Intl.DateTimeFormatOptions): string =>
  new Intl.DateTimeFormat("es-GT", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "medium",
    ...options,
  }).format(new Date(input));
