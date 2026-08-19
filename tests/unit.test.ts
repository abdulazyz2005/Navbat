import { describe, expect, it } from 'vitest';
import {
  calculatePrice,
  canTransitionOrder,
  canTransitionPayment,
  computeMatch,
  distanceKm,
  formatUZS,
  overlapMinutes,
  ratingToInt,
  recalcRating,
  reliabilityScore,
  successRate,
  toMinutes,
} from '@navbat/shared';

/* ------------------------------------------------------------ komissiya */

describe('komissiya hisobi', () => {
  it('50 000 -> buyurtmachi 50 000 to‘laydi, navbatchi 45 000 oladi', () => {
    const price = calculatePrice(50000, 10);
    expect(price.offeredAmount).toBe(50000);
    expect(price.platformFee).toBe(5000);
    expect(price.workerAmount).toBe(45000);
    expect(price.totalAmount).toBe(50000);
  });

  it('buyurtmachi doim e’londagi summani to‘laydi (ustiga qo‘shilmaydi)', () => {
    for (const amount of [10000, 33333, 47777, 999999]) {
      expect(calculatePrice(amount, 10).totalAmount).toBe(amount);
    }
  });

  it('komissiya + navbatchi ulushi = to‘langan summa (bir tiyin ham yo‘qolmaydi)', () => {
    for (const amount of [10000, 33333, 47777, 999999]) {
      const price = calculatePrice(amount, 10);
      expect(price.platformFee + price.workerAmount).toBe(price.totalAmount);
    }
  });

  it('natija har doim butun son (floating point yo‘q)', () => {
    const price = calculatePrice(33333, 10);
    expect(Number.isInteger(price.platformFee)).toBe(true);
    expect(Number.isInteger(price.workerAmount)).toBe(true);
    expect(Number.isInteger(price.totalAmount)).toBe(true);
    expect(price.platformFee).toBe(3333); // pastga yaxlitlanadi
    expect(price.workerAmount).toBe(30000);
    expect(price.totalAmount).toBe(33333);
  });

  it('komissiya foizi konfiguratsiya orqali o‘zgaradi', () => {
    expect(calculatePrice(50000, 0).totalAmount).toBe(50000);
    expect(calculatePrice(50000, 20).platformFee).toBe(10000);
  });

  it('noto‘g‘ri kiritmalarni rad etadi', () => {
    expect(() => calculatePrice(0)).toThrow();
    expect(() => calculatePrice(-100)).toThrow();
    expect(() => calculatePrice(1000.5)).toThrow();
    expect(() => calculatePrice(50000, 150)).toThrow();
  });

  it('summani o‘qiladigan formatga keltiradi', () => {
    expect(formatUZS(50000)).toBe('50 000 UZS');
    expect(formatUZS(1280000)).toBe('1 280 000 UZS');
    expect(formatUZS(0)).toBe('0 UZS');
  });
});

/* --------------------------------------------------------------- reyting */

describe('reyting', () => {
  it('integer shkalada saqlanadi (4.9 -> 490)', () => {
    expect(ratingToInt(4.9)).toBe(490);
  });

  it('o‘rtacha reytingni to‘g‘ri qayta hisoblaydi', () => {
    // 2 ta 5 yulduz + 1 ta 2 yulduz = 4.0
    let rating = 0;
    let count = 0;
    for (const stars of [5, 5, 2]) {
      rating = recalcRating(rating, count, stars);
      count += 1;
    }
    expect(rating).toBe(400);
  });

  it('diapazondan tashqari bahoni rad etadi', () => {
    expect(() => recalcRating(400, 3, 0)).toThrow();
    expect(() => recalcRating(400, 3, 6)).toThrow();
  });

  it('muvaffaqiyat foizi', () => {
    expect(successRate(47, 1)).toBe(98);
    expect(successRate(0, 0)).toBe(100);
    expect(successRate(0, 5)).toBe(0);
  });

  it('ishonchlilik ballari cancellation bilan pasayadi', () => {
    const good = reliabilityScore(47, 1, 490);
    const bad = reliabilityScore(10, 15, 490);
    expect(good).toBeGreaterThan(bad);
    expect(good).toBeLessThanOrEqual(100);
    expect(bad).toBeGreaterThanOrEqual(0);
  });
});

/* -------------------------------------------------------------- matching */

