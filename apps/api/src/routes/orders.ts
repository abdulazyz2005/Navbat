import { Router } from 'express';
import { z } from 'zod';
import { ACTIVE_ORDER_STATUSES, AppError } from '@navbat/shared';
import { prisma } from '../lib/prisma.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/rate-limit.js';
import {
  mapCheckIn,
  mapMessage,
  mapOrder,
  orderInclude,
  type OrderWithRelations,
} from '../lib/dto.js';
import {
  acceptOrder,
  assertParticipant,
  cancelOrder,
  completeOrder,
  confirmOrder,
  createOrder,
  getOrderOrThrow,
  openDispute,
  payAndPublishOrder,
  periodicCheckIn,
  raiseOrderPrice,
  rateOrder,
  startOrder,
} from '../services/orders.js';
import { feedForWorker } from '../services/feed.js';
import { notify } from '../services/notifications.js';

export const ordersRouter = Router();

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
const dateRe = /^\d{4}-\d{2}-\d{2}$/;

const createSchema = z.object({
  category: z.enum([
    'DOCTOR',
    'GOVERNMENT',
    'DOCUMENTS',
    'BANK',
    'CONSULATE',
    'SHOP',
    'EVENT',
    'OTHER',
  ]),
  categoryOther: z.string().max(60).optional(),
  title: z.string().min(3).max(120),
  description: z.string().max(1000).optional(),
  locationName: z.string().min(2).max(120),
  address: z.string().min(2).max(200),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  date: z.string().regex(dateRe, 'YYYY-MM-DD formatida bo‘lishi kerak'),
  startTime: z.string().regex(timeRe, 'HH:mm formatida bo‘lishi kerak'),
  endTime: z.string().regex(timeRe, 'HH:mm formatida bo‘lishi kerak'),
  offeredAmount: z.number().int().positive(),
});

/** POST /orders — buyurtma yaratish (DRAFT + PENDING payment) */
ordersRouter.post('/', requireAuth, writeLimiter, async (req, res, next) => {
  try {
    const me = currentUser(req);
    const input = createSchema.parse(req.body);
    const order = await createOrder(me.id, input);
    res.status(201).json(mapOrder(order, { viewerId: me.id }));
  } catch (error) {
    next(error);
  }
});

/**
 * GET /orders — mening buyurtmalarim (buyer) yoki topshiriqlarim (worker)
 * ?role=buyer|worker  ?status=ACTIVE|COMPLETED|ALL
 */
ordersRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const me = currentUser(req);
    const role = req.query.role === 'worker' ? 'worker' : 'buyer';
    const statusFilter = String(req.query.status ?? 'ALL');

    const statusWhere =
      statusFilter === 'ACTIVE'
        ? { status: { in: [...ACTIVE_ORDER_STATUSES] } }
        : statusFilter === 'COMPLETED'
          ? { status: { in: ['COMPLETED' as const] } }
          : ({} as Record<string, never>);

    const where =
      role === 'buyer'
        ? { buyerId: me.id, ...statusWhere }
        : {
            assignments: {
              some: { workerId: me.id, status: { in: ['ACTIVE' as const, 'COMPLETED' as const] } },
            },
            ...statusWhere,
          };

    const orders = (await prisma.order.findMany({
      where,
      include: orderInclude,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    })) as OrderWithRelations[];

    res.json({ items: orders.map((order) => mapOrder(order, { viewerId: me.id })) });
  } catch (error) {
    next(error);
  }
});

