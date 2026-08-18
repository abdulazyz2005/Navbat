import type { TransactionType } from '@navbat/shared';
import { AppError } from '@navbat/shared';
import type { Tx } from '../lib/prisma.js';

/**
 * Balans va tranzaksiyalar — barcha o'zgarishlar SHU YERDAN o'tadi.
 * Har bir balans o'zgarishi transaction yozuvi bilan hujjatlashtiriladi.
 * Hamma summa integer UZS.
 */

interface LedgerEntry {
  tx: Tx;
  userId: string;
  type: TransactionType;
  /** musbat = balansga qo'shiladi, manfiy = yechiladi */
  amount: number;
  orderId?: string;
  note?: string;
}

export async function creditAvailable(entry: LedgerEntry): Promise<number> {
  const { tx, userId, amount } = entry;
  if (!Number.isInteger(amount)) throw new AppError('INVALID_AMOUNT', 400);

  const profile = await tx.profile.findUnique({ where: { userId } });
  if (!profile) throw new AppError('NOT_FOUND', 404);

  const next = profile.availableBalance + amount;
  if (next < 0) throw new AppError('INSUFFICIENT_BALANCE', 400);

  await tx.profile.update({
    where: { userId },
    data: { availableBalance: next },
  });

  await tx.transaction.create({
    data: {
      userId,
      orderId: entry.orderId ?? null,
      type: entry.type,
      amount,
      balanceAfter: next,
      note: entry.note ?? null,
    },
  });

  return next;
}

/** Escrowga tushgan pul — navbatchining "pending" balansi */
export async function movePending(
  tx: Tx,
  userId: string,
  amount: number,
): Promise<void> {
  const profile = await tx.profile.findUnique({ where: { userId } });
  if (!profile) throw new AppError('NOT_FOUND', 404);
  const next = profile.pendingBalance + amount;
  if (next < 0) throw new AppError('INSUFFICIENT_BALANCE', 400);
  await tx.profile.update({ where: { userId }, data: { pendingBalance: next } });
}

/** Faqat statistika: umumiy sarflangan / topilgan */
export async function addTotals(
  tx: Tx,
  userId: string,
  data: { spent?: number; earned?: number },
): Promise<void> {
  await tx.profile.update({
    where: { userId },
    data: {
      ...(data.spent ? { totalSpent: { increment: data.spent } } : {}),
      ...(data.earned ? { totalEarned: { increment: data.earned } } : {}),
    },
  });
}
