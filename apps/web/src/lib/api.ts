import { errorMessage } from '@navbat/shared';
import type {
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
  PaymentIntentDTO,
  RatingDTO,
  TransactionDTO,
  WithdrawalDTO,
} from '@navbat/shared';
import { ApiError, createClient, createTokenStore } from './http';
import { getInitData } from './telegram';

/**
 * MINI APP API MIJOZI (faqat foydalanuvchi imkoniyatlari).
 *
 * Admin endpointlari BU YERDA YO'Q — ular alohida ilovada (`src/admin`).
 * Mini App tokeni serverda `scope='app'` bilan beriladi va admin
 * endpointlariga umuman o'tmaydi.
 */

const tokens = createTokenStore('navbat.token', 'session');
const client = createClient(tokens);

export { ApiError };
export const getToken = () => tokens.get();
export const setToken = (value: string | null) => tokens.set(value);

async function reauth(): Promise<boolean> {
  try {
    await authenticate();
    return true;
  } catch {
    return false;
  }
}

function call<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  return client.call<T>(path, { ...options, onUnauthorized: reauth });
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
  const result = await client.call<{ token: string }>('/auth/telegram', {
    method: 'POST',
    body: { initData },
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
  updateMe: (
    data: Partial<{
      roleMode: string;
      onboarded: boolean;
      city: string;
      phone: string;
      cardNumber: string;
      cardHolder: string;
    }>,
  ) =>
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

  // ------------------------------------------------- karta orqali to'lash
  createIntent: (amount: number, orderId?: string) =>
    call<PaymentIntentDTO>('/payments/intents', { method: 'POST', body: { amount, orderId } }),
  activeIntent: () => call<PaymentIntentDTO | null>('/payments/intents/active'),
  intent: (id: string) => call<PaymentIntentDTO>(`/payments/intents/${id}`),
  myIntents: () => call<{ items: PaymentIntentDTO[] }>('/payments/intents'),
  uploadReceipt: (id: string, image: string) =>
    call<PaymentIntentDTO>(`/payments/intents/${id}/receipt`, { method: 'POST', body: { image } }),

  // ------------------------------------------------------ notifications
  notifications: () => call<{ items: NotificationDTO[] }>('/notifications'),
  markNotificationsRead: () =>
    call<{ ok: boolean }>('/notifications/read', { method: 'POST', body: {} }),

  // ----------------------------------------------------------- disputes
  disputes: () => call<{ items: DisputeDTO[] }>('/disputes'),

};
