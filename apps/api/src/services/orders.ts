import {
  AppError,
  ORDER_CATEGORY_LABELS,
  assertOrderTransition,
  assertPaymentTransition,
  calculatePrice,
  computeMatch,
  distanceKm,
  formatUZS,
  recalcRating,
  toMinutes,
  type CreateOrderInput,
  type OrderStatus,
} from '@navbat/shared';
import { env } from '../env.js';
import { prisma } from '../lib/prisma.js';
import { fromDateString, orderInclude, todayString, type OrderWithRelations } from '../lib/dto.js';
import { addTotals, creditAvailable, movePending } from './ledger.js';
import { confirmIntent } from './payment-intents.js';
import { notify } from './notifications.js';

/* ------------------------------------------------------------------ helpers */

export async function getOrderOrThrow(orderId: string): Promise<OrderWithRelations> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: orderInclude });
  if (!order) throw new AppError('ORDER_NOT_FOUND', 404);
  return order as OrderWithRelations;
}

function activeAssignmentOf(order: OrderWithRelations) {
  return order.assignments?.find((a) => a.status === 'ACTIVE') ?? null;
}

/** Buyurtma ishtirokchisi (buyer yoki faol worker) ekanini tekshiradi */
export function assertParticipant(order: OrderWithRelations, userId: string): 'BUYER' | 'WORKER' {
  if (order.buyerId === userId) return 'BUYER';
  const assignment = order.assignments?.find(
    (a) => a.workerId === userId && (a.status === 'ACTIVE' || a.status === 'COMPLETED'),
  );
  if (assignment) return 'WORKER';
  throw new AppError('NOT_ORDER_PARTICIPANT', 403);
}

async function transitionOrder(orderId: string, from: OrderStatus, to: OrderStatus) {
  assertOrderTransition(from, to);
  // Optimistik qulf: status hali ham `from` bo'lsagina yangilanadi (race condition himoyasi)
  const result = await prisma.order.updateMany({
    where: { id: orderId, status: from },
    data: { status: to },
  });
  if (result.count === 0) throw new AppError('ILLEGAL_ORDER_TRANSITION', 409);
}

/* ------------------------------------------------------------------ create */

export async function createOrder(buyerId: string, input: CreateOrderInput) {
  const price = calculatePrice(input.offeredAmount, env.PLATFORM_FEE_PERCENT);

  if (input.offeredAmount < env.MIN_ORDER_AMOUNT) {
    throw new AppError('AMOUNT_TOO_LOW', 400, { min: env.MIN_ORDER_AMOUNT });
  }
  if (input.date < todayString()) throw new AppError('PAST_DATE', 400);
  if (toMinutes(input.endTime) <= toMinutes(input.startTime)) {
    throw new AppError('INVALID_TIME_RANGE', 400);
  }

  const order = await prisma.order.create({
    data: {
      buyerId,
      category: input.category,
      categoryOther: input.category === 'OTHER' ? (input.categoryOther ?? null) : null,
      title: input.title,
      description: input.description ?? null,
      locationName: input.locationName,
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
      date: fromDateString(input.date),
      startTime: input.startTime,
      endTime: input.endTime,
      offeredAmount: price.offeredAmount,
      platformFee: price.platformFee,
      workerAmount: price.workerAmount,
      totalAmount: price.totalAmount,
      status: 'DRAFT',
      payment: {
        create: {
          payerId: buyerId,
          grossAmount: price.totalAmount,
          platformFee: price.platformFee,
          workerAmount: price.workerAmount,
          status: 'PENDING',
          provider: 'card', // karta-karta o'tkazma, admin tasdig'i bilan
        },
      },
    },
    include: orderInclude,
  });

  return order as OrderWithRelations;
}

/* ----------------------------------------------------------------- payment */

/**
 * Buyurtmani to'lash va e'lon qilish.
 * Pul avval platformada HELD holatga o'tadi (escrow).
 */
