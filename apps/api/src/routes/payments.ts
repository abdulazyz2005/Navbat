import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '@navbat/shared';
import { prisma } from '../lib/prisma.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/rate-limit.js';
import { mapOrder } from '../lib/dto.js';
import { confirmOrder, payAndPublishOrder } from '../services/orders.js';

export const paymentsRouter = Router();

/** POST /payments/create — buyurtma uchun escrow to'lov (order PUBLISHED bo'ladi) */
paymentsRouter.post('/create', requireAuth, writeLimiter, async (req, res, next) => {
  try {
    const me = currentUser(req);
    const { orderId } = z.object({ orderId: z.string().uuid() }).parse(req.body);
    const order = await payAndPublishOrder(me.id, orderId);
    res.status(201).json(mapOrder(order, { viewerId: me.id }));
  } catch (error) {
    next(error);
  }
});

/** GET /payments/:id — faqat to'lov egalari ko'ra oladi */
paymentsRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const me = currentUser(req);
    const payment = await prisma.payment.findUnique({ where: { id: req.params.id } });
    if (!payment) throw new AppError('PAYMENT_NOT_FOUND', 404);
    if (payment.payerId !== me.id && payment.receiverId !== me.id && !me.isAdmin) {
      throw new AppError('FORBIDDEN', 403);
    }
    res.json(payment);
  } catch (error) {
    next(error);
  }
});

/** POST /payments/:id/release — buyurtmachi tasdiqlashi orqali */
paymentsRouter.post('/:id/release', requireAuth, writeLimiter, async (req, res, next) => {
  try {
    const me = currentUser(req);
    const payment = await prisma.payment.findUnique({ where: { id: req.params.id } });
    if (!payment) throw new AppError('PAYMENT_NOT_FOUND', 404);
    if (payment.payerId !== me.id) throw new AppError('FORBIDDEN', 403);
    const order = await confirmOrder(me.id, payment.orderId);
    res.json(mapOrder(order, { viewerId: me.id }));
  } catch (error) {
    next(error);
  }
});