/** GET /orders/feed — navbatchi uchun mos topshiriqlar */
ordersRouter.get('/feed', requireAuth, async (req, res, next) => {
  try {
    const me = currentUser(req);
    const q = req.query;
    const result = await feedForWorker({
      workerId: me.id,
      category: q.category ? (String(q.category) as never) : undefined,
      date: q.date ? String(q.date) : undefined,
      minAmount: q.minAmount ? Number.parseInt(String(q.minAmount), 10) : undefined,
      maxDistanceKm: q.maxDistanceKm ? Number(q.maxDistanceKm) : undefined,
      sort: q.sort ? (String(q.sort) as never) : undefined,
      all: q.all === 'true',
      page: q.page ? Number.parseInt(String(q.page), 10) : 1,
      limit: q.limit ? Number.parseInt(String(q.limit), 10) : 20,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/** GET /orders/:id */
ordersRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const me = currentUser(req);
    const order = await getOrderOrThrow(req.params.id);

    // PUBLISHED buyurtmani har qanday navbatchi ko'ra oladi (feeddan kirish uchun),
    // qolgan holatlarda faqat ishtirokchilar va adminlar.
    const isParticipant =
      order.buyerId === me.id ||
      (order.assignments ?? []).some((a) => a.workerId === me.id && a.status !== 'CANCELLED');
    if (!isParticipant && order.status !== 'PUBLISHED' && !me.isAdmin) {
      throw new AppError('NOT_ORDER_PARTICIPANT', 403);
    }

    res.json(mapOrder(order, { viewerId: me.id }));
  } catch (error) {
    next(error);
  }
});

/** PATCH /orders/:id — faqat DRAFT holatda tahrirlash */
const patchSchema = createSchema.partial();
ordersRouter.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const me = currentUser(req);
    const order = await getOrderOrThrow(req.params.id);
    if (order.buyerId !== me.id) throw new AppError('FORBIDDEN', 403);
    if (order.status !== 'DRAFT') throw new AppError('ILLEGAL_ORDER_TRANSITION', 409);

    const data = patchSchema.parse(req.body);
    const updated = (await prisma.order.update({
      where: { id: order.id },
      data: {
        ...data,
        date: data.date ? new Date(`${data.date}T00:00:00.000Z`) : undefined,
      },
      include: orderInclude,
    })) as OrderWithRelations;
    res.json(mapOrder(updated, { viewerId: me.id }));
  } catch (error) {
    next(error);
  }
});

/** POST /orders/:id/pay — to'lash va e'lon qilish */
ordersRouter.post('/:id/pay', requireAuth, writeLimiter, async (req, res, next) => {
  try {
    const me = currentUser(req);
    const order = await payAndPublishOrder(me.id, req.params.id);
    res.json(mapOrder(order, { viewerId: me.id }));
  } catch (error) {
    next(error);
  }
});

/** POST /orders/:id/raise-price */
ordersRouter.post('/:id/raise-price', requireAuth, writeLimiter, async (req, res, next) => {
  try {
    const me = currentUser(req);
    const { amount } = z.object({ amount: z.number().int().positive() }).parse(req.body);
    const order = await raiseOrderPrice(me.id, req.params.id, amount);
    res.json(mapOrder(order, { viewerId: me.id }));
  } catch (error) {
    next(error);
  }
});

/** POST /orders/:id/accept */
ordersRouter.post('/:id/accept', requireAuth, writeLimiter, async (req, res, next) => {
  try {
    const me = currentUser(req);
    const order = await acceptOrder(me.id, req.params.id);
    res.json(mapOrder(order, { viewerId: me.id }));
  } catch (error) {
    next(error);
  }
});

const locationSchema = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  })
  .optional();

/** POST /orders/:id/start */
ordersRouter.post('/:id/start', requireAuth, writeLimiter, async (req, res, next) => {
  try {
    const me = currentUser(req);
    const location = locationSchema.parse(req.body?.location);
    const order = await startOrder(me.id, req.params.id, location);
    res.json(mapOrder(order, { viewerId: me.id }));
  } catch (error) {
    next(error);
  }
});

/** POST /orders/:id/checkin — "Hali ham navbatdasizmi?" tasdiqlash */
ordersRouter.post('/:id/checkin', requireAuth, writeLimiter, async (req, res, next) => {
  try {
    const me = currentUser(req);
    const location = locationSchema.parse(req.body?.location);
    const checkIn = await periodicCheckIn(me.id, req.params.id, location);
    res.status(201).json(mapCheckIn(checkIn));
  } catch (error) {
    next(error);
  }
});

/** GET /orders/:id/checkins */
ordersRouter.get('/:id/checkins', requireAuth, async (req, res, next) => {
  try {
    const me = currentUser(req);
    const order = await getOrderOrThrow(req.params.id);
    assertParticipant(order, me.id);
    const rows = await prisma.checkIn.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ items: rows.map(mapCheckIn) });
  } catch (error) {
    next(error);
  }
});

/** POST /orders/:id/complete — navbatchi yakunladi */
ordersRouter.post('/:id/complete', requireAuth, writeLimiter, async (req, res, next) => {
  try {
    const me = currentUser(req);
    const order = await completeOrder(me.id, req.params.id);
    res.json(mapOrder(order, { viewerId: me.id }));
  } catch (error) {
    next(error);
  }
});