export async function payAndPublishOrder(buyerId: string, orderId: string) {
  const order = await getOrderOrThrow(orderId);
  if (order.buyerId !== buyerId) throw new AppError('FORBIDDEN', 403);
  if (order.status !== 'DRAFT') throw new AppError('ILLEGAL_ORDER_TRANSITION', 409);

  const payment = order.payment;
  if (!payment) throw new AppError('PAYMENT_NOT_FOUND', 404);
  assertPaymentTransition(payment.status, 'PAID');

  const profile = await prisma.profile.findUnique({ where: { userId: buyerId } });
  if (!profile) throw new AppError('NOT_FOUND', 404);

  /**
   * Pul balansdan yechiladi. Balans karta orqali to'ldiriladi:
   * foydalanuvchi platforma kartasiga unikal summa yuboradi, admin chekni
   * tasdiqlaydi (`services/payment-intents.ts`). Shu tufayli hech qanday
   * tashqi provayder kerak emas va pul hech qachon "yo'lda" qolib ketmaydi.
   */
  const shortfall = order.totalAmount - profile.availableBalance;
  if (shortfall > 0) {
    throw new AppError('INSUFFICIENT_BALANCE', 402, {
      required: order.totalAmount,
      available: profile.availableBalance,
      shortfall,
    });
  }

  await prisma.$transaction(async (tx) => {
    // Ikki qatorli hisob: navbatchi ulushi + platforma xizmat haqi
    await creditAvailable({
      tx,
      userId: buyerId,
      type: 'ORDER_PAYMENT',
      amount: -order.workerAmount,
      orderId: order.id,
      note: 'Navbatchi uchun (escrowda)',
    });
    await creditAvailable({
      tx,
      userId: buyerId,
      type: 'PLATFORM_FEE',
      amount: -order.platformFee,
      orderId: order.id,
      note: 'Platforma xizmat haqi',
    });

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'HELD',
        paidAt: new Date(),
      },
    });

    await tx.order.update({
      where: { id: order.id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
  });

  await notify({
    userId: buyerId,
    type: 'ORDER_CREATED',
    title: 'Buyurtma e’lon qilindi',
    body: `${order.title} — ${formatUZS(order.offeredAmount)}. Navbatchi qidirilmoqda.`,
    orderId: order.id,
    deepLink: `/orders/${order.id}`,
  });

  void notifyMatchingWorkers(order.id);

  return getOrderOrThrow(order.id);
}

/** E'lon qilingan buyurtmaga mos navbatchilarga xabar yuboradi */
export async function notifyMatchingWorkers(orderId: string): Promise<number> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.status !== 'PUBLISHED') return 0;

  const candidates = await prisma.availability.findMany({
    where: { date: order.date, active: true, workerId: { not: order.buyerId } },
    include: { worker: { include: { profile: true } } },
  });

  const orderInput = {
    date: order.date.toISOString().slice(0, 10),
    startTime: order.startTime,
    endTime: order.endTime,
    latitude: order.latitude,
    longitude: order.longitude,
    offeredAmount: order.offeredAmount,
  };

  const notified = new Set<string>();
  for (const availability of candidates) {
    if (notified.has(availability.workerId)) continue;
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
      {
        ratingInt: availability.worker.profile?.rating ?? 0,
        completedOrders: availability.worker.profile?.completedOrders ?? 0,
      },
    );
    if (!match.eligible) continue;
    notified.add(availability.workerId);
    await notify({
      userId: availability.workerId,
      type: 'NEW_MATCHING_ORDER',
      title: 'Sizga mos yangi topshiriq',
      body: `${ORDER_CATEGORY_LABELS[order.category]} — ${order.locationName}\n${order.startTime}–${order.endTime} · ${formatUZS(order.workerAmount)} qo‘lga · Moslik: ${match.score}%`,
      orderId: order.id,
      deepLink: `/orders/${order.id}`,
    });
  }
  return notified.size;
}

/* ------------------------------------------------------------- raise price */

