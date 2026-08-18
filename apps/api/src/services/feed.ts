import { computeMatch, distanceKm, type OrderCategory } from '@navbat/shared';
import { prisma } from '../lib/prisma.js';
import {
  fromDateString,
  mapOrder,
  orderInclude,
  todayString,
  type OrderWithRelations,
} from '../lib/dto.js';
import type { OrderDTO, Paginated } from '@navbat/shared';

export interface FeedOptions {
  workerId: string;
  category?: OrderCategory;
  date?: string;
  minAmount?: number;
  maxDistanceKm?: number;
  sort?: 'nearest' | 'highest_pay' | 'newest' | 'best_match';
  /** true bo'lsa bo'sh vaqtga mos kelmaydigan topshiriqlar ham ko'rsatiladi */
  all?: boolean;
  page?: number;
  limit?: number;
}

interface Scored {
  order: OrderWithRelations;
  score: number;
  distance: number;
  eligible: boolean;
}

/**
 * Navbatchi uchun topshiriqlar feedi.
 * Avval SQL filtr (sana/status/kategoriya/summa), keyin deterministik matching score.
 */
export async function feedForWorker(options: FeedOptions): Promise<Paginated<OrderDTO>> {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(50, Math.max(1, options.limit ?? 20));

  const orders = (await prisma.order.findMany({
    where: {
      status: 'PUBLISHED',
      buyerId: { not: options.workerId },
      date: options.date ? fromDateString(options.date) : { gte: fromDateString(todayString()) },
      ...(options.category ? { category: options.category } : {}),
      ...(options.minAmount ? { offeredAmount: { gte: options.minAmount } } : {}),
    },
    include: orderInclude,
    orderBy: [{ date: 'asc' }, { createdAt: 'desc' }],
    take: 300,
  })) as OrderWithRelations[];

  const availabilities = await prisma.availability.findMany({
    where: {
      workerId: options.workerId,
      active: true,
      date: { gte: fromDateString(todayString()) },
    },
  });

  const profile = await prisma.profile.findUnique({ where: { userId: options.workerId } });
  const workerInput = {
    ratingInt: profile?.rating ?? 0,
    completedOrders: profile?.completedOrders ?? 0,
  };

  const scored: Scored[] = orders.map((order) => {
    const orderInput = {
      date: order.date.toISOString().slice(0, 10),
      startTime: order.startTime,
      endTime: order.endTime,
      latitude: order.latitude,
      longitude: order.longitude,
      offeredAmount: order.offeredAmount,
    };

    let best = { score: 0, distanceKm: Number.POSITIVE_INFINITY, eligible: false };
    for (const availability of availabilities) {
      const match = computeMatch(
        orderInput,
        {
          date: availability.date.toISOString().slice(0, 10),
          startTime: availability.startTime,
          endTime: availability.endTime,
          latitude: availability.latitude,
          longitude: availability.longitude,
          radiusKm: availability.radiusKm,
          minimumAmount: availability.minimumAmount,
        },
        workerInput,
      );
      if (match.score > best.score || (match.eligible && !best.eligible)) {
        best = { score: match.score, distanceKm: match.distanceKm, eligible: match.eligible };
      }
    }

    // Bo'sh vaqt kiritilmagan bo'lsa — eng yaqin availability yo'q, masofani hisoblab bo'lmaydi
    if (availabilities.length === 0) {
      best = { score: 0, distanceKm: Number.POSITIVE_INFINITY, eligible: false };
    }

    return {
      order,
      score: best.score,
      distance: best.distanceKm,
      eligible: best.eligible,
    };
  });

  let filtered = options.all || availabilities.length === 0
    ? scored
    : scored.filter((s) => s.eligible);

  if (options.maxDistanceKm !== undefined) {
    filtered = filtered.filter(
      (s) => Number.isFinite(s.distance) && s.distance <= options.maxDistanceKm!,
    );
  }

  const sort = options.sort ?? 'best_match';
  filtered.sort((a, b) => {
    switch (sort) {
      case 'nearest':
        return a.distance - b.distance;
      case 'highest_pay':
        return b.order.offeredAmount - a.order.offeredAmount;
      case 'newest':
        return b.order.createdAt.getTime() - a.order.createdAt.getTime();
      default:
        if (b.score !== a.score) return b.score - a.score;
        return a.distance - b.distance;
    }
  });

  const total = filtered.length;
  const slice = filtered.slice((page - 1) * limit, page * limit);

  return {
    items: slice.map((s) =>
      mapOrder(s.order, {
        viewerId: options.workerId,
        matchScore: s.score,
        distanceKm: Number.isFinite(s.distance) ? s.distance : undefined,
      }),
    ),
    page,
    limit,
    total,
    hasMore: page * limit < total,
  };
}

/** Bitta bo'sh vaqt yozuviga nechta topshiriq mos kelishini sanaydi */
export async function countMatchingOrders(
  workerId: string,
  availabilityId: string,
): Promise<number> {
  const availability = await prisma.availability.findUnique({ where: { id: availabilityId } });
  if (!availability || availability.workerId !== workerId) return 0;

  const orders = await prisma.order.findMany({
    where: { status: 'PUBLISHED', date: availability.date, buyerId: { not: workerId } },
  });
  const profile = await prisma.profile.findUnique({ where: { userId: workerId } });

  return orders.filter(
    (order) =>
      computeMatch(
        {
          date: order.date.toISOString().slice(0, 10),
          startTime: order.startTime,
          endTime: order.endTime,
          latitude: order.latitude,
          longitude: order.longitude,
          offeredAmount: order.offeredAmount,
        },
        {
          date: availability.date.toISOString().slice(0, 10),
          startTime: availability.startTime,
          endTime: availability.endTime,
          latitude: availability.latitude,
          longitude: availability.longitude,
          radiusKm: availability.radiusKm,
          minimumAmount: availability.minimumAmount,
        },
        { ratingInt: profile?.rating ?? 0, completedOrders: profile?.completedOrders ?? 0 },
      ).eligible,
  ).length;
}

export { distanceKm };