/** POST /orders/:id/confirm — buyurtmachi tasdiqladi -> payment RELEASED */
ordersRouter.post('/:id/confirm', requireAuth, writeLimiter, async (req, res, next) => {
  try {
    const me = currentUser(req);
    const order = await confirmOrder(me.id, req.params.id);
    res.json(mapOrder(order, { viewerId: me.id }));
  } catch (error) {
    next(error);
  }
});

/** POST /orders/:id/cancel */
ordersRouter.post('/:id/cancel', requireAuth, writeLimiter, async (req, res, next) => {
  try {
    const me = currentUser(req);
    const { reason } = z.object({ reason: z.string().max(300).optional() }).parse(req.body ?? {});
    const order = await cancelOrder(me.id, req.params.id, reason);
    res.json(mapOrder(order, { viewerId: me.id }));
  } catch (error) {
    next(error);
  }
});

/** POST /orders/:id/dispute — "Muammo bor" */
ordersRouter.post('/:id/dispute', requireAuth, writeLimiter, async (req, res, next) => {
  try {
    const me = currentUser(req);
    const { reason, description } = z
      .object({
        reason: z.enum(['WORKER_NO_SHOW', 'WORKER_LATE', 'TASK_NOT_DONE', 'WRONG_PLACE', 'OTHER']),
        description: z.string().max(1000).optional(),
      })
      .parse(req.body);
    const dispute = await openDispute(me.id, req.params.id, reason, description);
    res.status(201).json(dispute);
  } catch (error) {
    next(error);
  }
});

/* ------------------------------------------------------------------- chat */

/** GET /orders/:id/messages */
ordersRouter.get('/:id/messages', requireAuth, async (req, res, next) => {
  try {
    const me = currentUser(req);
    const order = await getOrderOrThrow(req.params.id);
    assertParticipant(order, me.id);
    if (!order.assignments?.some((a) => a.status !== 'CANCELLED')) {
      throw new AppError('CHAT_NOT_AVAILABLE', 409);
    }

    const messages = await prisma.message.findMany({
      where: { orderId: order.id },
      include: { sender: true },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });

    await prisma.message.updateMany({
      where: { orderId: order.id, senderId: { not: me.id }, readAt: null },
      data: { readAt: new Date() },
    });

    res.json({ items: messages.map((m) => mapMessage(m, me.id)) });
  } catch (error) {
    next(error);
  }
});

/** POST /orders/:id/messages */
ordersRouter.post('/:id/messages', requireAuth, writeLimiter, async (req, res, next) => {
  try {
    const me = currentUser(req);
    const order = await getOrderOrThrow(req.params.id);
    const role = assertParticipant(order, me.id);

    const assignment = order.assignments?.find((a) => a.status !== 'CANCELLED');
    if (!assignment) throw new AppError('CHAT_NOT_AVAILABLE', 409);

    const body = z
      .object({
        body: z.string().min(1).max(2000),
        type: z.enum(['TEXT', 'PHOTO', 'LOCATION']).default('TEXT'),
        fileId: z.string().max(200).optional(),
        latitude: z.number().min(-90).max(90).optional(),
        longitude: z.number().min(-180).max(180).optional(),
      })
      .parse(req.body);

    const message = await prisma.message.create({
      data: {
        orderId: order.id,
        senderId: me.id,
        body: body.body,
        type: body.type,
        fileId: body.fileId ?? null,
        latitude: body.latitude ?? null,
        longitude: body.longitude ?? null,
      },
      include: { sender: true },
    });

    const recipientId = role === 'BUYER' ? assignment.workerId : order.buyerId;
    await notify({
      userId: recipientId,
      type: 'NEW_MESSAGE',
      title: `${me.firstName}dan xabar`,
      body: body.type === 'TEXT' ? body.body.slice(0, 200) : 'Yangi xabar',
      orderId: order.id,
      deepLink: `/chat/${order.id}`,
    });

    res.status(201).json(mapMessage(message, me.id));
  } catch (error) {
    next(error);
  }
});

/* ----------------------------------------------------------------- rating */

/** POST /orders/:id/rate */
ordersRouter.post('/:id/rate', requireAuth, writeLimiter, async (req, res, next) => {
  try {
    const me = currentUser(req);
    const { rating, comment } = z
      .object({ rating: z.number().int().min(1).max(5), comment: z.string().max(500).optional() })
      .parse(req.body);
    const created = await rateOrder(me.id, req.params.id, rating, comment);
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});
