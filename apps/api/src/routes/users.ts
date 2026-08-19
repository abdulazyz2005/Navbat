import { Router } from 'express';
import { z } from 'zod';
import { AppError, successRate, type MeResponse } from '@navbat/shared';
import { prisma } from '../lib/prisma.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { mapPublicUser, mapRating, type UserWithProfile } from '../lib/dto.js';

export const usersRouter = Router();

usersRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const me = currentUser(req);
    const user = await prisma.user.findUnique({
      where: { id: me.id },
      include: { profile: true },
    });
    if (!user?.profile) throw new AppError('NOT_FOUND', 404);

    const unread = await prisma.notification.count({
      where: { userId: me.id, read: false },
    });

    const response: MeResponse = {
      id: user.id,
      telegramId: user.telegramId.toString(),
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      photoUrl: user.photoUrl,
      isAdmin: user.isAdmin,
      profile: {
        roleMode: user.profile.roleMode,
        onboarded: user.profile.onboarded,
        rating: user.profile.rating,
        ratingCount: user.profile.ratingCount,
        completedOrders: user.profile.completedOrders,
        cancelledOrders: user.profile.cancelledOrders,
        successRate: successRate(user.profile.completedOrders, user.profile.cancelledOrders),
        totalSpent: user.profile.totalSpent,
        totalEarned: user.profile.totalEarned,
        availableBalance: user.profile.availableBalance,
        pendingBalance: user.profile.pendingBalance,
        city: user.profile.city,
        phone: user.profile.phone,
        cardNumber: user.profile.cardNumber,
        cardHolder: user.profile.cardHolder,
      },
      unreadNotifications: unread,
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * Foydalanuvchi FAQAT shu maydonlarni o'zgartira oladi.
 * Balans, reyting, isAdmin — hech qachon bu yerdan o'zgarmaydi.
 */
const patchSchema = z.object({
  roleMode: z.enum(['BUYER', 'WORKER', 'BOTH']).optional(),
  onboarded: z.boolean().optional(),
  city: z.string().max(80).optional(),
  phone: z.string().max(30).optional(),
  cardNumber: z.string().max(25).optional(),
  cardHolder: z.string().max(80).optional(),
});

usersRouter.patch('/me', requireAuth, async (req, res, next) => {
  try {
    const me = currentUser(req);
    const data = patchSchema.parse(req.body);

    if (data.cardNumber !== undefined) {
      const digits = data.cardNumber.replace(/\D/g, '');
      if (digits.length > 0 && digits.length !== 16) throw new AppError('INVALID_CARD', 400);
      data.cardNumber = digits;
    }

    const profile = await prisma.profile.update({
      where: { userId: me.id },
      data,
    });
    res.json({ ok: true, profile });
  } catch (error) {
    next(error);
  }
});

usersRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { profile: true },
    });
    if (!user) throw new AppError('NOT_FOUND', 404);
    res.json(mapPublicUser(user as UserWithProfile));
  } catch (error) {
    next(error);
  }
});

usersRouter.get('/:id/ratings', requireAuth, async (req, res, next) => {
  try {
    const ratings = await prisma.rating.findMany({
      where: { toUserId: req.params.id },
      include: { fromUser: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ items: ratings.map(mapRating) });
  } catch (error) {
    next(error);
  }
});
