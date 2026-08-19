/**
 * Pul hisob-kitobi.
 *
 * QOIDA: hech qachon floating point ishlatilmaydi.
 * UZS uchun eng kichik amaliy birlik — 1 so'm. Hamma summalar integer.
 * Komissiya yaxlitlash: Math.round emas, aniq integer division bilan
 * (fee = offered * percent / 100, qoldiq platformaga foyda emas — pastga yaxlitlanadi,
 *  ya'ni foydalanuvchi hech qachon ortiqcha to'lamaydi).
 */

export const DEFAULT_PLATFORM_FEE_PERCENT = 10;

export interface PriceBreakdown {
  /** Buyurtmachi e'lon qilgan (va to'laydigan) narx */
  offeredAmount: number;
  /** Platforma xizmat haqi — navbatchining ulushidan ushlanadi */
  platformFee: number;
  /** Navbatchi qo'liga tegadigan summa (offeredAmount - platformFee) */
  workerAmount: number;
  /** Buyurtmachi to'laydigan jami summa (== offeredAmount) */
  totalAmount: number;
  feePercent: number;
}

export function assertPositiveInteger(value: number, field = 'amount'): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${field} butun son bo'lishi kerak, keldi: ${value}`);
  }
  if (value <= 0) {
    throw new Error(`${field} musbat bo'lishi kerak, keldi: ${value}`);
  }
}

/**
 * Komissiya NAVBATCHIDAN ushlanadi (buyurtmachi ustiga qo'shilmaydi):
 *
 *   platform_fee  = offered_amount * fee_percent / 100   (pastga yaxlitlangan integer)
 *   worker_amount = offered_amount - platform_fee
 *   buyer_total   = offered_amount
 *
 * Ya'ni buyurtmachi e'londa ko'rgan summani to'laydi, navbatchi esa
 * xizmat haqi ushlangandan keyingi summani oladi.
 */
export function calculatePrice(
  offeredAmount: number,
  feePercent: number = DEFAULT_PLATFORM_FEE_PERCENT,
): PriceBreakdown {
  assertPositiveInteger(offeredAmount, 'offeredAmount');
  if (!Number.isInteger(feePercent) || feePercent < 0 || feePercent > 100) {
    throw new Error(`feePercent 0..100 oralig'idagi butun son bo'lishi kerak, keldi: ${feePercent}`);
  }
  const platformFee = Math.floor((offeredAmount * feePercent) / 100);
  return {
    offeredAmount,
    platformFee,
    workerAmount: offeredAmount - platformFee,
    totalAmount: offeredAmount,
    feePercent,
  };
}

/** 50000 -> "50 000" */
export function formatAmount(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(amount));
  return sign + abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** 50000 -> "50 000 UZS" */
export function formatUZS(amount: number): string {
  return `${formatAmount(amount)} UZS`;
}

/** Reyting integer sifatida 0..500 saqlanadi (4.87 -> 487). */
export const RATING_SCALE = 100;

export function ratingToInt(rating: number): number {
  return Math.round(rating * RATING_SCALE);
}

export function formatRating(ratingInt: number): string {
  if (ratingInt <= 0) return '—';
  return (ratingInt / RATING_SCALE).toFixed(1);
}

/**
 * Yangi o'rtacha reytingni integer arifmetikada hisoblaydi.
 * Qaytadi: yangi ratingInt (0..500).
 */
export function recalcRating(currentRatingInt: number, currentCount: number, newStars: number): number {
  if (!Number.isInteger(newStars) || newStars < 1 || newStars > 5) {
    throw new Error(`Reyting 1..5 bo'lishi kerak, keldi: ${newStars}`);
  }
  const totalScaled = currentRatingInt * currentCount + newStars * RATING_SCALE;
  const nextCount = currentCount + 1;
  return Math.round(totalScaled / nextCount);
}

/** Muvaffaqiyat foizi: 0..100 integer */
export function successRate(completed: number, cancelled: number): number {
  const total = completed + cancelled;
  if (total === 0) return 100;
  return Math.round((completed * 100) / total);
}

/**
 * Ishonchlilik ballari (0..100). Ko'p cancellation qilgan foydalanuvchi pastga tushadi.
 */
export function reliabilityScore(completed: number, cancelled: number, ratingInt: number): number {
  const sr = successRate(completed, cancelled);
  const ratingPart = ratingInt > 0 ? Math.round((ratingInt / (5 * RATING_SCALE)) * 100) : 60;
  const volumeBonus = Math.min(10, completed);
  return Math.max(0, Math.min(100, Math.round(sr * 0.5 + ratingPart * 0.4 + volumeBonus)));
}