describe('matching engine', () => {
  const order = {
    date: '2026-08-20',
    startTime: '14:30',
    endTime: '16:00',
    latitude: 41.2756,
    longitude: 69.2034,
    offeredAmount: 50000,
  };
  const availability = {
    date: '2026-08-20',
    startTime: '13:30',
    endTime: '17:00',
    latitude: 41.2856,
    longitude: 69.2134,
    radiusKm: 5,
    minimumAmount: 30000,
  };
  const worker = { ratingInt: 490, completedOrders: 47 };

  it('vaqt konvertatsiyasi', () => {
    expect(toMinutes('14:30')).toBe(870);
    expect(toMinutes('00:00')).toBe(0);
    expect(() => toMinutes('25:00')).toThrow();
    expect(() => toMinutes('abc')).toThrow();
  });

  it('vaqt kesishuvi', () => {
    expect(overlapMinutes('14:30', '16:00', '13:30', '17:00')).toBe(90);
    expect(overlapMinutes('14:30', '16:00', '16:00', '18:00')).toBe(0);
    expect(overlapMinutes('14:30', '16:00', '15:00', '15:30')).toBe(30);
  });

  it('masofa haqiqiy koordinatalarda to‘g‘ri', () => {
    const d = distanceKm(41.2756, 69.2034, 41.2856, 69.2134);
    expect(d).toBeGreaterThan(1);
    expect(d).toBeLessThan(2);
    expect(distanceKm(41.2756, 69.2034, 41.2756, 69.2034)).toBe(0);
  });

  it('demo ssenariy: yuqori moslik ballari (>=90)', () => {
    const match = computeMatch(order, availability, worker);
    expect(match.eligible).toBe(true);
    expect(match.score).toBeGreaterThanOrEqual(90);
    expect(match.timeOverlapMinutes).toBe(90);
    expect(match.withinRadius).toBe(true);
  });

  it('boshqa sanadagi bo‘sh vaqt mos kelmaydi', () => {
    const match = computeMatch(order, { ...availability, date: '2026-08-21' }, worker);
    expect(match.eligible).toBe(false);
    expect(match.timeOverlapMinutes).toBe(0);
  });

  it('radiusdan tashqarida bo‘lsa mos kelmaydi', () => {
    const match = computeMatch(order, { ...availability, radiusKm: 1 }, worker);
    expect(match.eligible).toBe(false);
    expect(match.withinRadius).toBe(false);
  });

  it('minimal to‘lovdan past bo‘lsa mos kelmaydi', () => {
    const match = computeMatch(order, { ...availability, minimumAmount: 60000 }, worker);
    expect(match.eligible).toBe(false);
    expect(match.meetsMinimum).toBe(false);
  });

  it('vaqt kesishmasa mos kelmaydi', () => {
    const match = computeMatch(
      order,
      { ...availability, startTime: '08:00', endTime: '10:00' },
      worker,
    );
    expect(match.eligible).toBe(false);
  });

  it('yaqinroq navbatchi yuqoriroq ball oladi', () => {
    const near = computeMatch(order, { ...availability, latitude: 41.2760, longitude: 69.2040 }, worker);
    const far = computeMatch(order, { ...availability, latitude: 41.3100, longitude: 69.2400 }, worker);
    expect(near.score).toBeGreaterThan(far.score);
  });

  it('ball har doim 0..100 oralig‘ida integer', () => {
    const match = computeMatch(order, availability, worker);
    expect(Number.isInteger(match.score)).toBe(true);
    expect(match.score).toBeGreaterThanOrEqual(0);
    expect(match.score).toBeLessThanOrEqual(100);
  });
});

/* --------------------------------------------------------- state machine */

describe('order state machine', () => {
  it('to‘g‘ri hayot sikli', () => {
    expect(canTransitionOrder('DRAFT', 'PUBLISHED')).toBe(true);
    expect(canTransitionOrder('PUBLISHED', 'MATCHED')).toBe(true);
    expect(canTransitionOrder('MATCHED', 'IN_PROGRESS')).toBe(true);
    expect(canTransitionOrder('IN_PROGRESS', 'COMPLETION_PENDING')).toBe(true);
    expect(canTransitionOrder('COMPLETION_PENDING', 'COMPLETED')).toBe(true);
  });

  it('bosqichlarni sakrab o‘tishga ruxsat bermaydi', () => {
    expect(canTransitionOrder('DRAFT', 'MATCHED')).toBe(false);
    expect(canTransitionOrder('PUBLISHED', 'IN_PROGRESS')).toBe(false);
    expect(canTransitionOrder('PUBLISHED', 'COMPLETED')).toBe(false);
    expect(canTransitionOrder('MATCHED', 'COMPLETED')).toBe(false);
  });

  it('yakuniy holatlardan chiqib bo‘lmaydi', () => {
    expect(canTransitionOrder('COMPLETED', 'PUBLISHED')).toBe(false);
    expect(canTransitionOrder('COMPLETED', 'IN_PROGRESS')).toBe(false);
    expect(canTransitionOrder('REFUNDED', 'COMPLETED')).toBe(false);
  });

  it('navbatchi voz kechganda PUBLISHEDga qaytadi', () => {
    expect(canTransitionOrder('MATCHED', 'PUBLISHED')).toBe(true);
  });

  it('nizo yo‘llari', () => {
    expect(canTransitionOrder('IN_PROGRESS', 'DISPUTED')).toBe(true);
    expect(canTransitionOrder('COMPLETION_PENDING', 'DISPUTED')).toBe(true);
    expect(canTransitionOrder('DISPUTED', 'COMPLETED')).toBe(true);
    expect(canTransitionOrder('DISPUTED', 'REFUNDED')).toBe(true);
  });
});

describe('payment state machine', () => {
  it('PENDING -> PAID -> HELD -> RELEASED', () => {
    expect(canTransitionPayment('PENDING', 'PAID')).toBe(true);
    expect(canTransitionPayment('PAID', 'HELD')).toBe(true);
    expect(canTransitionPayment('HELD', 'RELEASED')).toBe(true);
  });

  it('HELD holatidan qaytarish mumkin', () => {
    expect(canTransitionPayment('HELD', 'REFUNDED')).toBe(true);
  });

  it('chiqarilgan to‘lovni qaytarib bo‘lmaydi', () => {
    expect(canTransitionPayment('RELEASED', 'REFUNDED')).toBe(false);
    expect(canTransitionPayment('RELEASED', 'HELD')).toBe(false);
    expect(canTransitionPayment('PENDING', 'RELEASED')).toBe(false);
  });
});
