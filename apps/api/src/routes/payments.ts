import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '@navbat/shared';
import { prisma } from '../lib/prisma.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/rate-limit.js';
import { mapOrder } from '../lib/dto.js';
import { confirmOrder, payAndPublishOrder } from '../services/orders.js';
import { notifyAdminsAboutReceipt } from '../services/admin-bot.js';
import {
  MAX_RECEIPT_BYTES,
  activeIntentOf,
  attachReceipt,
  createIntent,
  getIntentOrThrow,
  mapIntent,
} from '../services/payment-intents.js';

export const paymentsRouter = Router();

/** POST /payments/create — buyurtmani balansdan to'lash (order PUBLISHED bo'ladi) */
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

/* ------------------------------------------------- karta orqali to'ldirish */

const intentSchema = z.object({
  amount: z.number().int().positive().max(100_000_000),
  orderId: z.string().uuid().optional(),
});

/**
 * POST /payments/intents — karta orqali to'lash uchun unikal summa oladi.
 * Javobda: karta raqami, egasining ismi va AYNAN yuborilishi kerak bo'lgan summa.
 */
paymentsRouter.post('/intents', requireAuth, writeLimiter, async (req, res, next) => {
  try {
    const me = currentUser(req);
    const input = intentSchema.parse(req.body);

    if (input.orderId) {
      const order = await prisma.order.findUnique({ where: { id: input.orderId } });
      if (!order) throw new AppError('ORDER_NOT_FOUND', 404);
      if (order.buyerId !== me.id) throw new AppError('FORBIDDEN', 403);
    }

    const intent = await createIntent({
      userId: me.id,
      amount: input.amount,
      orderId: input.orderId ?? null,
    });
    res.status(201).json(mapIntent(intent));
  } catch (error) {
    next(error);
  }
});

/** GET /payments/intents/active — tugallanmagan to'lov (bo'lsa) */
paymentsRouter.get('/intents/active', requireAuth, async (req, res, next) => {
  try {
    const me = currentUser(req);
    const intent = await activeIntentOf(me.id);
    res.json(intent ? mapIntent(intent) : null);
  } catch (error) {
    next(error);
  }
});

/** GET /payments/intents — oxirgi to'lovlar tarixi */
paymentsRouter.get('/intents', requireAuth, async (req, res, next) => {
  try {
    const me = currentUser(req);
    const rows = await prisma.paymentIntent.findMany({
      where: { userId: me.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    res.json({ items: rows.map(mapIntent) });
  } catch (error) {
    next(error);
  }
});

const receiptSchema = z.object({
  /** data:image/jpeg;base64,... yoki toza base64 */
  image: z.string().min(32).max(Math.ceil((MAX_RECEIPT_BYTES * 4) / 3) + 1024),
  mime: z.enum(['image/jpeg', 'image/png', 'image/webp']).optional(),
});

/** POST /payments/intents/:id/receipt — chek rasmini yuklash */
paymentsRouter.post('/intents/:id/receipt', requireAuth, writeLimiter, async (req, res, next) => {
  try {
    const me = currentUser(req);
    const input = receiptSchema.parse(req.body);

    const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(input.image);
    const base64 = match ? match[2] : input.image;
    const mime = match ? match[1] : (input.mime ?? 'image/jpeg');

    const data = Buffer.from(base64, 'base64');
    if (data.byteLength === 0) throw new AppError('INVALID_RECEIPT_FORMAT', 400);
    if (data.byteLength > MAX_RECEIPT_BYTES) throw new AppError('RECEIPT_TOO_LARGE', 413);

    const intent = await attachReceipt({
      intentId: req.params.id,
      userId: me.id,
      data: new Uint8Array(data),
      mime,
    });
    // Adminlarga darhol xabar: chek keldi, tasdiqlash kerak
    void notifyAdminsAboutReceipt(intent);
    res.json(mapIntent(intent));
  } catch (error) {
    next(error);
  }
});

/** GET /payments/intents/:id — o'z to'lovi holati */
paymentsRouter.get('/intents/:id', requireAuth, async (req, res, next) => {
  try {
    const me = currentUser(req);
    const intent = await getIntentOrThrow(req.params.id);
    if (intent.userId !== me.id) throw new AppError('FORBIDDEN', 403);
    res.json(mapIntent(intent));
  } catch (error) {
    next(error);
  }
});

/* -------------------------------------------------------------- to'lovlar */

/** GET /payments/:id — faqat to'lov egalari ko'ra oladi */
paymentsRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const me = currentUser(req);
    const payment = await prisma.payment.findUnique({ where: { id: req.params.id } });
    if (!payment) throw new AppError('PAYMENT_NOT_FOUND', 404);
    if (payment.payerId !== me.id && payment.receiverId !== me.id) {
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