export async function raiseOrderPrice(buyerId: string, orderId: string, newAmount: number) {
  const order = await getOrderOrThrow(orderId);
  if (order.buyerId !== buyerId) throw new AppError('FORBIDDEN', 403);
  if (order.status !== 'PUBLISHED') throw new AppError('ILLEGAL_ORDER_TRANSITION', 409);
  if (newAmount <= order.offeredAmount) throw new AppError('PRICE_MUST_INCREASE', 400);

  const price = calculatePrice(newAmount, env.PLATFORM_FEE_PERCENT);
  const delta = price.totalAmount - order.totalAmount;
  const payment = order.payment;
  if (!payment) throw new AppError('PAYMENT_NOT_FOUND', 404);

  const profile = await prisma.profile.findUnique({ where: { userId: buyerId } });
  if (!profile) throw new AppError('NOT_FOUND', 404);

  // Farq balansdan yechiladi — yetmasa avval kartadan to'ldiriladi
  if (delta > profile.availableBalance) {
    throw new AppError('INSUFFICIENT_BALANCE', 402, {
      required: delta,
      available: profile.availableBalance,
      shortfall: delta - profile.availableBalance,
    });
  }

  await prisma.$transaction(async (tx) => {
    await creditAvailable({
      tx,
      userId: buyerId,
      type: 'ORDER_PAYMENT',
      amount: -(price.workerAmount - order.workerAmount),
      orderId: order.id,
      note: 'Taklif oshirildi (escrowda)',
    });
    await creditAvailable({
      tx,
      userId: buyerId,
      type: 'PLATFORM_FEE',
      amount: -(price.platformFee - order.platformFee),
      orderId: order.id,
      note: 'Platforma xizmat haqi (qo‘shimcha)',
    });

    await tx.order.update({
      where: { id: order.id },
      data: {
        offeredAmount: price.offeredAmount,
        platformFee: price.platformFee,
        workerAmount: price.workerAmount,
        totalAmount: price.totalAmount,
        priceRaises: { increment: 1 },
      },
    });
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        grossAmount: price.totalAmount,
        platformFee: price.platformFee,
        workerAmount: price.workerAmount,
      },
    });
  });

  void notifyMatchingWorkers(order.id);
  return getOrderOrThrow(order.id);
}

/* ------------------------------------------------------------------ accept */

export async function acceptOrder(workerId: string, orderId: string) {
  const order = await getOrderOrThrow(orderId);

  if (order.buyerId === workerId) throw new AppError('CANNOT_ACCEPT_OWN_ORDER', 400);
  if (order.status !== 'PUBLISHED') {
    throw new AppError(order.status === 'MATCHED' ? 'ORDER_ALREADY_ACCEPTED' : 'ORDER_NOT_PUBLISHED', 409);
  }
  if (order.date.toISOString().slice(0, 10) < todayString()) {
    throw new AppError('ORDER_EXPIRED', 409);
  }

  // Navbatchining shu sanadagi bo'sh vaqti bo'yicha moslik ballini hisoblaymiz
  const availability = await prisma.availability.findFirst({
    where: { workerId, date: order.date, active: true },
  });
  const profile = await prisma.profile.findUnique({ where: { userId: workerId } });

  const matchScore = availability
    ? computeMatch(
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
      ).score
    : 0;

  await prisma.$transaction(async (tx) => {
    // Race condition himoyasi: faqat PUBLISHED bo'lsa MATCHEDga o'tadi
    const updated = await tx.order.updateMany({
      where: { id: order.id, status: 'PUBLISHED' },
      data: { status: 'MATCHED' },
    });
    if (updated.count === 0) throw new AppError('ORDER_ALREADY_ACCEPTED', 409);

    await tx.assignment.create({
      data: { orderId: order.id, workerId, matchScore, status: 'ACTIVE' },
    });

    if (order.payment) {
      await tx.payment.update({
        where: { id: order.payment.id },
        data: { receiverId: workerId },
      });
    }
    // Navbatchining "kutilayotgan" balansiga xizmat haqi ushlangan summa qo'shiladi
    await movePending(tx, workerId, order.workerAmount);
  });

  const worker = await prisma.user.findUnique({ where: { id: workerId } });

  await notify({
    userId: order.buyerId,
    type: 'WORKER_FOUND',
    title: 'Navbatchi topildi',
    body: `${worker?.firstName ?? 'Navbatchi'} sizning topshiriqingizni qabul qildi.`,
    orderId: order.id,
    deepLink: `/orders/${order.id}`,
  });
  await notify({
    userId: workerId,
    type: 'ORDER_ACCEPTED',
    title: 'Topshiriq qabul qilindi',
    body: `${order.locationName} · ${order.startTime}–${order.endTime} · ${formatUZS(order.workerAmount)} qo‘lga tegadi`,
    orderId: order.id,
    deepLink: `/orders/${order.id}`,
  });

  return getOrderOrThrow(order.id);
}

