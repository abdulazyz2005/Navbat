import { errorMessage } from '@navbat/shared';
import type {
  AdminStats,
  AvailabilityDTO,
  BalanceDTO,
  CheckInDTO,
  CreateAvailabilityInput,
  CreateOrderInput,
  DisputeDTO,
  MeResponse,
  MessageDTO,
  NotificationDTO,
  OrderDTO,
  Paginated,
  RatingDTO,
  TransactionDTO,
  WithdrawalDTO,
} from '@navbat/shared';
import { getInitData } from './telegram';

/**
 * API bazaviy manzili.
 *
 * Bitta servis rejimida (production) frontend va API bir originda turadi —
 * shuning uchun `VITE_API_URL` bo'sh qoldiriladi va so'rovlar `/api/...` ga ketadi.
 * Alohida hostingda `VITE_API_URL=https://api.example.com` ko'rsatiladi.
 */
const API_BASE = `${(import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')}/api`;
const TOKEN_KEY = 'navbat.token';

let token: string | null = null;

export function getToken(): string | null {
  if (token) return token;
  try {
    token = sessionStorage.getItem(TOKEN_KEY);
  } catch {
    token = null;
  }
  return token;
}

export function setToken(value: string | null): void {
  token = value;
  try {
    if (value) sessionStorage.setItem(TOKEN_KEY, value);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* sessionStorage mavjud bo'lmasa xotirada saqlanadi */
  }
}

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function call<T>(
  path: string,
  options: { method?: string; body?: unknown; retry?: boolean } = {},
): Promise<T> {
  const { method = 'GET', body, retry = true } = options;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const current = getToken();
  if (current) headers.Authorization = `Bearer ${current}`;

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 401 && retry && path !== '/auth/telegram') {
    // Sessiya tugagan — qayta login qilib ko'ramiz
    setToken(null);
    await authenticate();
    return call<T>(path, { ...options, retry: false });
  }

  if (!response.ok) {
    let code = 'INTERNAL_ERROR';
    let details: unknown;
    try {
      const payload = (await response.json()) as {
        error?: { code?: string; message?: string; details?: unknown };
      };
      code = payload.error?.code ?? code;
      details = payload.error?.details;
    } catch {
      /* JSON bo'lmasa standart xabar */
    }
    throw new ApiError(code, errorMessage(code), response.status, details);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function authenticate(): Promise<void> {
  const initData = getInitData();
  if (!initData) {
    throw new ApiError(
      'INVALID_INIT_DATA',
      errorMessage('INVALID_INIT_DATA'),
      401,
    );
  }
  const result = await call<{ token: string }>('/auth/telegram', {
    method: 'POST',
    body: { initData },
    retry: false,
  });
  setToken(result.token);
}

export const api = {
  config: () =>
    call<{
      platformFeePercent: number;
      minOrderAmount: number;
      minWithdrawalAmount: number;
      paymentProvider: string;
    }>('/config'),

  me: () => call<MeResponse>('/users/me'),
  updateMe: (data: Partial<{ roleMode: string; onboarded: boolean; city: string; phone: string }>) =>
    call<{ ok: boolean }>('/users/me', { method: 'PATCH', body: data }),
  userRatings: (userId: string) => call<{ items: RatingDTO[] }>(`/users/${userId}/ratings`),

  // ------------------------------------------------------------- orders
  createOrder: (data: CreateOrderInput) => call<OrderDTO>('/orders', { method: 'POST', body: data }),
  payOrder: (id: string) => call<OrderDTO>(`/orders/${id}/pay`, { method: 'POST', body: {} }),
  myOrders: (role: 'buyer' | 'worker', status: 'ALL' | 'ACTIVE' | 'COMPLETED' = 'ALL') =>
    call<{ items: OrderDTO[] }>(`/orders?role=${role}&status=${status}`),
  order: (id: string) => call<OrderDTO>(`/orders/${id}`),
  feed: (query: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') params.set(key, String(value));
    }
    return call<Paginated<OrderDTO>>(`/orders/feed?${params.toString()}`);
  },
  acceptOrder: (id: string) => call<OrderDTO>(`/orders/${id}/accept`, { method: 'POST', body: {} }),
  startOrder: (id: string, location?: { latitude: number; longitude: number }) =>
    call<OrderDTO>(`/orders/${id}/start`, { method: 'POST', body: { location } }),
  checkIn: (id: string, location?: { latitude: number; longitude: number }) =>
    call<CheckInDTO>(`/orders/${id}/checkin`, { method: 'POST', body: { location } }),
  checkIns: (id: string) => call<{ items: CheckInDTO[] }>(`/orders/${id}/checkins`),
  completeOrder: (id: string) =>
    call<OrderDTO>(`/orders/${id}/complete`, { method: 'POST', body: {} }),
  confirmOrder: (id: string) =>
    call<OrderDTO>(`/orders/${id}/confirm`, { method: 'POST', body: {} }),
  cancelOrder: (id: string, reason?: string) =>
    call<OrderDTO>(`/orders/${id}/cancel`, { method: 'POST', body: { reason } }),
  raisePrice: (id: string, amount: number) =>
    call<OrderDTO>(`/orders/${id}/raise-price`, { method: 'POST', body: { amount } }),
  openDispute: (id: string, reason: string, description?: string) =>
    call<{ id: string }>(`/orders/${id}/dispute`, { method: 'POST', body: { reason, description } }),
  rateOrder: (id: string, rating: number, comment?: string) =>
    call<{ id: string }>(`/orders/${id}/rate`, { method: 'POST', body: { rating, comment } }),

  // --------------------------------------------------------------- chat
  messages: (orderId: string) => call<{ items: MessageDTO[] }>(`/orders/${orderId}/messages`),
  sendMessage: (orderId: string, body: string) =>
    call<MessageDTO>(`/orders/${orderId}/messages`, { method: 'POST', body: { body } }),

  // ------------------------------------------------------- availability
  availability: () => call<{ items: AvailabilityDTO[] }>('/availability'),
  createAvailability: (data: CreateAvailabilityInput) =>
    call<AvailabilityDTO>('/availability', { method: 'POST', body: data }),
  deleteAvailability: (id: string) =>
    call<{ ok: boolean }>(`/availability/${id}`, { method: 'DELETE' }),

  // ------------------------------------------------------------ balance
  balance: () => call<BalanceDTO>('/balance'),
  transactions: (page = 1) =>
    call<Paginated<TransactionDTO>>(`/balance/transactions?page=${page}&limit=30`),
  withdrawals: () => call<{ items: WithdrawalDTO[] }>('/withdrawals'),
  createWithdrawal: (data: { amount: number; method: string; account: string }) =>
    call<WithdrawalDTO>('/withdrawals', { method: 'POST', body: data }),
  cancelWithdrawal: (id: string) =>
    call<{ ok: boolean }>(`/withdrawals/${id}/cancel`, { method: 'POST', body: {} }),

  // ------------------------------------------------------ notifications
  notifications: () => call<{ items: NotificationDTO[] }>('/notifications'),
  markNotificationsRead: () =>
    call<{ ok: boolean }>('/notifications/read', { method: 'POST', body: {} }),

  // ----------------------------------------------------------- disputes
  disputes: () => call<{ items: DisputeDTO[] }>('/disputes'),

  // -------------------------------------------------------------- admin
  admin: {
    stats: () => call<AdminStats>('/admin/stats'),
    users: (q = '') => call<{ items: AdminUserRow[] }>(`/admin/users?q=${encodeURIComponent(q)}`),
    banUser: (id: string, banned: boolean, reason?: string) =>
      call<{ ok: boolean }>(`/admin/users/${id}/ban`, { method: 'POST', body: { banned, reason } }),
    orders: (status = 'ALL') => call<{ items: OrderDTO[] }>(`/admin/orders?status=${status}`),
    payments: (status = 'ALL') =>
      call<{ items: AdminPaymentRow[] }>(`/admin/payments?status=${status}`),
    disputes: (status = 'ALL') => call<{ items: DisputeDTO[] }>(`/admin/disputes?status=${status}`),
    resolveDispute: (id: string, winner: 'BUYER' | 'WORKER', resolution: string) =>
      call<OrderDTO>(`/admin/disputes/${id}/resolve`, {
        method: 'POST',
        body: { winner, resolution },
      }),
    withdrawals: (status = 'ALL') =>
      call<{ items: AdminWithdrawalRow[] }>(`/admin/withdrawals?status=${status}`),
    decideWithdrawal: (id: string, decision: string, note?: string) =>
      call<{ ok: boolean }>(`/admin/withdrawals/${id}/decide`, {
        method: 'POST',
        body: { decision, note },
      }),
  },
};

export interface AdminUserRow {
  id: string;
  telegramId: string;
  firstName: string;
  lastName: string | null;
  username: string | null;
  isAdmin: boolean;
  isBanned: boolean;
  roleMode: string;
  rating: number;
  completedOrders: number;
  cancelledOrders: number;
  successRate: number;
  availableBalance: number;
  pendingBalance: number;
  totalEarned: number;
  totalSpent: number;
  buyerOrders: number;
  workerOrders: number;
  createdAt: string;
}

export interface AdminPaymentRow {
  id: string;
  orderId: string;
  orderTitle: string;
  payer: string;
  receiver: string | null;
  grossAmount: number;
  platformFee: number;
  workerAmount: number;
  status: string;
  provider: string;
  transactionId: string | null;
  createdAt: string;
  releasedAt: string | null;
}

export interface AdminWithdrawalRow extends WithdrawalDTO {
  worker: { id: string; firstName: string };
}
