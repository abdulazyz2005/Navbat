import { createHmac } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  API,
  TEST_BOT_TOKEN,
  adminLogin,
  app,
  authed,
  login,
  prisma,
  resetDb,
  sampleAvailability,
  sampleOrder,
  topUp,
} from './helpers.js';
import { signInitData } from '../apps/api/src/lib/telegram-auth.js';

/** Telegram Web kabi `signature` maydoni bilan imzolangan initData yasaydi */
function signInitDataWithSignature(
  user: { id: number; first_name: string },
  token: string,
  signature: string,
): string {
  const params = new URLSearchParams();
  params.set('user', JSON.stringify(user));
  params.set('auth_date', String(Math.floor(Date.now() / 1000)));
  params.set('signature', signature);

  const dataCheckString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(token).digest();
  params.set('hash', createHmac('sha256', secretKey).update(dataCheckString).digest('hex'));
  return params.toString();
}

let buyer: { token: string; userId: string };
let worker: { token: string; userId: string };
let intruder: { token: string; userId: string };

beforeEach(async () => {
  await resetDb();
  buyer = await login({ id: 700000001, first_name: 'Abdulaziz' });
  worker = await login({ id: 700000002, first_name: 'Ali' });
  intruder = await login({ id: 700000003, first_name: 'Yovuz' });
});

async function matchedOrder() {
  const B = authed(buyer.token);
  const W = authed(worker.token);
  await W.post('/availability').send(sampleAvailability());
  const created = await B.post('/orders').send(sampleOrder());
  await topUp(buyer, 50000);
  await B.post(`/orders/${created.body.id}/pay`).send({});
  await W.post(`/orders/${created.body.id}/accept`).send({});
  return created.body.id as string;
}

/* ---------------------------------------------------- Telegram initData */

