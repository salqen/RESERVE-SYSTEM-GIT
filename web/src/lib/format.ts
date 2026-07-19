/** Formátovanie pre UI (SK locale). Čisté funkcie. */

export const eur = (v: string | number) =>
  new Intl.NumberFormat('sk-SK', { style: 'currency', currency: 'EUR' }).format(Number(v));

export const dateLabel = (iso: string) =>
  new Intl.DateTimeFormat('sk-SK', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(iso));

export const timeLabel = (iso: string) =>
  new Intl.DateTimeFormat('sk-SK', { timeStyle: 'short', timeZone: 'UTC' }).format(new Date(iso));

export const dateTimeLabel = (iso: string) =>
  new Intl.DateTimeFormat('sk-SK', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(iso));

export const minutesLabel = (min: number) =>
  min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}` : `${min} min`;

/** Počet nocí medzi ISO dátumami [checkIn, checkOut). */
export const nightsBetween = (checkIn: string, checkOut: string) =>
  Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86_400_000);
