import { AppError, assertPaymentTransition, formatUZS } from '@navbat/shared';
import { prisma } from '../lib/prisma.js';
import { getPaymentProvider } from '../payments/index.js';
import { addTotals, creditAvailable, movePending } from './ledger.js';
import { notify } from './notifications.js';
import { getOrderOrThrow } from './orders.js';

/**
 * Admin nizoni hal qiladi.
 * - 'WORKER' foydasiga: pul navbatchiga chiqariladi, buyurtma COMPLETED.
 * - 'BUYER' foydasiga: pul buyurtmachiga qaytariladi, buyurtma REFUNDED,
 *   navbatchining cancellation rate'i oshadi.
 */
export async function resolveDispute(
  disputeId: string,
  winner: 'BUYER' | 'WORKER',
  resolution: string,
) {
  const dispute = await prisma.dispute.findUnique({ where: { id: disputeId } });
  if (!dispute) throw new AppError('NOT_FOUND', 404);
  if (dispute.status !== 'OPEN' && dispute.status !== 'UNDER_REVIEW') {
    throw new AppError('FORBIDDEN', 409);
  }

  const order = await getOrderOrThrow(dispute.orderId);
  const payment = order.payment;
  if (!payment) throw new AppError('PAYMENT_NOT_FOUND', 404);
  const assignment = order.assignments?.find((a) => a.status === 'ACTIVE');

  if (winner === 'WORKER') {
    if (!assignment) throw new AppError('NO_ACTIVE_ASSIGNMENT', 409);
    const transfer = await getPaymentProvider().release({
      paymentId: payment.id,
      transactionId: payment.transactionId ?? '',
      receiverId: assignment.workerId,
      amount: payment.workerAmount,
    });
    if (!transfer.success) throw new AppError('INTERNAL_ERROR', 502);

    await prisma.$transaction(async (tx) => {
      assertPaymentTransition(payment.status, 'RELEASED');
      await tx.order.update({ where: { id: order.id }, data: { status: 'COMPLETED' } });
      await tx.assignment.update({
        where: { id: assignment.id },
        data: { status: 'COMPLETED', completedAt: assignment.completedAt ?? new Date() },
      });
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'RELEASED', releasedAt: new Date() },
      });
      await movePending(tx, assignment.workerId, -payment.workerAmount);
      await creditAvailable({
        tx,
        userId: assignment.workerId,
        type: 'TASK_INCOME',
        amount: payment.workerAmount,
        orderId: order.id,
        note: `${order.title} (nizo hal qilindi)`,
      });
      await addTotals(tx, assignment.workerId, { earned: payment.workerAmount });
      await addTotals(tx, order.buyerId, { spent: payment.grossAmount });
      await tx.profile.update({
        where: { userId: assignment.workerId },
        data: { completedOrders: { increment: 1 } },
      });
      await tx.dispute.update({
        where: { id: dispute.id },
        data: { status: 'RESOLVED_WORKER', resolution, resolvedAt: new Date() },
      });
    });
  } else {
    const refund = await getPaymentProvider().refund({
      paymentId: payment.id,
      transactionId: payment.transactionId ?? '',
      amount: payment.grossAmount,
      reason: resolution,
    });
    if (!refund.success) throw new AppError('INTERNAL_ERROR', 502);

    await prisma.$transaction(async (tx) => {
      assertPaymentTransition(payment.status, 'REFUNDED');
      await tx.order.update({ where: { id: order.id }, data: { status: 'REFUNDED' } });
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'REFUNDED', refundedAt: new Date() },
      });
      if (assignment) {
        await tx.assignment.update({
          where: { id: assignment.id },
          data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: resolution },
        });
        await movePending(tx, assignment.workerId, -payment.workerAmount);
        await tx.profile.update({
          where: { userId: assignment.workerId },
          data: { cancelledOrders: { increment: 1 } },
        });
      }
      await creditAvailable({
        tx,
        userId: order.buyerId,
        type: 'REFUND',
        amount: payment.grossAmount,
        orderId: order.id,
        note: `${order.title} (nizo hal qilindi)`,
      });
      await tx.dispute.update({
        where: { id: dispute.id },
        data: { status: 'RESOLVED_BUYER', resolution, resolvedAt: new Date() },
      });
    });
  }

  const recipients = [order.buyerId, assignment?.workerId].filter(Boolean) as string[];
  for (const userId of recipients) {
    await notify({
      userId,
      type: 'DISPUTE_RESOLVED',
      title: 'Nizo hal qilindi',
      body:
        winner === 'WORKER'
          ? `To‘lov navbatchiga chiqarildi (${formatUZS(payment.workerAmount)}).`
          : `To‘lov buyurtmachiga qaytarildi (${formatUZS(payment.grossAmount)}).`,
      orderId: order.id,
      deepLink: `/orders/${order.id}`,
    });
  }

  return getOrderOrThrow(order.id);
}
