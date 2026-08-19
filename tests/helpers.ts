import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../apps/api/src/app.js';
import { prisma } from '../apps/api/src/lib/prisma.js';
import { signInitData, type TelegramUser } from '../apps/api/src/lib/telegram-auth.js';
import { issueAdminCode } from '../apps/api/src/routes/admin-auth.js';
import { setPlatformCard } from '../apps/api/src/services/settings.js';

export const TEST_BOT_TOKEN = '123456:TEST-BOT-TOKEN-FOR-VITEST-ONLY';

export const app: Express = createApp();

export async function resetDb(): Promise<void> {
  await prisma.adminLoginCode.deleteMany();
  await prisma.paymentIntent.deleteMany();
  await prisma.checkIn.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.withdrawal.deleteMany();
  await prisma.dispute.deleteMany();
  await prisma.message.deleteMany();
  await prisma.rating.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.assignment.deleteMany();
  await prisma.availability.deleteMany();
  await prisma.order.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.user.deleteMany();
}

export interface TestActor {
  token: string;
  userId: string;
  telegramId: number;
  auth: () => request.Test;
}

/** Haqiqiy imzolangan initData bilan login qiladi (dev bypass ishlatilmaydi) */
export async function login(user: Partial<TelegramUser> & { id: number }): Promise<{
  token: string;
  userId: string;
}> {
  const tgUser: TelegramUser = {
    id: user.id,
    first_name: user.first_name ?? `User${user.id}`,
    last_name: user.last_name,
    username: user.username ?? `user${user.id}`,
    photo_url: user.photo_url,
  };
  const initData = signInitData(tgUser, TEST_BOT_TOKEN);
  const res = await request(app).post(`${API}/auth/telegram`).send({ initData });
  if (res.status !== 200) {
    throw new Error(`login muvaffaqiyatsiz: ${res.status} ${JSON.stringify(res.body)}`);
  }
  const dbUser = await prisma.user.findUnique({ where: { telegramId: BigInt(user.id) } });
  return { token: res.body.token as string, userId: dbUser!.id };
}

/** Test uchun platforma kartasi (to'lov shu kartaga yuboriladi) */
export const TEST_CARD = {
  cardNumber: '8600123412341234',
  cardHolder: 'NAVBAT TEST',
  bank: 'Test Bank',
};

export async function ensurePlatformCard(): Promise<void> {
  await setPlatformCard(TEST_CARD);
}

/** Admin panel sessiyasi (brauzer oqimidagi kabi: kod -> token) */
export async function adminLogin(telegramId = 900000001): Promise<{ token: string; userId: string }> {
  const { userId } = await login({ id: telegramId, first_name: 'Admin' });
  const { code } = await issueAdminCode(userId);
  const res = await request(app).post(`${API}/admin/session`).send({ code });
  if (res.status !== 200) {
    throw new Error(`admin login muvaffaqiyatsiz: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { token: res.body.token as string, userId };
}

/**
 * Balansni haqiqiy karta oqimi orqali to'ldiradi:
 *   intent yaratish -> chek yuklash -> admin tasdiqlash
 * Testlar shu tufayli to'lov zanjirini ham tekshiradi.
 */
export async function topUp(
  actor: { token: string; userId: string },
  amount: number,
  orderId?: string,
): Promise<number> {
  await ensurePlatformCard();

  const created = await authed(actor.token).post('/payments/intents').send({ amount, orderId });
  if (created.status !== 201) {
    throw new Error(`intent yaratilmadi: ${created.status} ${JSON.stringify(created.body)}`);
  }
  const intentId = created.body.id as string;
  const expected = created.body.expectedAmount as number;

  const receipt = `data:image/png;base64,${Buffer.from('fake-receipt-image-bytes').toString('base64')}`;
  const uploaded = await authed(actor.token).post(`/payments/intents/${intentId}/receipt`).send({
    image: receipt,
  });
  if (uploaded.status !== 200) {
    throw new Error(`chek yuklanmadi: ${uploaded.status} ${JSON.stringify(uploaded.body)}`);
  }

  const admin = await adminLogin();
  const confirmed = await authed(admin.token).post(`/admin/intents/${intentId}/confirm`).send({});
  if (confirmed.status !== 200) {
    throw new Error(`tasdiqlanmadi: ${confirmed.status} ${JSON.stringify(confirmed.body)}`);
  }
  return expected;
}

/** Buyurtmani karta orqali to'lash (balans yetmaganda) va e'lon qilish */
export async function payOrderViaCard(
  actor: { token: string; userId: string },
  orderId: string,
  amount: number,
): Promise<void> {
  await topUp(actor, amount, orderId);
}

/** Barcha API yo'llari `/api` ostida turadi (bitta servis rejimi) */
export const API = '/api';

export function authed(token: string) {
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  return {
    get: (url: string) => auth(request(app).get(`${API}${url}`)),
    post: (url: string) => auth(request(app).post(`${API}${url}`)),
    patch: (url: string) => auth(request(app).patch(`${API}${url}`)),
    put: (url: string) => auth(request(app).put(`${API}${url}`)),
    delete: (url: string) => auth(request(app).delete(`${API}${url}`)),
  };
}

export function dayOffset(days: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Chilonzor demo koordinatalari */
export const CHILONZOR = { latitude: 41.2756, longitude: 69.2034 };

export const sampleOrder = (overrides: Record<string, unknown> = {}) => ({
  category: 'DOCTOR',
  title: 'Kardiolog navbati',
  description: '2-qavat, 214-xona',
  locationName: 'Chilonzor poliklinikasi',
  address: 'Chilonzor, Bunyodkor 12',
  latitude: CHILONZOR.latitude,
  longitude: CHILONZOR.longitude,
  date: dayOffset(3),
  startTime: '14:30',
  endTime: '16:00',
  offeredAmount: 50000,
  ...overrides,
});

export const sampleAvailability = (overrides: Record<string, unknown> = {}) => ({
  date: dayOffset(3),
  startTime: '13:30',
  endTime: '17:00',
  locationName: 'Chilonzor',
  latitude: CHILONZOR.latitude,
  longitude: CHILONZOR.longitude,
  radiusKm: 5,
  minimumAmount: 30000,
  ...overrides,
});

export { prisma };
