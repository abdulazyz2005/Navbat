import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  API,
  TEST_CARD,
  adminLogin,
  app,
  authed,
  ensurePlatformCard,
  login,
  prisma,
  resetDb,
  sampleOrder,
  topUp,
} from './helpers.js';

/**
 * KARTA-KARTA TO'LOV VA ADMIN AJRATILISHI
 *
 * Tekshiriladi:
 *   - unikal summa (ikki faol to'lov bir xil summaga ega bo'lmaydi)
 *   - chek yuklash va admin tasdig'i
 *   - pul IKKI MARTA qo'shilmasligi
 *   - begona odam boshqaning to'lovini ko'rmasligi/tasdiqlamasligi
 *   - Mini App tokeni admin endpointlariga o'tmasligi
 */

let buyer: { token: string; userId: string };
let worker: { token: string; userId: string };

beforeEach(async () => {
  await resetDb();
  await ensurePlatformCard();
  buyer = await login({ id: 810000001, first_name: 'Buyurtmachi' });
  worker = await login({ id: 810000002, first_name: 'Navbatchi' });
});

const RECEIPT = `data:image/png;base64,${Buffer.from('receipt-bytes').toString('base64')}`;

describe('karta to‘lovi: unikal summa', () => {
  it('to‘lov so‘rovi karta va aniq summani qaytaradi', async () => {
    const res = await authed(buyer.token).post('/payments/intents').send({ amount: 50000 });
    expect(res.status).toBe(201);
    expect(res.body.cardNumber).toBe(TEST_CARD.cardNumber);
    expect(res.body.cardHolder).toBe(TEST_CARD.cardHolder);
    expect(res.body.status).toBe('AWAITING_TRANSFER');
    // Unikal qo'shimcha: 1..999
    expect(res.body.expectedAmount).toBeGreaterThan(50000);
    expect(res.body.expectedAmount).toBeLessThanOrEqual(50999);
  });

  it('ikki foydalanuvchining faol to‘lovlari bir xil summaga ega bo‘lmaydi', async () => {
    const amounts = new Set<number>();
    for (let i = 0; i < 8; i += 1) {
      const user = await login({ id: 811000000 + i, first_name: `User${i}` });
      const res = await authed(user.token).post('/payments/intents').send({ amount: 50000 });
      expect(res.status).toBe(201);
      amounts.add(res.body.expectedAmount);
    }
    expect(amounts.size).toBe(8);
  });

  it('bitta foydalanuvchida bir vaqtda faqat bitta faol to‘lov bo‘ladi', async () => {
    await authed(buyer.token).post('/payments/intents').send({ amount: 50000 });
    const second = await authed(buyer.token).post('/payments/intents').send({ amount: 70000 });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('ACTIVE_INTENT_EXISTS');
  });

  it('karta sozlanmagan bo‘lsa to‘lov boshlanmaydi', async () => {
    await prisma.setting.deleteMany();
    const res = await authed(buyer.token).post('/payments/intents').send({ amount: 50000 });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('PAYMENT_CARD_NOT_SET');
  });
});

