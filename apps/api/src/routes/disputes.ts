import { Router } from 'express';
import { AppError } from '@navbat/shared';
import { prisma } from '../lib/prisma.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { mapDispute, orderInclude, type OrderWithRelations, type UserWithProfile } from '../lib/dto.js';

export const disputesRouter = Router();

/** GET /disputes — mening nizolarim (admin uchun /admin/disputes) */
disputesRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const me = currentUser(req);
    const rows = await prisma.dispute.findMany({
      where: {
        OR: [
          { openedById: me.id },
          { order: { buyerId: me.id } },
          { order: { assignments: { some: { workerId: me.id } } } },
        ],
      },
      include: {
        openedBy: { include: { profile: true } },
        order: { include: orderInclude },
      },
      orderBy: { createdAt: 'desc' },
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

disputesRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const me = currentUser(req);
    const row = await prisma.dispute.findUnique({
      where: { id: req.params.id },
      include: {
        openedBy: { include: { profile: true } },
        order: { include: orderInclude },
      },
    });
    if (!row) throw new AppError('NOT_FOUND', 404);

    const order = row.order as OrderWithRelations;
    const allowed =
      me.isAdmin ||
      order.buyerId === me.id ||
      (order.assignments ?? []).some((a) => a.workerId === me.id);
    if (!allowed) throw new AppError('FORBIDDEN', 403);

    res.json(mapDispute({ ...row, openedBy: row.openedBy as UserWithProfile, order }));
  } catch (error) {
    next(error);
  }
});
