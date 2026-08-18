import { Router } from 'express';
import { z } from 'zod';
import { AppError, successRate, type AdminStats } from '@navbat/shared';
import { prisma } from '../lib/prisma.js';
import { currentUser, requireAdmin, requireAuth } from '../middleware/auth.js';
import {
  mapDispute,
  mapOrder,
  mapWithdrawal,
  orderInclude,
  type OrderWithRelations,
  type UserWithProfile,
} from '../lib/dto.js';
import { resolveDispute } from '../services/disputes.js';
import { creditAvailable } from '../services/ledger.js';
import { notify } from '../services/notifications.js';
import { expireStaleOrders } from '../services/orders.js';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

/* ------------------------------------------------------------- analytics */

adminRouter.get('/stats', async (_req, res, next) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(startOfDay.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(startOfDay.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      activeUsers,
      ordersToday,
      ordersThisWeek,
      completedOrders,
      cancelledOrders,
      totalOrders,
      releasedAgg,
      heldAgg,
      pendingAgg,
      refundedAgg,
      openDisputes,
      pendingWithdrawals,
      ratingAgg,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { updatedAt: { gte: monthAgo } } }),
      prisma.order.count({ where: { createdAt: { gte: startOfDay } } }),
      prisma.order.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.order.count({ where: { status: 'COMPLETED' } }),
      prisma.order.count({ where: { status: { in: ['CANCELLED', 'REFUNDED', 'EXPIRED'] } } }),
      prisma.order.count(),
      prisma.payment.aggregate({
        where: { status: 'RELEASED' },
        _sum: { grossAmount: true, platformFee: true },
        _count: true,
      }),
      prisma.payment.aggregate({ where: { status: 'HELD' }, _sum: { grossAmount: true } }),
      prisma.payment.aggregate({ where: { status: 'PENDING' }, _sum: { grossAmount: true } }),
      prisma.payment.aggregate({ where: { status: 'REFUNDED' }, _sum: { grossAmount: true } }),
      prisma.dispute.count({ where: { status: { in: ['OPEN', 'UNDER_REVIEW'] } } }),
      prisma.withdrawal.count({ where: { status: { in: ['PENDING', 'PROCESSING'] } } }),
      prisma.profile.aggregate({ where: { ratingCount: { gt: 0 } }, _avg: { rating: true } }),
    ]);

    const finished = await prisma.assignment.findMany({
      where: { status: 'COMPLETED', startedAt: { not: null }, completedAt: { not: null } },
      select: { startedAt: true, completedAt: true },
      take: 500,
    });
    const avgCompletionMinutes = finished.length
      ? Math.round(
          finished.reduce(
            (sum, a) => sum + (a.completedAt!.getTime() - a.startedAt!.getTime()) / 60000,
            0,
          ) / finished.length,
        )
      : 0;

    const gmv = releasedAgg._sum.grossAmount ?? 0;
    const stats: AdminStats = {
      totalUsers,
      activeUsers,
      ordersToday,
      ordersThisWeek,
      completedOrders,
      cancelledOrders,
      cancellationRate: totalOrders ? Math.round((cancelledOrders * 100) / totalOrders) : 0,
      averageOrderValue: releasedAgg._count ? Math.round(gmv / releasedAgg._count) : 0,
      gmv,
      platformRevenue: releasedAgg._sum.platformFee ?? 0,
      pendingPayments: pendingAgg._sum.grossAmount ?? 0,
      heldPayments: heldAgg._sum.grossAmount ?? 0,
      refundedPayments: refundedAgg._sum.grossAmount ?? 0,
      averageCompletionMinutes: avgCompletionMinutes,
      averageWorkerRating: Math.round(ratingAgg._avg.rating ?? 0),
      openDisputes,
      pendingWithdrawals,
    };
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

/* ----------------------------------------------------------------- users */

