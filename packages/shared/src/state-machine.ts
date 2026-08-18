import { OrderStatus, PaymentStatus } from './enums.js';

/**
 * Order state machine.
 *
 * DRAFT -> PUBLISHED -> MATCHED -> IN_PROGRESS -> COMPLETION_PENDING -> COMPLETED
 * Error states: CANCELLED, DISPUTED, REFUNDED, EXPIRED
 *
 * Backend hech qachon ruxsat etilmagan o'tishga yo'l qo'ymaydi.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  DRAFT: ['PUBLISHED', 'CANCELLED'],
  PUBLISHED: ['MATCHED', 'CANCELLED', 'EXPIRED'],
  MATCHED: ['IN_PROGRESS', 'PUBLISHED', 'CANCELLED', 'DISPUTED'],
  IN_PROGRESS: ['COMPLETION_PENDING', 'DISPUTED', 'CANCELLED'],
  COMPLETION_PENDING: ['COMPLETED', 'DISPUTED'],
  COMPLETED: [],
  CANCELLED: ['REFUNDED'],
  DISPUTED: ['COMPLETED', 'REFUNDED', 'CANCELLED'],
  REFUNDED: [],
  EXPIRED: ['REFUNDED'],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransitionOrder(from, to)) {
    throw new Error(`ILLEGAL_ORDER_TRANSITION: ${from} -> ${to}`);
  }
}

/**
 * Payment state machine.
 * PENDING -> PAID -> HELD -> RELEASED
 * HELD -> REFUNDED (dispute/cancel)
 */
export const PAYMENT_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  PENDING: ['PAID', 'FAILED'],
  PAID: ['HELD', 'REFUNDED', 'FAILED'],
  HELD: ['RELEASED', 'REFUNDED'],
  RELEASED: [],
  REFUNDED: [],
  FAILED: ['PENDING'],
};

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return PAYMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertPaymentTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (!canTransitionPayment(from, to)) {
    throw new Error(`ILLEGAL_PAYMENT_TRANSITION: ${from} -> ${to}`);
  }
}

/** Buyurtmachi qaysi statuslarda bekor qila oladi (jarimasiz) */
export const BUYER_FREE_CANCEL_STATUSES: readonly OrderStatus[] = ['DRAFT', 'PUBLISHED'];

/** Buyurtma faol hisoblanadigan statuslar */
export const ACTIVE_ORDER_STATUSES: readonly OrderStatus[] = [
  'PUBLISHED',
  'MATCHED',
  'IN_PROGRESS',
  'COMPLETION_PENDING',
  'DISPUTED',
];
