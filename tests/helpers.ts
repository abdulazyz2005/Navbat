import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../apps/api/src/app.js';
import { prisma } from '../apps/api/src/lib/prisma.js';
import { signInitData, type TelegramUser } from '../apps/api/src/lib/telegram-auth.js';

export const TEST_BOT_TOKEN = '123456:TEST-BOT-TOKEN-FOR-VITEST-ONLY';

export const app: Express = createApp();

export async function resetDb(): Promise<void> {
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

/** Barcha API yo'llari `/api` ostida turadi (bitta servis rejimi) */
export const API = '/api';

export function authed(token: string) {
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  return {
    get: (url: string) => auth(request(app).get(`${API}${url}`)),
    post: (url: string) => auth(request(app).post(`${API}${url}`)),
    patch: (url: string) => auth(request(app).patch(`${API}${url}`)),
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