adminRouter.get('/users', async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim();
    const users = await prisma.user.findMany({
      where: q
        ? {
            OR: [
              { firstName: { contains: q, mode: 'insensitive' } },
              { username: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {},
      include: { profile: true, _count: { select: { orders: true, assignments: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    res.json({
      items: users.map((u) => ({
        id: u.id,
        telegramId: u.telegramId.toString(),
        firstName: u.firstName,
        lastName: u.lastName,
        username: u.username,
        photoUrl: u.photoUrl,
        isAdmin: u.isAdmin,
        isBanned: u.isBanned,
        createdAt: u.createdAt.toISOString(),
        roleMode: u.profile?.roleMode ?? 'BUYER',
        rating: u.profile?.rating ?? 0,
        completedOrders: u.profile?.completedOrders ?? 0,
        cancelledOrders: u.profile?.cancelledOrders ?? 0,
        successRate: successRate(u.profile?.completedOrders ?? 0, u.profile?.cancelledOrders ?? 0),
        availableBalance: u.profile?.availableBalance ?? 0,
        pendingBalance: u.profile?.pendingBalance ?? 0,
        totalEarned: u.profile?.totalEarned ?? 0,
        totalSpent: u.profile?.totalSpent ?? 0,
        buyerOrders: u._count.orders,
        workerOrders: u._count.assignments,
      })),
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/users/:id/ban', async (req, res, next) => {
  try {
    const { banned, reason } = z
      .object({ banned: z.boolean(), reason: z.string().max(200).optional() })
      .parse(req.body);
    const me = currentUser(req);
    if (me.id === req.params.id) throw new AppError('FORBIDDEN', 400);

    await prisma.user.update({
      where: { id: req.params.id },
      data: { isBanned: banned, banReason: banned ? (reason ?? null) : null },
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

/* ---------------------------------------------------------------- orders */

adminRouter.get('/orders', async (req, res, next) => {
  try {
    const status = req.query.status ? String(req.query.status) : undefined;
    const orders = (await prisma.order.findMany({
      where: status && status !== 'ALL' ? { status: status as never } : {},
      include: orderInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    })) as OrderWithRelations[];
    res.json({ items: orders.map((o) => mapOrder(o)) });
  } catch (error) {
    next(error);
  }
});

/* -------------------------------------------------------------- payments */

adminRouter.get('/payments', async (req, res, next) => {
  try {
    const status = req.query.status ? String(req.query.status) : undefined;
    const payments = await prisma.payment.findMany({
      where: status && status !== 'ALL' ? { status: status as never } : {},
      include: { order: { select: { title: true } }, payer: true, receiver: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({
      items: payments.map((p) => ({
        id: p.id,
        orderId: p.orderId,
        orderTitle: p.order.title,
        payer: p.payer.firstName,
        receiver: p.receiver?.firstName ?? null,
        grossAmount: p.grossAmount,
        platformFee: p.platformFee,
        workerAmount: p.workerAmount,
        status: p.status,
        provider: p.provider,
        transactionId: p.transactionId,
        createdAt: p.createdAt.toISOString(),
        releasedAt: p.releasedAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/* -------------------------------------------------------------- disputes */

adminRouter.get('/disputes', async (req, res, next) => {
  try {
    const status = req.query.status ? String(req.query.status) : undefined;
    const rows = await prisma.dispute.findMany({
      where: status && status !== 'ALL' ? { status: status as never } : {},
      include: {
        openedBy: { include: { profile: true } },
        order: { include: orderInclude },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({
      items: rows.map((row) =>
        mapDispute({
          ...row,
          openedBy: row.openedBy as UserWithProfile,
          order: row.order as OrderWithRelations,
        }),
      ),
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/disputes/:id/resolve', async (req, res, next) => {
  try {
    const { winner, resolution } = z
      .object({
        winner: z.enum(['BUYER', 'WORKER']),
        resolution: z.string().min(3).max(1000),
      })
      .parse(req.body);
    const order = await resolveDispute(req.params.id, winner, resolution);
    res.json(mapOrder(order));
  } catch (error) {
    next(error);
  }
});

/* ----------------------------------------------------------- withdrawals */

adminRouter.get('/withdrawals', async (req, res, next) => {
  try {
    const status = req.query.status ? String(req.query.status) : undefined;
    const rows = await prisma.withdrawal.findMany({
      where: status && status !== 'ALL' ? { status: status as never } : {},
      include: { worker: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({
      items: rows.map((row) => ({
        ...mapWithdrawal(row),
        worker: { id: row.workerId, firstName: row.worker.firstName },
      })),
    });
  } catch (error) {
    next(error);
  }
});

/** Manual payout: admin to'lovni tasdiqlaydi yoki rad etadi */
adminRouter.post('/withdrawals/:id/decide', async (req, res, next) => {
  try {
    const { decision, note } = z
      .object({
        decision: z.enum(['PROCESSING', 'COMPLETED', 'REJECTED']),
        note: z.string().max(300).optional(),
      })
      .parse(req.body);

    const row = await prisma.withdrawal.findUnique({ where: { id: req.params.id } });
    if (!row) throw new AppError('WITHDRAWAL_NOT_FOUND', 404);
    if (row.status === 'COMPLETED' || row.status === 'REJECTED') {
      throw new AppError('FORBIDDEN', 409);
    }

    await prisma.$transaction(async (tx) => {
      await tx.withdrawal.update({
        where: { id: row.id },
        data: { status: decision, note: note ?? null },
      });
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
          ? 'Pul yechish amalga oshirildi.'
          : decision === 'REJECTED'
            ? `Rad etildi. ${note ?? ''}`.trim()
            : 'So‘rovingiz ko‘rib chiqilmoqda.',
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

/** Qo'lda ishga tushiriladigan maintenance */
adminRouter.post('/maintenance/expire-orders', async (_req, res, next) => {
  try {
    const count = await expireStaleOrders();
    res.json({ ok: true, expired: count });
  } catch (error) {
    next(error);
  }
});
