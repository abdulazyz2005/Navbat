import { Router } from 'express';
import { z } from 'zod';
import { AppError, toMinutes } from '@navbat/shared';
import { prisma } from '../lib/prisma.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/rate-limit.js';
import { fromDateString, mapAvailability, todayString } from '../lib/dto.js';
import { countMatchingOrders } from '../services/feed.js';

export const availabilityRouter = Router();

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  locationName: z.string().min(2).max(120),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusKm: z.number().int().min(1).max(50),
  minimumAmount: z.number().int().min(0),
});

/** POST /availability — "Men bo'shman" */
availabilityRouter.post('/', requireAuth, writeLimiter, async (req, res, next) => {
  try {
    const me = currentUser(req);
    const input = schema.parse(req.body);
    if (input.date < todayString()) throw new AppError('PAST_DATE', 400);
    if (toMinutes(input.endTime) <= toMinutes(input.startTime)) {
      throw new AppError('INVALID_TIME_RANGE', 400);
    }

    const row = await prisma.availability.create({
      data: { ...input, workerId: me.id, date: fromDateString(input.date) },
    });
    const matching = await countMatchingOrders(me.id, row.id);
    res.status(201).json(mapAvailability(row, matching));
  } catch (error) {
    next(error);
  }
});

/** GET /availability — mening bo'sh vaqtlarim */
availabilityRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const me = currentUser(req);
    const includePast = req.query.includePast === 'true';
    const rows = await prisma.availability.findMany({
      where: {
        workerId: me.id,
        ...(includePast ? {} : { date: { gte: fromDateString(todayString()) } }),
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });

    const items = await Promise.all(
      rows.map(async (row) => mapAvailability(row, await countMatchingOrders(me.id, row.id))),
    );
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

/** DELETE /availability/:id */
availabilityRouter.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const me = currentUser(req);
    const row = await prisma.availability.findUnique({ where: { id: req.params.id } });
    if (!row) throw new AppError('NOT_FOUND', 404);
    if (row.workerId !== me.id) throw new AppError('FORBIDDEN', 403);
    await prisma.availability.delete({ where: { id: row.id } });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
