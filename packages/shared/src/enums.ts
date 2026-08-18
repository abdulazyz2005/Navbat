/**
 * Prisma enumlari bilan bir xil string qiymatlar.
 * Frontend Prisma clientga bog'lanmasligi uchun shu yerda takrorlanadi.
 */

export const RoleMode = {
  BUYER: 'BUYER',
  WORKER: 'WORKER',
  BOTH: 'BOTH',
} as const;
export type RoleMode = (typeof RoleMode)[keyof typeof RoleMode];

export const OrderCategory = {
  DOCTOR: 'DOCTOR',
  GOVERNMENT: 'GOVERNMENT',
  DOCUMENTS: 'DOCUMENTS',
  BANK: 'BANK',
  CONSULATE: 'CONSULATE',
  SHOP: 'SHOP',
  EVENT: 'EVENT',
  OTHER: 'OTHER',
} as const;
export type OrderCategory = (typeof OrderCategory)[keyof typeof OrderCategory];

export const ORDER_CATEGORY_LABELS: Record<OrderCategory, string> = {
  DOCTOR: 'Shifokor',
  GOVERNMENT: 'Davlat muassasasi',
  DOCUMENTS: 'Hujjat topshirish',
  BANK: 'Bank',
  CONSULATE: 'Konsullik',
  SHOP: "Do'kon",
  EVENT: 'Tadbir',
  OTHER: 'Boshqa',
};

export const ORDER_CATEGORY_ICONS: Record<OrderCategory, string> = {
  DOCTOR: '🏥',
  GOVERNMENT: '🏛',
  DOCUMENTS: '📄',
  BANK: '🏦',
  CONSULATE: '🛂',
  SHOP: '🛒',
  EVENT: '🎫',
  OTHER: '📌',
};

export const OrderStatus = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  MATCHED: 'MATCHED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETION_PENDING: 'COMPLETION_PENDING',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  DISPUTED: 'DISPUTED',
  REFUNDED: 'REFUNDED',
  EXPIRED: 'EXPIRED',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  DRAFT: 'Qoralama',
  PUBLISHED: 'Navbatchi kutilmoqda',
  MATCHED: 'Navbatchi topildi',
  IN_PROGRESS: 'Navbatda',
  COMPLETION_PENDING: 'Tasdiqlash kutilmoqda',
  COMPLETED: 'Tugallandi',
  CANCELLED: 'Bekor qilindi',
  DISPUTED: 'Nizo',
  REFUNDED: 'Qaytarildi',
  EXPIRED: 'Muddati o‘tgan',
};

export const PaymentStatus = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  HELD: 'HELD',
  RELEASED: 'RELEASED',
  REFUNDED: 'REFUNDED',
  FAILED: 'FAILED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: 'Kutilmoqda',
  PAID: "To'landi",
  HELD: 'Saqlanmoqda',
  RELEASED: 'Chiqarildi',
  REFUNDED: 'Qaytarildi',
  FAILED: 'Xatolik',
};

export const DisputeReason = {
  WORKER_NO_SHOW: 'WORKER_NO_SHOW',
  WORKER_LATE: 'WORKER_LATE',
  TASK_NOT_DONE: 'TASK_NOT_DONE',
  WRONG_PLACE: 'WRONG_PLACE',
  OTHER: 'OTHER',
} as const;
export type DisputeReason = (typeof DisputeReason)[keyof typeof DisputeReason];

export const DISPUTE_REASON_LABELS: Record<DisputeReason, string> = {
  WORKER_NO_SHOW: 'Navbatchi kelmadi',
  WORKER_LATE: 'Vaqtida kelmadi',
  TASK_NOT_DONE: 'Topshiriq bajarilmadi',
  WRONG_PLACE: "Noto'g'ri joy",
  OTHER: 'Boshqa',
};

export const DisputeStatus = {
  OPEN: 'OPEN',
  UNDER_REVIEW: 'UNDER_REVIEW',
  RESOLVED_BUYER: 'RESOLVED_BUYER',
  RESOLVED_WORKER: 'RESOLVED_WORKER',
  REJECTED: 'REJECTED',
} as const;
export type DisputeStatus = (typeof DisputeStatus)[keyof typeof DisputeStatus];

export const WithdrawalStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  REJECTED: 'REJECTED',
} as const;
export type WithdrawalStatus = (typeof WithdrawalStatus)[keyof typeof WithdrawalStatus];

export const WithdrawalMethod = {
  CARD: 'CARD',
  CLICK: 'CLICK',
  PAYME: 'PAYME',
  CASH: 'CASH',
} as const;
export type WithdrawalMethod = (typeof WithdrawalMethod)[keyof typeof WithdrawalMethod];

export const WITHDRAWAL_METHOD_LABELS: Record<WithdrawalMethod, string> = {
  CARD: 'Plastik karta',
  CLICK: 'Click',
  PAYME: 'Payme',
  CASH: 'Naqd',
};

export const TransactionType = {
  TASK_INCOME: 'TASK_INCOME',
  PLATFORM_FEE: 'PLATFORM_FEE',
  REFUND: 'REFUND',
  WITHDRAWAL: 'WITHDRAWAL',
  ORDER_PAYMENT: 'ORDER_PAYMENT',
  TOP_UP: 'TOP_UP',
} as const;
export type TransactionType = (typeof TransactionType)[keyof typeof TransactionType];

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  TASK_INCOME: 'Topshiriq daromadi',
  PLATFORM_FEE: 'Platforma komissiyasi',
  REFUND: 'Qaytarilgan mablag‘',
  WITHDRAWAL: 'Pul yechish',
  ORDER_PAYMENT: 'Buyurtma to‘lovi',
  TOP_UP: 'Balansni to‘ldirish',
};

export const MessageType = {
  TEXT: 'TEXT',
  PHOTO: 'PHOTO',
  LOCATION: 'LOCATION',
  SYSTEM: 'SYSTEM',
} as const;
export type MessageType = (typeof MessageType)[keyof typeof MessageType];

export const CheckInType = {
  ARRIVAL: 'ARRIVAL',
  PERIODIC: 'PERIODIC',
  COMPLETION: 'COMPLETION',
} as const;
export type CheckInType = (typeof CheckInType)[keyof typeof CheckInType];

export const NotificationType = {
  ORDER_CREATED: 'ORDER_CREATED',
  WORKER_FOUND: 'WORKER_FOUND',
  WORKER_STARTED: 'WORKER_STARTED',
  WORKER_COMPLETED: 'WORKER_COMPLETED',
  PAYMENT_RELEASED: 'PAYMENT_RELEASED',
  DISPUTE_OPENED: 'DISPUTE_OPENED',
  DISPUTE_RESOLVED: 'DISPUTE_RESOLVED',
  NEW_MATCHING_ORDER: 'NEW_MATCHING_ORDER',
  ORDER_ACCEPTED: 'ORDER_ACCEPTED',
  ORDER_CANCELLED: 'ORDER_CANCELLED',
  CHECKIN_REMINDER: 'CHECKIN_REMINDER',
  RATING_RECEIVED: 'RATING_RECEIVED',
  WITHDRAWAL_UPDATE: 'WITHDRAWAL_UPDATE',
  NEW_MESSAGE: 'NEW_MESSAGE',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];