describe('chek va admin tasdig‘i', () => {
  it('chek yuklanadi va admin tasdiqlagach pul balansga tushadi', async () => {
    const created = await authed(buyer.token).post('/payments/intents').send({ amount: 50000 });
    const intentId = created.body.id as string;
    const expected = created.body.expectedAmount as number;

    const uploaded = await authed(buyer.token)
      .post(`/payments/intents/${intentId}/receipt`)
      .send({ image: RECEIPT });
    expect(uploaded.status).toBe(200);
    expect(uploaded.body.status).toBe('PENDING_REVIEW');
    expect(uploaded.body.hasReceipt).toBe(true);

    const admin = await adminLogin();
    const pending = await authed(admin.token).get('/admin/intents?status=PENDING_REVIEW');
    expect(pending.body.items).toHaveLength(1);
    expect(pending.body.items[0].user.firstName).toBe('Buyurtmachi');

    const confirmed = await authed(admin.token).post(`/admin/intents/${intentId}/confirm`).send({});
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.credited).toBe(expected);

    const balance = await authed(buyer.token).get('/balance');
    expect(balance.body.availableBalance).toBe(expected);
  });

  it('ikki marta tasdiqlansa pul ikki marta qo‘shilmaydi', async () => {
    const created = await authed(buyer.token).post('/payments/intents').send({ amount: 50000 });
    const intentId = created.body.id as string;
    const expected = created.body.expectedAmount as number;
    await authed(buyer.token).post(`/payments/intents/${intentId}/receipt`).send({ image: RECEIPT });

    const admin = await adminLogin();
    const first = await authed(admin.token).post(`/admin/intents/${intentId}/confirm`).send({});
    expect(first.status).toBe(200);
    const second = await authed(admin.token).post(`/admin/intents/${intentId}/confirm`).send({});
    expect(second.status).toBe(409);

    const balance = await authed(buyer.token).get('/balance');
    expect(balance.body.availableBalance).toBe(expected);
  });

  it('rad etilgan to‘lovda pul qo‘shilmaydi va sabab ko‘rinadi', async () => {
    const created = await authed(buyer.token).post('/payments/intents').send({ amount: 50000 });
    const intentId = created.body.id as string;
    await authed(buyer.token).post(`/payments/intents/${intentId}/receipt`).send({ image: RECEIPT });

    const admin = await adminLogin();
    const rejected = await authed(admin.token)
      .post(`/admin/intents/${intentId}/reject`)
      .send({ reason: 'Pul kelmadi' });
    expect(rejected.status).toBe(200);

    const balance = await authed(buyer.token).get('/balance');
    expect(balance.body.availableBalance).toBe(0);

    const mine = await authed(buyer.token).get(`/payments/intents/${intentId}`);
    expect(mine.body.status).toBe('REJECTED');
    expect(mine.body.rejectReason).toBe('Pul kelmadi');
  });

  it('begona odam boshqaning to‘loviga chek biriktira olmaydi', async () => {
    const created = await authed(buyer.token).post('/payments/intents').send({ amount: 50000 });
    const res = await authed(worker.token)
      .post(`/payments/intents/${created.body.id}/receipt`)
      .send({ image: RECEIPT });
    expect(res.status).toBe(403);
  });

  it('begona odam boshqaning to‘lovini ko‘ra olmaydi', async () => {
    const created = await authed(buyer.token).post('/payments/intents').send({ amount: 50000 });
    const res = await authed(worker.token).get(`/payments/intents/${created.body.id}`);
    expect(res.status).toBe(403);
  });

  it('juda katta chek rad etiladi', async () => {
    const created = await authed(buyer.token).post('/payments/intents').send({ amount: 50000 });
    const huge = `data:image/png;base64,${'A'.repeat(3 * 1024 * 1024)}`;
    const res = await authed(buyer.token)
      .post(`/payments/intents/${created.body.id}/receipt`)
      .send({ image: huge });
    expect([413, 422]).toContain(res.status);
  });
});

describe('to‘lov -> buyurtma avtomatik e’lon qilinadi', () => {
  it('buyurtma uchun to‘lov tasdiqlansa buyurtma PUBLISHED bo‘ladi', async () => {
    const order = await authed(buyer.token).post('/orders').send(sampleOrder());
    expect(order.body.status).toBe('DRAFT');

    const intent = await authed(buyer.token)
      .post('/payments/intents')
      .send({ amount: order.body.totalAmount, orderId: order.body.id });
    expect(intent.status).toBe(201);

    await authed(buyer.token)
      .post(`/payments/intents/${intent.body.id}/receipt`)
      .send({ image: RECEIPT });

    const admin = await adminLogin();
    const confirmed = await authed(admin.token)
      .post(`/admin/intents/${intent.body.id}/confirm`)
      .send({});
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.publishedOrderId).toBe(order.body.id);

    const fresh = await authed(buyer.token).get(`/orders/${order.body.id}`);
    expect(fresh.body.status).toBe('PUBLISHED');
    expect(fresh.body.payment.status).toBe('HELD');
  });
});

