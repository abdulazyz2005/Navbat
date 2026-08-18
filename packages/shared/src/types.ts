import type {
  CheckInType,
  DisputeReason,
  DisputeStatus,
  MessageType,
  NotificationType,
  OrderCategory,
  OrderStatus,
  PaymentStatus,
  RoleMode,
  TransactionType,
  WithdrawalMethod,
  WithdrawalStatus,
} from './enums.js';

export interface PublicUser {
  id: string;
  firstName: string;
  lastName: string | null;
  username: string | null;
  photoUrl: string | null;
  rating: number; // integer 0..500
  ratingCount: number;
  completedOrders: number;
  cancelledOrders: number;
  successRate: number; // 0..100
}

export interface MeResponse {
  id: string;
  telegramId: string;
  firstName: string;
  lastName: string | null;
  username: string | null;
  photoUrl: string | null;
  isAdmin: boolean;
  profile: {
    roleMode: RoleMode;
    onboarded: boolean;
    rating: number;
    ratingCount: number;
    completedOrders: number;
    cancelledOrders: number;
    successRate: number;
    totalSpent: number;
    totalEarned: number;
    availableBalance: number;
    pendingBalance: number;
    city: string | null;
    phone: string | null;
  };
  unreadNotifications: number;
}

export interface OrderDTO {
  id: string;
  buyerId: string;
  buyer: PublicUser;
  category: OrderCategory;
  categoryOther: string | null;
  title: string;
  description: string | null;
  locationName: string;
  address: string;
  latitude: number;
  longitude: number;
  date: string; // YYYY-MM-DD
  startTime: string;
  endTime: string;
  offeredAmount: number;
  platformFee: number;
  totalAmount: number;
  status: OrderStatus;
  priceRaises: number;
  createdAt: string;
  publishedAt: string | null;
  worker: PublicUser | null;
  assignment: {
    id: string;
    startedAt: string | null;
    completedAt: string | null;
    matchScore: number;
  } | null;
  payment: {
    id: string;
    status: PaymentStatus;
    grossAmount: number;
    platformFee: number;
    workerAmount: number;
  } | null;
  matchScore?: number;
  distanceKm?: number;
  myRole?: 'BUYER' | 'WORKER' | null;
  hasRated?: boolean;
  dispute?: { id: string; status: DisputeStatus; reason: DisputeReason } | null;
}

export interface CreateOrderInput {
  category: OrderCategory;
  categoryOther?: string;
  title: string;
  description?: string;
  locationName: string;
  address: string;
  latitude: number;
  longitude: number;
  date: string;
  startTime: string;
  endTime: string;
  offeredAmount: number;
}

export interface AvailabilityDTO {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  locationName: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
  minimumAmount: number;
  active: boolean;
  createdAt: string;
  matchingOrders?: number;
}

export interface CreateAvailabilityInput {
  date: string;
  startTime: string;
  endTime: string;
  locationName: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
  minimumAmount: number;
}

export interface MessageDTO {
  id: string;
  orderId: string;
  senderId: string;
  sender: { firstName: string; photoUrl: string | null };
  body: string;
  type: MessageType;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
  mine: boolean;
}

export interface TransactionDTO {
  id: string;
  type: TransactionType;
  amount: number;
  balanceAfter: number;
  note: string | null;
  orderId: string | null;
  createdAt: string;
}

export interface BalanceDTO {
  availableBalance: number;
  pendingBalance: number;
  totalEarned: number;
  totalSpent: number;
}

export interface WithdrawalDTO {
  id: string;
  amount: number;
  method: WithdrawalMethod;
  account: string;
  status: WithdrawalStatus;
  note: string | null;
  createdAt: string;
}

export interface RatingDTO {
  id: string;
  orderId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  fromUser: { firstName: string; photoUrl: string | null };
}

export interface DisputeDTO {
  id: string;
  orderId: string;
  order?: OrderDTO;
  openedBy: PublicUser;
  reason: DisputeReason;
  description: string | null;
  status: DisputeStatus;
  resolution: string | null;
  createdAt: string;
}

export interface NotificationDTO {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  orderId: string | null;
  read: boolean;
  createdAt: string;
}

export interface CheckInDTO {
  id: string;
  type: CheckInType;
  latitude: number | null;
  longitude: number | null;
  distanceM: number | null;
  createdAt: string;
}

export interface FeedQuery {
  category?: OrderCategory;
  date?: string;
  minAmount?: number;
  maxDistanceKm?: number;
  sort?: 'nearest' | 'highest_pay' | 'newest' | 'best_match';
  page?: number;
  limit?: number;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  ordersToday: number;
  ordersThisWeek: number;
  completedOrders: number;
  cancelledOrders: number;
  cancellationRate: number;
  averageOrderValue: number;
  gmv: number;
  platformRevenue: number;
  pendingPayments: number;
  heldPayments: number;
  refundedPayments: number;
  averageCompletionMinutes: number;
  averageWorkerRating: number;
  openDisputes: number;
  pendingWithdrawals: number;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