/* ------------------------------------------------------------------- start */

export async function startOrder(
  workerId: string,
  orderId: string,
  location?: { latitude: number; longitude: number },
) {
  const order = await getOrderOrThrow(orderId);
  const assignment = activeAssignmentOf(order);
  if (!assignment) throw new AppError('NO_ACTIVE_ASSIGNMENT', 409);
  if (assignment.workerId !== workerId) throw new AppError('NOT_ASSIGNED_WORKER', 403);
  if (order.status === 'IN_PROGRESS') throw new AppError('ALREADY_STARTED', 409);

  let distanceM: number | null = null;
  if (location) {
    distanceM = Math.round(
      distanceKm(order.latitude, order.longitude, location.latitude, location.longitude) * 1000,
    );
  }

  await transitionOrder(order.id, order.status, 'IN_PROGRESS');
  await prisma.assignment.update({
    where: { id: assignment.id },
    data: { startedAt: new Date() },
  });
  await prisma.checkIn.create({
    data: {
      orderId: order.id,
      workerId,
      type: 'ARRIVAL',
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      distanceM,
    },
  });

  await notify({
    userId: order.buyerId,
    type: 'WORKER_STARTED',
    title: 'Navbatchi ishni boshladi',
    body: `${order.locationName}da navbat kutish boshlandi.`,
    orderId: order.id,
    deepLink: `/orders/${order.id}`,
  });

  return getOrderOrThrow(order.id);
}

/** Davomiy tasdiqlash: "Hali ham navbatdasizmi?" */
export async function periodicCheckIn(
  workerId: string,
  orderId: string,
  location?: { latitude: number; longitude: number },
) {
  const order = await getOrderOrThrow(orderId);
  const assignment = activeAssignmentOf(order);
  if (!assignment || assignment.workerId !== workerId) {
    throw new AppError('NOT_ASSIGNED_WORKER', 403);
  }
  if (order.status !== 'IN_PROGRESS') throw new AppError('NOT_STARTED', 409);

  const distanceM = location
    ? Math.round(
        distanceKm(order.latitude, order.longitude, location.latitude, location.longitude) * 1000,
      )
    : null;

  return prisma.checkIn.create({
    data: {
      orderId: order.id,
      workerId,
      type: 'PERIODIC',
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      distanceM,
    },
  });
}

/* ---------------------------------------------------------------- complete */

export async function completeOrder(workerId: string, orderId: string) {
  const order = await getOrderOrThrow(orderId);
  const assignment = activeAssignmentOf(order);
  if (!assignment) throw new AppError('NO_ACTIVE_ASSIGNMENT', 409);
  if (assignment.workerId !== workerId) throw new AppError('NOT_ASSIGNED_WORKER', 403);
  if (order.status !== 'IN_PROGRESS') throw new AppError('NOT_STARTED', 409);

  await transitionOrder(order.id, 'IN_PROGRESS', 'COMPLETION_PENDING');
  await prisma.assignment.update({
    where: { id: assignment.id },
    data: { completedAt: new Date() },
  });
  await prisma.checkIn.create({
    data: { orderId: order.id, workerId, type: 'COMPLETION' },
  });

  await notify({
    userId: order.buyerId,
    type: 'WORKER_COMPLETED',
    title: 'Navbatchi topshiriqni yakunladi',
    body: 'Navbatchi topshiriqni yakunlaganini bildirdi. Tasdiqlaysizmi?',
    orderId: order.id,
    deepLink: `/orders/${order.id}`,
  });

  return getOrderOrThrow(order.id);
}

