import { Router } from 'express';
import { z } from 'zod';
import { AppError, type BalanceDTO } from '@navbat/shared';
import { env } from '../env.js';
import { prisma } from '../lib/prisma.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/rate-limit.js';
import { mapTransaction, mapWithdrawal } from '../lib/dto.js';
import { notifyAdminsAboutWithdrawal } from '../services/admin-bot.js';
import { creditAvailable } from '../services/ledger.js';
import { notify } from '../services/notifications.js';

export const balanceRouter = Router();
export const withdrawalsRouter = Router();

balanceRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const me = currentUser(req);
    const profile = await prisma.profile.findUnique({ where: { userId: me.id } });
    if (!profile) throw new AppError('NOT_FOUND', 404);
    const dto: BalanceDTO = {
      availableBalance: profile.availableBalance,
      pendingBalance: profile.pendingBalance,
      totalEarned: profile.totalEarned,
      totalSpent: profile.totalSpent,
    };
    res.json(dto);
  } catch (error) {
    next(error);
  }
});

balanceRouter.get('/transactions', requireAuth, async (req, res, next) => {
  try {
    const me = currentUser(req);
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10));
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit ?? '30'), 10)));

    const [rows, total] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId: me.id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.transaction.count({ where: { userId: me.id } }),
    ]);

    res.json({
      items: rows.map(mapTransaction),
      page,
      limit,
      total,
      hasMore: page * limit < total,
    });
  } catch (error) {
    next(error);
  }
});

/* ------------------------------------------------------------ withdrawals */

const withdrawalSchema = z.object({
  amount: z.number().int().positive(),
  method: z.enum(['CARD', 'CLICK', 'PAYME', 'CASH']),
  account: z.string().min(4).max(60),
});

withdrawalsRouter.post('/', requireAuth, writeLimiter, async (req, res, next) => {
  try {
    const me = currentUser(req);
    const input = withdrawalSchema.parse(req.body);
    if (input.amount < env.MIN_WITHDRAWAL_AMOUNT) {
      throw new AppError('WITHDRAWAL_TOO_SMALL', 400, { min: env.MIN_WITHDRAWAL_AMOUNT });
    }

    const withdrawal = await prisma.$transaction(async (tx) => {
      const profile = await tx.profile.findUnique({ where: { userId: me.id } });
      if (!profile) throw new AppError('NOT_FOUND', 404);
      if (profile.availableBalance < input.amount) throw new AppError('INSUFFICIENT_BALANCE', 400);

      // Summa darhol bloklanadi
      await creditAvailable({
        tx,
        userId: me.id,
        type: 'WITHDRAWAL',
        amount: -input.amount,
        note: `Pul yechish (${input.method})`,
      });

      return tx.withdrawal.create({
        data: {
          workerId: me.id,
          amount: input.amount,
          method: input.method,
          account: input.account,
          status: 'PENDING',
        },
      });
    });

    // Adminlarga: yangi payout so'rovi (karta va summa bilan)
    void notifyAdminsAboutWithdrawal(withdrawal.id);

    res.status(201).json(mapWithdrawal(withdrawal));
  } catch (error) {
    next(error);
  }
});

withdrawalsRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const me = currentUser(req);
    const rows = await prisma.withdrawal.findMany({
      where: { workerId: me.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ items: rows.map(mapWithdrawal) });
  } catch (error) {
    next(error);
  }
});

/** Foydalanuvchi hali ko'rib chiqilmagan so'rovni bekor qilishi mumkin */
withdrawalsRouter.post('/:id/cancel', requireAuth, async (req, res, next) => {
  try {
    const me = currentUser(req);
    const row = await prisma.withdrawal.findUnique({ where: { id: req.params.id } });
    if (!row) throw new AppError('WITHDRAWAL_NOT_FOUND', 404);
    if (row.workerId !== me.id) throw new AppError('FORBIDDEN', 403);
    if (row.status !== 'PENDING') throw new AppError('FORBIDDEN', 409);

    await prisma.$transaction(async (tx) => {
      await tx.withdrawal.update({
        where: { id: row.id },
        data: { status: 'REJECTED', note: 'Foydalanuvchi bekor qildi' },
      });
      await creditAvailable({
        tx,
        userId: me.id,
        type: 'REFUND',
        amount: row.amount,
        note: 'Pul yechish bekor qilindi',
      });
    });

    await notify({
      userId: me.id,
      type: 'WITHDRAWAL_UPDATE',
      title: 'Pul yechish bekor qilindi',
      body: 'Summa balansingizga qaytarildi.',
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
