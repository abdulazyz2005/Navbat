import crypto from 'node:crypto';
import { AppError, formatUZS, type PaymentIntentDTO } from '@navbat/shared';
import type { PaymentIntent } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { creditAvailable } from './ledger.js';
import { notify } from './notifications.js';
import { getPlatformCard, maskCard } from './settings.js';

/**
 * KARTA-KARTA TO'LOV (yarim avtomatik escrow)
 * ------------------------------------------------------------------
 * 1. Foydalanuvchi to'lov so'raydi  → tizim AYNAN bitta unikal summa beradi
 *    (masalan 50 000 → 50 037). Shu summa to'lovni identifikatsiya qiladi.
 * 2. Foydalanuvchi platforma kartasiga o'sha summani o'tkazadi va chek yuklaydi.
 * 3. Admin chekni ko'rib tasdiqlaydi → summa balansga tushadi.
 *    Agar to'lov buyurtma uchun bo'lsa, buyurtma avtomatik e'lon qilinadi.
 *
 * Nima uchun unikal summa: karta-karta o'tkazmada izoh maydoni yo'q, shuning uchun
 * "kim to'ladi" ni faqat summa orqali aniq ajratish mumkin. Bir vaqtning o'zida
 * ikkita faol to'lov bir xil summaga ega bo'lolmaydi (DBda partial unique index).
 */

/** To'lov so'rovi shuncha vaqt amal qiladi */
export const INTENT_TTL_MIN = 60;

/** Unikal qo'shimcha 1..999 so'm — foydalanuvchi uchun sezilarsiz, tizim uchun ajratuvchi */
const SUFFIX_MAX = 999;
const SUFFIX_ATTEMPTS = 40;

/** Chek rasmi uchun chegara (bazani shishirib yubormaslik uchun) */
export const MAX_RECEIPT_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function mapIntent(intent: PaymentIntent): PaymentIntentDTO {
  return {
    id: intent.id,
    amount: intent.amount,
    expectedAmount: intent.expectedAmount,
    status: intent.status,
    cardNumber: intent.cardNumber,
    cardHolder: intent.cardHolder,
    orderId: intent.orderId,
    hasReceipt: Boolean(intent.receiptFileId || intent.receiptData),
    rejectReason: intent.rejectReason,
    expiresAt: intent.expiresAt.toISOString(),
    createdAt: intent.createdAt.toISOString(),
  };
}

/** Muddati o'tgan so'rovlarni yopadi (har so'rovda arzon tozalash) */
export async function expireStaleIntents(): Promise<number> {
  const result = await prisma.paymentIntent.updateMany({
    where: { status: 'AWAITING_TRANSFER', expiresAt: { lt: new Date() } },
    data: { status: 'EXPIRED' },
  });
  return result.count;
}