/* ----------------------------------------------------------------- confirm */

export async function confirmOrder(buyerId: string, orderId: string) {
  const order = await getOrderOrThrow(orderId);
  if (order.buyerId !== buyerId) throw new AppError('FORBIDDEN', 403);
  if (order.status !== 'COMPLETION_PENDING') throw new AppError('ILLEGAL_ORDER_TRANSITION', 409);

  const assignment = activeAssignmentOf(order);
  if (!assignment) throw new AppError('NO_ACTIVE_ASSIGNMENT', 409);
  const payment = order.payment;
  if (!payment) throw new AppError('PAYMENT_NOT_FOUND', 404);
  if (payment.status !== 'HELD') throw new AppError('PAYMENT_NOT_HELD', 409);

  await prisma.$transaction(async (tx) => {
    assertPaymentTransition(payment.status, 'RELEASED');
    await tx.order.updateMany({
      where: { id: order.id, status: 'COMPLETION_PENDING' },
      data: { status: 'COMPLETED' },
    });
    await tx.assignment.update({
      where: { id: assignment.id },
      data: { status: 'COMPLETED' },
    });
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: 'RELEASED', releasedAt: new Date() },
    });

    // Escrowdan navbatchining haqiqiy balansiga
    await movePending(tx, assignment.workerId, -payment.workerAmount);
    await creditAvailable({
      tx,
      userId: assignment.workerId,
      type: 'TASK_INCOME',
      amount: payment.workerAmount,
      orderId: order.id,
      note: order.title,
    });

    await addTotals(tx, assignment.workerId, { earned: payment.workerAmount });
    await addTotals(tx, order.buyerId, { spent: payment.grossAmount });
    await tx.profile.update({
      where: { userId: assignment.workerId },
      data: { completedOrders: { increment: 1 } },
    });
    await tx.profile.update({
      where: { userId: order.buyerId },
      data: { completedOrders: { increment: 1 } },
    });
  });

  await notify({
    userId: assignment.workerId,
    type: 'PAYMENT_RELEASED',
    title: 'To‘lov chiqarildi',
    body: `Balansingizga ${formatUZS(payment.workerAmount)} qo‘shildi.`,
    orderId: order.id,
    deepLink: `/balance`,
  });
  await notify({
    userId: order.buyerId,
    type: 'PAYMENT_RELEASED',
    title: 'Buyurtma yakunlandi',
    body: 'Navbatchini baholashni unutmang.',
    orderId: order.id,
    deepLink: `/orders/${order.id}`,
  });

  return getOrderOrThrow(order.id);
}

/* ------------------------------------------------------------------ cancel */