describe('admin panel ajratilgani', () => {
  it('Mini App tokeni admin bo‘lsa ham admin endpointga o‘tmaydi', async () => {
    // 900000001 — ADMIN_TELEGRAM_IDS ro'yxatida
    const adminUser = await login({ id: 900000001, first_name: 'Admin' });
    const res = await authed(adminUser.token).get('/admin/stats');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ADMIN_SESSION_REQUIRED');
  });

  it('admin bo‘lmagan odam kirish kodini almashtira olmaydi', async () => {
    const res = await request(app).post(`${API}/admin/session`).send({ code: 'XXXXXXXX' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('ADMIN_CODE_INVALID');
  });

  it('kirish kodi faqat bir marta ishlaydi', async () => {
    const { issueAdminCode } = await import('../apps/api/src/routes/admin-auth.js');
    const admin = await login({ id: 900000001, first_name: 'Admin' });
    const { code } = await issueAdminCode(admin.userId);

    const first = await request(app).post(`${API}/admin/session`).send({ code });
    expect(first.status).toBe(200);
    const second = await request(app).post(`${API}/admin/session`).send({ code });
    expect(second.status).toBe(401);
  });

  it('admin sessiyasi bilan payout navbati va karta sozlamalari ochiladi', async () => {
    const admin = await adminLogin();

    const settings = await authed(admin.token).get('/admin/settings');
    expect(settings.status).toBe(200);
    expect(settings.body.card.cardNumber).toBe(TEST_CARD.cardNumber);

    const payouts = await authed(admin.token).get('/admin/withdrawals?status=PENDING');
    expect(payouts.status).toBe(200);
    expect(Array.isArray(payouts.body.items)).toBe(true);
  });

  it('noto‘g‘ri karta raqami rad etiladi', async () => {
    const admin = await adminLogin();
    const res = await authed(admin.token)
      .put('/admin/settings/card')
      .send({ cardNumber: '8600 1234', cardHolder: 'TEST' });
    expect([400, 422]).toContain(res.status);
  });
});

describe('payout: navbatchi kartasi', () => {
  it('pul yechishda karta profilda saqlanadi va admin ko‘radi', async () => {
    // Navbatchiga pul kerak — balansni karta orqali to'ldiramiz
    const credited = await topUp(worker, 100000);

    await authed(worker.token).patch('/users/me').send({
      cardNumber: '8600555544443333',
      cardHolder: 'NAVBATCHI TEST',
    });

    const res = await authed(worker.token).post('/withdrawals').send({
      amount: 50000,
      method: 'CARD',
      account: '8600555544443333',
    });
    expect(res.status).toBe(201);

    const balance = await authed(worker.token).get('/balance');
    expect(balance.body.availableBalance).toBe(credited - 50000);

    const admin = await adminLogin();
    const queue = await authed(admin.token).get('/admin/withdrawals?status=PENDING');
    expect(queue.body.items[0].worker.cardNumber).toBe('8600555544443333');
    expect(queue.body.items[0].amount).toBe(50000);

    const paid = await authed(admin.token)
      .post(`/admin/withdrawals/${res.body.id}/decide`)
      .send({ decision: 'COMPLETED' });
    expect(paid.status).toBe(200);

    const after = await prisma.withdrawal.findUnique({ where: { id: res.body.id } });
    expect(after?.status).toBe('COMPLETED');
    // To'langandan keyin balans qayta o'zgarmaydi
    const finalBalance = await authed(worker.token).get('/balance');
    expect(finalBalance.body.availableBalance).toBe(credited - 50000);
  });

  it('noto‘g‘ri karta raqami profilga saqlanmaydi', async () => {
    const res = await authed(worker.token).patch('/users/me').send({ cardNumber: '1234' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CARD');
  });
});