/** Foydalanuvchining hozirgi tugallanmagan to'lov so'rovi */
export async function activeIntentOf(userId: string): Promise<PaymentIntent | null> {
  await expireStaleIntents();
  return prisma.paymentIntent.findFirst({
    where: { userId, status: { in: ['AWAITING_TRANSFER', 'PENDING_REVIEW'] } },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Yangi to'lov so'rovi. Bir foydalanuvchida bir vaqtda bitta faol so'rov bo'ladi —
 * aks holda qaysi pul qaysi so'rovga tegishli ekani chalkashadi.
 */
export async function createIntent(params: {
  userId: string;
  amount: number;
  orderId?: string | null;
}): Promise<PaymentIntent> {
  const { userId, amount, orderId = null } = params;
  if (!Number.isInteger(amount) || amount <= 0) throw new AppError('INVALID_AMOUNT', 400);

  const existing = await activeIntentOf(userId);
  if (existing) {
    // Aynan shu buyurtma uchun so'rov allaqachon bor — o'shani qaytaramiz
    if (existing.orderId === orderId && existing.amount === amount) return existing;
    throw new AppError('ACTIVE_INTENT_EXISTS', 409, { intentId: existing.id });
  }

  const card = await getPlatformCard();
  if (!card) throw new AppError('PAYMENT_CARD_NOT_SET', 503);

  const expiresAt = new Date(Date.now() + INTENT_TTL_MIN * 60 * 1000);

  // Bo'sh unikal summa qidiramiz. Partial unique index poyga holatidan himoya qiladi,
  // shuning uchun konflikt bo'lsa keyingi variantga o'tamiz.
  for (let attempt = 0; attempt < SUFFIX_ATTEMPTS; attempt += 1) {
    const suffix = 1 + crypto.randomInt(SUFFIX_MAX);
    try {
      return await prisma.paymentIntent.create({
        data: {
          userId,
          orderId,
          amount,
          expectedAmount: amount + suffix,
          cardNumber: card.cardNumber,
          cardHolder: card.cardHolder,
          expiresAt,
        },
      });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'P2002') continue; // shu summa band — boshqasini sinaymiz
      throw error;
    }
  }
  throw new AppError('INVALID_AMOUNT', 503, { reason: 'NO_FREE_AMOUNT' });
}

export async function getIntentOrThrow(id: string): Promise<PaymentIntent> {
  const intent = await prisma.paymentIntent.findUnique({ where: { id } });
  if (!intent) throw new AppError('INTENT_NOT_FOUND', 404);
  return intent;
}

/** Chek biriktirish: Mini App'dan rasm yoki Telegram file_id */
export async function attachReceipt(params: {
  intentId: string;
  userId: string;
  fileId?: string;
  data?: Uint8Array<ArrayBuffer>;
  mime?: string;
}): Promise<PaymentIntent> {
  const intent = await getIntentOrThrow(params.intentId);
  if (intent.userId !== params.userId) throw new AppError('FORBIDDEN', 403);
  if (intent.status === 'PENDING_REVIEW') return intent; // qayta yuborish — zararsiz
  if (intent.status !== 'AWAITING_TRANSFER') throw new AppError('INTENT_ALREADY_REVIEWED', 409);
  if (intent.expiresAt < new Date()) {
    await prisma.paymentIntent.update({ where: { id: intent.id }, data: { status: 'EXPIRED' } });
    throw new AppError('INTENT_EXPIRED', 409);
  }
  if (!params.fileId && !params.data) throw new AppError('RECEIPT_REQUIRED', 400);
  if (params.data) {
    if (params.data.byteLength > MAX_RECEIPT_BYTES) throw new AppError('RECEIPT_TOO_LARGE', 413);
    if (!params.mime || !ALLOWED_MIME.has(params.mime)) {
      throw new AppError('INVALID_RECEIPT_FORMAT', 400);
    }
  }

  return prisma.paymentIntent.update({
    where: { id: intent.id },
    data: {
      status: 'PENDING_REVIEW',
      receiptFileId: params.fileId ?? intent.receiptFileId,
      ...(params.data ? { receiptData: params.data } : {}),
      receiptMime: params.mime ?? intent.receiptMime,
      receiptAt: new Date(),
    },
  });
}

export interface ConfirmResult {
  intent: PaymentIntent;
  credited: number;
  publishedOrderId: string | null;
}

/**
 * Admin tasdig'i: pul balansga tushadi.
 * Buyurtma uchun bo'lsa — buyurtma darhol e'lon qilinadi.
 *
 * Bir necha marta bosilsa ham pul IKKI MARTA qo'shilmaydi:
 * status faqat PENDING_REVIEW/AWAITING_TRANSFER dan CONFIRMED ga o'tadi (atomar updateMany).
 */
export async function confirmIntent(
  intentId: string,
  adminId: string,
): Promise<ConfirmResult> {
  const intent = await getIntentOrThrow(intentId);
  if (intent.status === 'CONFIRMED') throw new AppError('INTENT_ALREADY_REVIEWED', 409);
  if (intent.status === 'REJECTED') throw new AppError('INTENT_ALREADY_REVIEWED', 409);

  const credited = intent.expectedAmount;

  await prisma.$transaction(async (tx) => {
    // Atomar: faqat hali tasdiqlanmagan bo'lsa o'tadi (ikki marta bosishdan himoya)
    const locked = await tx.paymentIntent.updateMany({
      where: { id: intent.id, status: { in: ['AWAITING_TRANSFER', 'PENDING_REVIEW', 'EXPIRED'] } },
      data: { status: 'CONFIRMED', reviewedById: adminId, reviewedAt: new Date(), rejectReason: null },
    });
    if (locked.count === 0) throw new AppError('INTENT_ALREADY_REVIEWED', 409);

    await creditAvailable({
      tx,
      userId: intent.userId,
      type: 'TOP_UP',
      amount: credited,
      orderId: intent.orderId ?? undefined,
      note: `Karta orqali to‘lov tasdiqlandi (${maskCard(intent.cardNumber)})`,
    });
  });

  await notify({
    userId: intent.userId,
    type: 'WITHDRAWAL_UPDATE',
    title: 'To‘lov tasdiqlandi',
    body: `${formatUZS(credited)} balansingizga qo‘shildi.`,
    deepLink: intent.orderId ? `/orders/${intent.orderId}` : '/balance',
  });

  return { intent: await getIntentOrThrow(intent.id), credited, publishedOrderId: null };
}

export async function rejectIntent(
  intentId: string,
  adminId: string,
  reason: string,
): Promise<PaymentIntent> {
  const intent = await getIntentOrThrow(intentId);
  if (intent.status === 'CONFIRMED') throw new AppError('INTENT_ALREADY_REVIEWED', 409);

  const result = await prisma.paymentIntent.updateMany({
    where: { id: intent.id, status: { not: 'CONFIRMED' } },
    data: {
      status: 'REJECTED',
      reviewedById: adminId,
      reviewedAt: new Date(),
      rejectReason: reason.slice(0, 300),
    },
  });
  if (result.count === 0) throw new AppError('INTENT_ALREADY_REVIEWED', 409);

  await notify({
    userId: intent.userId,
    type: 'WITHDRAWAL_UPDATE',
    title: 'To‘lov tasdiqlanmadi',
    body: reason.slice(0, 300),
    deepLink: intent.orderId ? `/orders/${intent.orderId}` : '/balance',
  });

  return getIntentOrThrow(intent.id);
}