export async function cancelOrder(userId: string, orderId: string, reason?: string) {
  const order = await getOrderOrThrow(orderId);
  const role = assertParticipant(order, userId);
  const assignment = activeAssignmentOf(order);

  if (role === 'BUYER') {
    if (!['DRAFT', 'PUBLISHED', 'MATCHED'].includes(order.status)) {
      throw new AppError('ILLEGAL_ORDER_TRANSITION', 409);
    }

    await prisma.$transaction(async (tx) => {
      assertOrderTransition(order.status, 'CANCELLED');
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'CANCELLED', cancelReason: reason ?? null },
      });
      if (assignment) {
        await tx.assignment.update({
          where: { id: assignment.id },
          data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason ?? null },
        });
        await movePending(tx, assignment.workerId, -order.workerAmount);
      }
      // MATCHEDdan keyingi bekor qilish buyurtmachining cancellation rate'iga yoziladi
      if (order.status === 'MATCHED') {
        await tx.profile.update({
          where: { userId: order.buyerId },
          data: { cancelledOrders: { increment: 1 } },
        });
      }
    });

    await refundPayment(order.id, reason ?? 'Buyurtmachi bekor qildi');

    if (assignment) {
      await notify({
        userId: assignment.workerId,
        type: 'ORDER_CANCELLED',
        title: 'Buyurtma bekor qilindi',
        body: `${order.title} — buyurtmachi bekor qildi.`,
        orderId: order.id,
      });
    }
    return getOrderOrThrow(order.id);
  }

  // Navbatchi voz kechdi -> buyurtma qayta e'lon qilinadi, cancellation rate oshadi
  if (!assignment) throw new AppError('NO_ACTIVE_ASSIGNMENT', 409);
  if (!['MATCHED', 'IN_PROGRESS'].includes(order.status)) {
    throw new AppError('ILLEGAL_ORDER_TRANSITION', 409);
  }

  await prisma.$transaction(async (tx) => {
    await tx.assignment.update({
      where: { id: assignment.id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason ?? null },
    });
    await movePending(tx, assignment.workerId, -order.workerAmount);
    await tx.profile.update({
      where: { userId: assignment.workerId },
      data: { cancelledOrders: { increment: 1 } },
    });
    await tx.order.update({ where: { id: order.id }, data: { status: 'PUBLISHED' } });
    if (order.payment) {
      await tx.payment.update({ where: { id: order.payment.id }, data: { receiverId: null } });
    }
  });

  await notify({
    userId: order.buyerId,
    type: 'ORDER_CANCELLED',
    title: 'Navbatchi voz kechdi',
    body: 'Buyurtmangiz qayta e’lon qilindi, yangi navbatchi qidirilmoqda.',
    orderId: order.id,
    deepLink: `/orders/${order.id}`,
  });
  void notifyMatchingWorkers(order.id);

  return getOrderOrThrow(order.id);
}

/* ------------------------------------------------------------------ refund */

export async function refundPayment(orderId: string, reason: string) {
  const order = await getOrderOrThrow(orderId);
  const payment = order.payment;
  if (!payment) return;
  if (payment.status !== 'HELD' && payment.status !== 'PAID') return;

  await prisma.$transaction(async (tx) => {
    assertPaymentTransition(payment.status, 'REFUNDED');
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: 'REFUNDED', refundedAt: new Date() },
    });
    await creditAvailable({
      tx,
      userId: order.buyerId,
      type: 'REFUND',
      amount: payment.grossAmount,
      orderId: order.id,
      note: reason,
    });
  });
}

/* --------------------------------------------- karta to'lovi -> buyurtma */

/**
 * Admin karta to'lovini tasdiqlaydi va (agar to'lov buyurtma uchun bo'lsa)
 * buyurtmani darhol e'lon qiladi. Ikkalasi bitta joyda turadi, chunki
 * foydalanuvchi uchun bu bitta amal: "to'lovim tasdiqlandi -> e'lonim chiqdi".
 */
export async function confirmIntentAndPublish(intentId: string, adminId: string) {
  const result = await confirmIntent(intentId, adminId);
  const orderId = result.intent.orderId;
  if (!orderId) return result;

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.status !== 'DRAFT') return result;

  try {
    await payAndPublishOrder(order.buyerId, order.id);
    return { ...result, publishedOrderId: order.id };
  } catch (error) {
    // Balans yetmasa (masalan foydalanuvchi kamroq yuborgan) — pul balansda qoladi,
    // buyurtma DRAFT holatida turadi. Foydalanuvchi qolganini to'ldiradi.
    console.error('[navbat] to‘lov tasdiqlandi, lekin e’lon qilinmadi:', error);
    return result;
  }
}

/* ----------------------------------------------------------------- dispute */

