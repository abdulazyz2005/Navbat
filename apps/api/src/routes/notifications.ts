import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { mapNotification } from '../lib/dto.js';

export const notificationsRouter = Router();

notificationsRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const me = currentUser(req);
    const rows = await prisma.notification.findMany({
      where: { userId: me.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ items: rows.map(mapNotification) });
  } catch (error) {
    next(error);
  }
});

notificationsRouter.post('/read', requireAuth, async (req, res, next) => {
  try {
    const me = currentUser(req);
    await prisma.notification.updateMany({
      where: { userId: me.id, read: false },
      data: { read: true },
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
