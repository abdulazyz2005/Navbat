/**
 * Matching engine — deterministik, ML yo'q.
 *
 * match_score =
 *     time_match     * 35
 *   + location_match * 30
 *   + distance_score * 20
 *   + rating_score   * 10
 *   + price_score    * 5
 *
 * Har bir komponent 0..1 oralig'ida. Natija 0..100 integer.
 */

export interface MatchOrderInput {
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  latitude: number;
  longitude: number;
  offeredAmount: number;
}

export interface MatchAvailabilityInput {
  date: string;
  startTime: string;
  endTime: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
  minimumAmount: number;
}

export interface MatchWorkerInput {
  ratingInt: number; // 0..500
  completedOrders: number;
}

export interface MatchResult {
  score: number; // 0..100
  distanceKm: number;
  timeOverlapMinutes: number;
  withinRadius: boolean;
  meetsMinimum: boolean;
  eligible: boolean;
}

const EARTH_RADIUS_KM = 6371;

export function toMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) throw new Error(`Vaqt formati noto'g'ri: "${hhmm}" (HH:mm kutilgan)`);
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) throw new Error(`Vaqt qiymati noto'g'ri: "${hhmm}"`);
  return hours * 60 + minutes;
}

export function minutesToHHmm(total: number): string {
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Haversine — km */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Ikki vaqt oralig'ining kesishuvi (daqiqa) */
export function overlapMinutes(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): number {
  const s = Math.max(toMinutes(aStart), toMinutes(bStart));
  const e = Math.min(toMinutes(aEnd), toMinutes(bEnd));
  return Math.max(0, e - s);
}

export function computeMatch(
  order: MatchOrderInput,
  availability: MatchAvailabilityInput,
  worker: MatchWorkerInput,
): MatchResult {
  const sameDate = order.date === availability.date;
  const orderDuration = Math.max(1, toMinutes(order.endTime) - toMinutes(order.startTime));
  const overlap = sameDate
    ? overlapMinutes(order.startTime, order.endTime, availability.startTime, availability.endTime)
    : 0;

  // 1. Vaqt mosligi — buyurtma oralig'ining qancha qismini navbatchi qoplaydi
  const timeMatch = Math.min(1, overlap / orderDuration);

  const dist = distanceKm(
    order.latitude,
    order.longitude,
    availability.latitude,
    availability.longitude,
  );

  // 2. Hudud mosligi — radius ichidami
  const withinRadius = dist <= availability.radiusKm;
  const locationMatch = withinRadius ? 1 : 0;

  // 3. Masofa balli — radius ichida qanchalik yaqin
  const distanceScore = withinRadius
    ? Math.max(0, 1 - dist / Math.max(0.1, availability.radiusKm))
    : 0;

  // 4. Reyting balli — reytingsiz yangi navbatchi 0.6 dan boshlaydi
  const ratingScore =
    worker.ratingInt > 0 ? Math.min(1, worker.ratingInt / 500) : 0.6;

  // 5. Narx balli — minimal to'lovdan qanchalik yuqori
  const meetsMinimum = order.offeredAmount >= availability.minimumAmount;
  const priceScore = !meetsMinimum
    ? 0
    : availability.minimumAmount <= 0
      ? 1
      : Math.min(1, order.offeredAmount / (availability.minimumAmount * 2));

  const raw =
    timeMatch * 35 + locationMatch * 30 + distanceScore * 20 + ratingScore * 10 + priceScore * 5;

  const eligible = sameDate && overlap > 0 && withinRadius && meetsMinimum;

  return {
    score: Math.max(0, Math.min(100, Math.round(raw))),
    distanceKm: Math.round(dist * 10) / 10,
    timeOverlapMinutes: overlap,
    withinRadius,
    meetsMinimum,
    eligible,
  };
}
