import type {
  AdminStats,
  DisputeDTO,
  OrderDTO,
  PaymentIntentDTO,
  WithdrawalDTO,
} from '@navbat/shared';
import { ApiError, createClient, createTokenStore } from '../lib/http';

/**
 * ADMIN PANEL API MIJOZI.
 *
 * Mini App mijozidan butunlay ajratilgan:
 *   - o'z tokeni (localStorage, 12 soat)
 *   - token serverda `scope='admin'` bilan beriladi
 *   - 401 bo'lsa Telegram initData bilan tiklanmaydi — qaytadan kod so'raladi
 */

const tokens = createTokenStore('navbat.admin.token', 'local');
const client = createClient(tokens);

export { ApiError };
export const adminToken = tokens;

function call<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  return client.call<T>(path, options);
}

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
  worker: {
    id: string;
    firstName: string;
    username: string | null;
    telegramId: string;
    cardNumber: string | null;
    cardHolder: string | null;
    phone: string | null;
  };
}

export interface AdminIntentRow extends PaymentIntentDTO {
  user: {
    id: string;
    firstName: string;
    username: string | null;
    telegramId: string;
    phone: string | null;
  };
}

export interface PlatformCard {
  cardNumber: string;
  cardHolder: string;
  bank: string;
  formatted?: string;
}

export const adminApi = {
  /** Bot bergan bir martalik kodni 12 soatlik sessiyaga almashtiradi */
  login: (code: string) =>
    call<{
      token: string;
      expiresIn: number;
      admin: { id: string; firstName: string; username: string | null };
    }>('/admin/session', { method: 'POST', body: { code } }),

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

  // --------------------------------------------------- karta to'lovlari
  intents: (status = 'PENDING_REVIEW') =>
    call<{ items: AdminIntentRow[] }>(`/admin/intents?status=${status}`),
  confirmIntent: (id: string) =>
    call<{ ok: boolean; credited: number; publishedOrderId: string | null }>(
      `/admin/intents/${id}/confirm`,
      { method: 'POST', body: {} },
    ),
  rejectIntent: (id: string, reason: string) =>
    call<{ ok: boolean }>(`/admin/intents/${id}/reject`, { method: 'POST', body: { reason } }),
  /** Chek rasmi tokenli so'rov bilan olinadi va blob URL qaytadi */
  fetchReceipt: async (id: string): Promise<string> => {
    const response = await fetch(`${client.apiBase}/admin/intents/${id}/receipt`, {
      headers: { Authorization: `Bearer ${tokens.get() ?? ''}` },
    });
    if (!response.ok) throw new ApiError('RECEIPT_REQUIRED', 'Chek topilmadi', response.status);
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  },

  // ------------------------------------------------------- sozlamalar
  settings: () => call<{ card: PlatformCard | null }>('/admin/settings'),
  saveCard: (card: { cardNumber: string; cardHolder: string; bank?: string }) =>
    call<{ ok: boolean; card: PlatformCard }>('/admin/settings/card', {
      method: 'PUT',
      body: card,
    }),
};
