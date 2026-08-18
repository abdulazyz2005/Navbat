import { formatAmount, formatRating } from '@navbat/shared';

export { formatAmount, formatRating };

const MONTHS = [
  'yanvar',
  'fevral',
  'mart',
  'aprel',
  'may',
  'iyun',
  'iyul',
  'avgust',
  'sentabr',
  'oktabr',
  'noyabr',
  'dekabr',
];

const WEEKDAYS = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'];

export function money(amount: number): string {
  return `${formatAmount(amount)} so‘m`;
}

export function todayISO(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

/** "2026-08-20" -> "20-avgust" */
export function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()}-${MONTHS[d.getUTCMonth()]}`;
}

/** "2026-08-20" -> "20-avgust, payshanba" */
export function longDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()}-${MONTHS[d.getUTCMonth()]}, ${WEEKDAYS[d.getUTCDay()]}`;
}

/** Bugun / Ertaga / sana */
export function relativeDate(iso: string): string {
  const today = todayISO();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setMinutes(tomorrow.getMinutes() - tomorrow.getTimezoneOffset());
  if (iso === today) return 'Bugun';
  if (iso === tomorrow.toISOString().slice(0, 10)) return 'Ertaga';
  return shortDate(iso);
}

export function timeAgo(isoDateTime: string): string {
  const diff = Date.now() - new Date(isoDateTime).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'hozir';
  if (minutes < 60) return `${minutes} daq oldin`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} soat oldin`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} kun oldin`;
  return shortDate(isoDateTime.slice(0, 10));
}

export function clockTime(isoDateTime: string): string {
  const d = new Date(isoDateTime);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function distanceLabel(km?: number): string | null {
  if (km === undefined || !Number.isFinite(km)) return null;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}
