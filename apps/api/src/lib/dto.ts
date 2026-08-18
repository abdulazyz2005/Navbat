import type {
  Assignment,
  Dispute,
  Message,
  Order,
  Payment,
  Profile,
  Rating,
  Transaction,
  User,
  Withdrawal,
  Notification as NotificationRow,
  Availability,
  CheckIn,
} from '@prisma/client';
import {
  successRate,
  type AvailabilityDTO,
  type CheckInDTO,
  type DisputeDTO,
  type MessageDTO,
  type NotificationDTO,
  type OrderDTO,
  type PublicUser,
  type RatingDTO,
  type TransactionDTO,
  type WithdrawalDTO,
} from '@navbat/shared';

export type UserWithProfile = User & { profile: Profile | null };

/** @db.Date -> "YYYY-MM-DD" (UTC yarim tunda saqlanadi) */
export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" -> Date (UTC yarim tun) */
export function fromDateString(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function mapPublicUser(user: UserWithProfile): PublicUser {
  const p = user.profile;
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    photoUrl: user.photoUrl,
    rating: p?.rating ?? 0,
    ratingCount: p?.ratingCount ?? 0,
    completedOrders: p?.completedOrders ?? 0,
    cancelledOrders: p?.cancelledOrders ?? 0,
    successRate: successRate(p?.completedOrders ?? 0, p?.cancelledOrders ?? 0),
  };
}

export type OrderWithRelations = Order & {
  buyer: UserWithProfile;
  assignments?: (Assignment & { worker: UserWithProfile })[];
  payment?: Payment | null;
  dispute?: Dispute | null;
  ratings?: Rating[];
};

export interface MapOrderExtras {
  viewerId?: string;
  matchScore?: number;
  distanceKm?: number;
}

export function mapOrder(order: OrderWithRelations, extras: MapOrderExtras = {}): OrderDTO {
  const activeAssignment =
    order.assignments?.find((a) => a.status === 'ACTIVE' || a.status === 'COMPLETED') ?? null;

  const myRole =
    extras.viewerId === undefined
      ? null
      : order.buyerId === extras.viewerId
        ? 'BUYER'
        : activeAssignment?.workerId === extras.viewerId
          ? 'WORKER'
          : null;

  return {
    id: order.id,
    buyerId: order.buyerId,
    buyer: mapPublicUser(order.buyer),
    category: order.category,
    categoryOther: order.categoryOther,
    title: order.title,
    description: order.description,
    locationName: order.locationName,
    address: order.address,
    latitude: order.latitude,
    longitude: order.longitude,
    date: toDateString(order.date),
    startTime: order.startTime,
    endTime: order.endTime,
    offeredAmount: order.offeredAmount,
    platformFee: order.platformFee,
    totalAmount: order.totalAmount,
    status: order.status,
    priceRaises: order.priceRaises,
    createdAt: order.createdAt.toISOString(),
    publishedAt: order.publishedAt?.toISOString() ?? null,
    worker: activeAssignment ? mapPublicUser(activeAssignment.worker) : null,
    assignment: activeAssignment
      ? {
          id: activeAssignment.id,
          startedAt: activeAssignment.startedAt?.toISOString() ?? null,
          completedAt: activeAssignment.completedAt?.toISOString() ?? null,
          matchScore: activeAssignment.matchScore,
        }
      : null,
    payment: order.payment
      ? {
          id: order.payment.id,
          status: order.payment.status,
          grossAmount: order.payment.grossAmount,
          platformFee: order.payment.platformFee,
          workerAmount: order.payment.workerAmount,
        }
      : null,
    dispute: order.dispute
      ? { id: order.dispute.id, status: order.dispute.status, reason: order.dispute.reason }
      : null,
    matchScore: extras.matchScore,
    distanceKm: extras.distanceKm,
    myRole,
    hasRated: extras.viewerId
      ? (order.ratings ?? []).some((r) => r.fromUserId === extras.viewerId)
      : undefined,
  };
}

export function mapAvailability(row: Availability, matchingOrders?: number): AvailabilityDTO {
  return {
    id: row.id,
    date: toDateString(row.date),
    startTime: row.startTime,
    endTime: row.endTime,
    locationName: row.locationName,
    latitude: row.latitude,
    longitude: row.longitude,
    radiusKm: row.radiusKm,
    minimumAmount: row.minimumAmount,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    matchingOrders,
  };
}

export function mapMessage(row: Message & { sender: User }, viewerId: string): MessageDTO {
  return {
    id: row.id,
    orderId: row.orderId,
    senderId: row.senderId,
    sender: { firstName: row.sender.firstName, photoUrl: row.sender.photoUrl },
    body: row.body,
    type: row.type,
    latitude: row.latitude,
    longitude: row.longitude,
    createdAt: row.createdAt.toISOString(),
    mine: row.senderId === viewerId,
  };
}

export function mapTransaction(row: Transaction): TransactionDTO {
  return {
    id: row.id,
    type: row.type,
    amount: row.amount,
    balanceAfter: row.balanceAfter,
    note: row.note,
    orderId: row.orderId,
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapWithdrawal(row: Withdrawal): WithdrawalDTO {
  return {
    id: row.id,
    amount: row.amount,
    method: row.method,
    account: row.account,
    status: row.status,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapRating(row: Rating & { fromUser: User }): RatingDTO {
  return {
    id: row.id,
    orderId: row.orderId,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.createdAt.toISOString(),
    fromUser: { firstName: row.fromUser.firstName, photoUrl: row.fromUser.photoUrl },
  };
}

export function mapDispute(
  row: Dispute & { openedBy: UserWithProfile; order?: OrderWithRelations },
): DisputeDTO {
  return {
    id: row.id,
    orderId: row.orderId,
    order: row.order ? mapOrder(row.order) : undefined,
    openedBy: mapPublicUser(row.openedBy),
    reason: row.reason,
    description: row.description,
    status: row.status,
    resolution: row.resolution,
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapNotification(row: NotificationRow): NotificationDTO {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    orderId: row.orderId,
    read: row.read,
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapCheckIn(row: CheckIn): CheckInDTO {
  return {
    id: row.id,
    type: row.type,
    latitude: row.latitude,
    longitude: row.longitude,
    distanceM: row.distanceM,
    createdAt: row.createdAt.toISOString(),
  };
}

export const orderInclude = {
  buyer: { include: { profile: true } },
  assignments: { include: { worker: { include: { profile: true } } } },
  payment: true,
  dispute: true,
  ratings: true,
} as const;
