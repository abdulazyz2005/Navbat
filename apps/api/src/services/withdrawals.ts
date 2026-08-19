import { AppError, formatUZS } from '@navbat/shared';
import type { Withdrawal, WithdrawalStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { creditAvailable } from './ledger.js';
import { notify } from './notifications.js';

/**
 * PUL CHIQARISH (payout).
 *
 * Summa so'rov yuborilganda darhol balansdan bloklanadi, shuning uchun
 * bu yerda faqat holat o'zgaradi:
 *   COMPLETED — pul kartaga o'tkazildi (admin qo'lda o'tkazadi)
 *   REJECTED  — bloklangan summa balansga qaytariladi
 *
 * Ikki marta bosilsa ham pul ikki marta qaytmaydi: holat atomar o'zgaradi.
 */
export async function decideWithdrawal(
  withdrawalId: string,
  decision: WithdrawalStatus,
  note?: string,
): Promise<Withdrawal> {
  const row = await prisma.withdrawal.findUnique({ where: { id: withdrawalId } });
  if (!row) throw new AppError('WITHDRAWAL_NOT_FOUND', 404);
  if (row.status === 'COMPLETED' || row.status === 'REJECTED') {
    throw new AppError('FORBIDDEN', 409);
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.withdrawal.updateMany({
      where: { id: row.id, status: { in: ['PENDING', 'PROCESSING'] } },
      data: { status: decision, note: note ?? null },
    });
    if (updated.count === 0) throw new AppError('FORBIDDEN', 409);

    if (decision === 'REJECTED') {
      // Bloklangan summa qaytariladi
      await creditAvailable({
        tx,
        userId: row.workerId,
        type: 'REFUND',
        amount: row.amount,
        note: note ?? 'Pul yechish rad etildi',
      });
    }
  });

  await notify({
    userId: row.workerId,
    type: 'WITHDRAWAL_UPDATE',
    title: 'Pul yechish holati yangilandi',
    body:
      decision === 'COMPLETED'
        ? `${formatUZS(row.amount)} kartangizga o‘tkazildi.`
        : decision === 'REJECTED'
          ? `Rad etildi. ${note ?? ''}`.trim()
          : 'So‘rovingiz ko‘rib chiqilmoqda.',
    deepLink: '/balance',
  });

  return (await prisma.withdrawal.findUnique({ where: { id: row.id } })) as Withdrawal;
}