export async function openDispute(
  userId: string,
  orderId: string,
  reason: string,
  description?: string,
) {
  const order = await getOrderOrThrow(orderId);
  assertParticipant(order, userId);
  if (order.dispute) throw new AppError('DISPUTE_ALREADY_OPEN', 409);
  if (!['MATCHED', 'IN_PROGRESS', 'COMPLETION_PENDING'].includes(order.status)) {
    throw new AppError('DISPUTE_NOT_ALLOWED', 409);
  }

  const dispute = await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: order.id }, data: { status: 'DISPUTED' } });
    return tx.dispute.create({
      data: {
        orderId: order.id,
        openedById: userId,
        reason: reason as never,
        description: description ?? null,
        status: 'OPEN',
      },
    });
  });

  const assignment = activeAssignmentOf(order);
  const other = userId === order.buyerId ? assignment?.workerId : order.buyerId;
  if (other) {
    await notify({
      userId: other,
      type: 'DISPUTE_OPENED',
      title: 'Nizo ochildi',
      body: `${order.title} bo‘yicha nizo ochildi. Administrator ko‘rib chiqadi.`,
      orderId: order.id,
      deepLink: `/orders/${order.id}`,
    });
  }
  await notify({
    userId,
    type: 'DISPUTE_OPENED',
    title: 'Nizo qabul qilindi',
    body: 'To‘lov nizo hal bo‘lguncha saqlanib turadi.',
    orderId: order.id,
    deepLink: `/orders/${order.id}`,
  });

  return dispute;
}

/* ------------------------------------------------------------------ rating */

export async function rateOrder(
  fromUserId: string,
  orderId: string,
  stars: number,
  comment?: string,
) {
  const order = await getOrderOrThrow(orderId);
  const role = assertParticipant(order, fromUserId);
  if (order.status !== 'COMPLETED') throw new AppError('RATING_NOT_ALLOWED', 409);

  const assignment = order.assignments?.find((a) => a.status === 'COMPLETED');
  if (!assignment) throw new AppError('NO_ACTIVE_ASSIGNMENT', 409);

  const toUserId = role === 'BUYER' ? assignment.workerId : order.buyerId;

  const existing = await prisma.rating.findUnique({
    where: { orderId_fromUserId: { orderId, fromUserId } },
  });
  if (existing) throw new AppError('ALREADY_RATED', 409);

  const rating = await prisma.$transaction(async (tx) => {
    const created = await tx.rating.create({
      data: { orderId, fromUserId, toUserId, rating: stars, comment: comment ?? null },
    });
    const profile = await tx.profile.findUnique({ where: { userId: toUserId } });
    if (profile) {
      await tx.profile.update({
        where: { userId: toUserId },
        data: {
          rating: recalcRating(profile.rating, profile.ratingCount, stars),
          ratingCount: { increment: 1 },
        },
      });
    }
    return created;
  });

  await notify({
    userId: toUserId,
    type: 'RATING_RECEIVED',
    title: 'Yangi baho',
    body: `Sizga ${stars} yulduz berildi.${comment ? `\n"${comment}"` : ''}`,
    orderId: order.id,
  });

  return rating;
}

/* ----------------------------------------------------------------- expiry */

/**
 * Sanasi o'tib ketgan, hali qabul qilinmagan buyurtmalarni EXPIRED qiladi
 * va pulni buyurtmachiga qaytaradi.
 */
export async function expireStaleOrders(): Promise<number> {
  const cutoff = fromDateString(todayString());
  const stale = await prisma.order.findMany({
    where: { status: 'PUBLISHED', date: { lt: cutoff } },
    select: { id: true, buyerId: true, title: true },
  });

  for (const order of stale) {
    await prisma.order.updateMany({
      where: { id: order.id, status: 'PUBLISHED' },
      data: { status: 'EXPIRED' },
    });
    await refundPayment(order.id, 'Buyurtma muddati o‘tdi');
    await notify({
      userId: order.buyerId,
      type: 'ORDER_CANCELLED',
      title: 'Buyurtma muddati o‘tdi',
      body: `${order.title} — navbatchi topilmadi, to‘lov balansingizga qaytarildi.`,
      orderId: order.id,
    });
  }
  return stale.length;
}