describe('Telegram initData validatsiyasi', () => {
  it('soxta initData rad etiladi', async () => {
    const res = await request(app)
      .post(`${API}/auth/telegram`)
      .send({ initData: 'user=%7B%22id%22%3A1%7D&auth_date=1700000000&hash=deadbeef' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_INIT_DATA');
  });

  it('boshqa token bilan imzolangan initData rad etiladi', async () => {
    const initData = signInitData({ id: 123, first_name: 'Soxta' }, 'BOSHQA:TOKEN');
    const res = await request(app).post(`${API}/auth/telegram`).send({ initData });
    expect(res.status).toBe(401);
  });

  it('o‘zgartirilgan user_id imzoni buzadi', async () => {
    const initData = signInitData({ id: 700000001, first_name: 'Abdulaziz' }, TEST_BOT_TOKEN);
    // hujumchi user maydonini boshqa ID bilan almashtirmoqchi
    const tampered = initData.replace(
      encodeURIComponent(JSON.stringify({ id: 700000001, first_name: 'Abdulaziz' })),
      encodeURIComponent(JSON.stringify({ id: 999999999, first_name: 'Abdulaziz' })),
    );
    const res = await request(app).post(`${API}/auth/telegram`).send({ initData: tampered });
    expect(res.status).toBe(401);
  });

  it('muddati o‘tgan initData rad etiladi', async () => {
    const oldDate = Math.floor(Date.now() / 1000) - 90 * 24 * 60 * 60;
    const initData = signInitData({ id: 555, first_name: 'Eski' }, TEST_BOT_TOKEN, oldDate);
    const res = await request(app).post(`${API}/auth/telegram`).send({ initData });
    expect(res.status).toBe(401);
  });

  it('to‘g‘ri imzolangan initData qabul qilinadi', async () => {
    const initData = signInitData({ id: 777, first_name: 'Halol' }, TEST_BOT_TOKEN);
    const res = await request(app).post(`${API}/auth/telegram`).send({ initData });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  /**
   * Telegram Web va yangi mijozlar initData'ga `signature` (Ed25519) qo'shadi.
   * U HMAC data-check-string'ga KIRADI — aks holda login ishlamaydi.
   */
  it('`signature` maydonli initData qabul qilinadi (Telegram Web)', async () => {
    const initData = signInitDataWithSignature(
      { id: 888, first_name: 'Veb' },
      TEST_BOT_TOKEN,
      'FaKeEd25519Signature',
    );
    const res = await request(app).post(`${API}/auth/telegram`).send({ initData });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it('`signature` o‘zgartirilsa initData rad etiladi', async () => {
    const initData = signInitDataWithSignature(
      { id: 889, first_name: 'Buzuq' },
      TEST_BOT_TOKEN,
      'AsliySignature',
    ).replace('signature=AsliySignature', 'signature=SoxtaSignature');
    const res = await request(app).post(`${API}/auth/telegram`).send({ initData });
    expect(res.status).toBe(401);
  });
});

/* ------------------------------------------------------------- sessiya */

describe('sessiya tokeni', () => {
  it('tokensiz so‘rov 401 qaytaradi', async () => {
    const res = await request(app).get(`${API}/users/me`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('soxta token rad etiladi', async () => {
    const res = await request(app).get(`${API}/users/me`).set('Authorization', 'Bearer soxta.token');
    expect(res.status).toBe(401);
  });

  it('imzosi buzilgan token rad etiladi', async () => {
    const [body] = buyer.token.split('.');
    const res = await request(app)
      .get(`${API}/users/me`)
      .set('Authorization', `Bearer ${body}.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`);
    expect(res.status).toBe(401);
  });

  it('payloadi o‘zgartirilgan token rad etiladi (boshqa foydalanuvchiga o‘tish)', async () => {
    const [, signature] = buyer.token.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({
        sub: worker.userId,
        tg: '700000002',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString('base64url');
    const res = await request(app)
      .get(`${API}/users/me`)
      .set('Authorization', `Bearer ${forgedPayload}.${signature}`);
    expect(res.status).toBe(401);
  });

  it('bloklangan foydalanuvchi kira olmaydi', async () => {
    await prisma.user.update({ where: { id: intruder.userId }, data: { isBanned: true } });
    const res = await authed(intruder.token).get('/users/me');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('USER_BANNED');
  });
});

/* ------------------------------------------------------- ownership */

describe('buyurtma egaligi', () => {
  it('begona odam boshqa buyurtmani to‘lay olmaydi', async () => {
    const created = await authed(buyer.token).post('/orders').send(sampleOrder());
    const res = await authed(intruder.token).post(`/orders/${created.body.id}/pay`).send({});
    expect(res.status).toBe(403);
  });

  it('begona odam buyurtmani tasdiqlay olmaydi', async () => {
    const orderId = await matchedOrder();
    const W = authed(worker.token);
    await W.post(`/orders/${orderId}/start`).send({});
    await W.post(`/orders/${orderId}/complete`).send({});

    const res = await authed(intruder.token).post(`/orders/${orderId}/confirm`).send({});
    expect(res.status).toBe(403);
  });

  it('tayinlanmagan navbatchi ishni boshlay olmaydi', async () => {
    const orderId = await matchedOrder();
    const res = await authed(intruder.token).post(`/orders/${orderId}/start`).send({});
    expect([403, 409]).toContain(res.status);
  });

  it('begona odam chatni o‘qiy olmaydi', async () => {
    const orderId = await matchedOrder();
    const res = await authed(intruder.token).get(`/orders/${orderId}/messages`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_ORDER_PARTICIPANT');
  });

  it('begona odam chatga yoza olmaydi', async () => {
    const orderId = await matchedOrder();
    const res = await authed(intruder.token)
      .post(`/orders/${orderId}/messages`)
      .send({ body: 'salom' });
    expect(res.status).toBe(403);
  });

  it('matched bo‘lmagan buyurtmada chat ochilmaydi', async () => {
    const B = authed(buyer.token);
    const created = await B.post('/orders').send(sampleOrder());
    await topUp(buyer, 50000);
    await B.post(`/orders/${created.body.id}/pay`).send({});
    const res = await B.get(`/orders/${created.body.id}/messages`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CHAT_NOT_AVAILABLE');
  });

  it('begona odam yakunlangan bo‘lmagan buyurtmani ko‘ra olmaydi', async () => {
    const orderId = await matchedOrder();
    const res = await authed(intruder.token).get(`/orders/${orderId}`);
    expect(res.status).toBe(403);
  });
});

/* -------------------------------------------------------- to'lov egaligi */

describe('to‘lov egaligi', () => {
  it('begona odam to‘lovni ko‘ra olmaydi', async () => {
    const orderId = await matchedOrder();
    const payment = await prisma.payment.findUnique({ where: { orderId } });
    const res = await authed(intruder.token).get(`/payments/${payment!.id}`);
    expect(res.status).toBe(403);
  });

  it('begona odam to‘lovni chiqara olmaydi', async () => {
    const orderId = await matchedOrder();
    const payment = await prisma.payment.findUnique({ where: { orderId } });
    const res = await authed(intruder.token).post(`/payments/${payment!.id}/release`).send({});
    expect(res.status).toBe(403);
  });

  it('navbatchi o‘zi to‘lovni chiqara olmaydi', async () => {
    const orderId = await matchedOrder();
    const payment = await prisma.payment.findUnique({ where: { orderId } });
    const res = await authed(worker.token).post(`/payments/${payment!.id}/release`).send({});
    expect(res.status).toBe(403);
  });
});

/* ---------------------------------------------------- role escalation */

describe('rol oshirish (role escalation)', () => {
  it('oddiy foydalanuvchi admin panelga kira olmaydi', async () => {
    for (const path of ['/admin/stats', '/admin/users', '/admin/orders', '/admin/payments', '/admin/disputes', '/admin/withdrawals']) {
      const res = await authed(intruder.token).get(path);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ADMIN_ONLY');
    }
  });

  it('foydalanuvchi o‘zini admin qilib qo‘ya olmaydi', async () => {
    await authed(intruder.token).patch('/users/me').send({ isAdmin: true, roleMode: 'BOTH' });
    const user = await prisma.user.findUnique({ where: { id: intruder.userId } });
    expect(user?.isAdmin).toBe(false);
  });

  it('foydalanuvchi balansini o‘zboshimchalik bilan o‘zgartira olmaydi', async () => {
    await authed(intruder.token)
      .patch('/users/me')
      .send({ availableBalance: 999999999, rating: 500, completedOrders: 100 });
    const profile = await prisma.profile.findUnique({ where: { userId: intruder.userId } });
    expect(profile?.availableBalance).toBe(0);
    expect(profile?.rating).toBe(0);
    expect(profile?.completedOrders).toBe(0);
  });

  it('admin panel sessiyasi bilan statistika ochiladi', async () => {
    const admin = await adminLogin();
    const stats = await authed(admin.token).get('/admin/stats');
    expect(stats.status).toBe(200);
    expect(typeof stats.body.gmv).toBe('number');
  });

  it('admin o‘zini bloklab qo‘ya olmaydi', async () => {
    const admin = await adminLogin();
    const res = await authed(admin.token)
      .post(`/admin/users/${admin.userId}/ban`)
      .send({ banned: true });
    expect(res.status).toBe(400);
  });
});

/* ------------------------------------------------- state machine himoyasi */

describe('holat mashinasi himoyasi', () => {
  it('to‘lanmagan buyurtmani qabul qilib bo‘lmaydi', async () => {
    const created = await authed(buyer.token).post('/orders').send(sampleOrder());
    const res = await authed(worker.token).post(`/orders/${created.body.id}/accept`).send({});
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ORDER_NOT_PUBLISHED');
  });

  it('boshlanmagan ishni yakunlab bo‘lmaydi', async () => {
    const orderId = await matchedOrder();
    const res = await authed(worker.token).post(`/orders/${orderId}/complete`).send({});
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NOT_STARTED');
  });

  it('yakunlanmagan buyurtmani tasdiqlab bo‘lmaydi', async () => {
    const orderId = await matchedOrder();
    const res = await authed(buyer.token).post(`/orders/${orderId}/confirm`).send({});
    expect(res.status).toBe(409);
  });

  it('ikki marta to‘lab bo‘lmaydi (ikki marta yechilmaydi)', async () => {
    const B = authed(buyer.token);
    const created = await B.post('/orders').send(sampleOrder());
    // Balansda ikki marta to'lashga yetadigan pul bo'lsa ham, ikkinchisi o'tmaydi
    await topUp(buyer, 200000);
    await B.post(`/orders/${created.body.id}/pay`).send({});
    const second = await B.post(`/orders/${created.body.id}/pay`).send({});
    expect(second.status).toBe(409);

    const transactions = await prisma.transaction.count({
      where: { userId: buyer.userId, type: 'ORDER_PAYMENT' },
    });
    expect(transactions).toBe(1);
  });

  it('tugallanmagan buyurtmani baholab bo‘lmaydi', async () => {
    const orderId = await matchedOrder();
    const res = await authed(buyer.token).post(`/orders/${orderId}/rate`).send({ rating: 5 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RATING_NOT_ALLOWED');
  });
});

/* ------------------------------------------------------ input validation */

describe('kiritma validatsiyasi', () => {
  it('SQL injection urinishi oddiy matn sifatida saqlanadi', async () => {
    const evil = "'; DROP TABLE users; --";
    const res = await authed(buyer.token)
      .post('/orders')
      .send(sampleOrder({ title: evil, description: evil }));
    expect(res.status).toBe(201);
    expect(res.body.title).toBe(evil);

    // Jadval hali ham joyida
    expect(await prisma.user.count()).toBeGreaterThan(0);
  });

  it('XSS payload saqlanadi, lekin HTML sifatida bajarilmaydi (React escape qiladi)', async () => {
    const xss = '<script>alert(1)</script>';
    const res = await authed(buyer.token).post('/orders').send(sampleOrder({ title: xss }));
    expect(res.status).toBe(201);
    expect(res.body.title).toBe(xss);
  });

  it('juda uzun matn rad etiladi', async () => {
    const res = await authed(buyer.token)
      .post('/orders')
      .send(sampleOrder({ title: 'a'.repeat(500) }));
    expect(res.status).toBe(422);
  });

  it('noto‘g‘ri koordinatalar rad etiladi', async () => {
    const res = await authed(buyer.token)
      .post('/orders')
      .send(sampleOrder({ latitude: 999, longitude: -999 }));
    expect(res.status).toBe(422);
  });

  it('manfiy summa rad etiladi', async () => {
    const res = await authed(buyer.token)
      .post('/orders')
      .send(sampleOrder({ offeredAmount: -50000 }));
    expect(res.status).toBe(422);
  });

  it('kasrli summa rad etiladi (float pul yo‘q)', async () => {
    const res = await authed(buyer.token)
      .post('/orders')
      .send(sampleOrder({ offeredAmount: 50000.5 }));
    expect(res.status).toBe(422);
  });

  it('reyting 1..5 dan tashqarida bo‘lolmaydi', async () => {
    const orderId = await matchedOrder();
    const res = await authed(buyer.token).post(`/orders/${orderId}/rate`).send({ rating: 10 });
    expect(res.status).toBe(422);
  });
});
