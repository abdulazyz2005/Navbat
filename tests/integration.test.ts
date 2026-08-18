import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  authed,
  dayOffset,
  login,
  prisma,
  resetDb,
  sampleAvailability,
  sampleOrder,
} from './helpers.js';

/**
 * To'liq end-to-end oqim:
 * Buyer order yaratadi -> to'laydi (escrow HELD) -> Worker qabul qiladi ->
 * check-in -> boshlaydi -> yakunlaydi -> Buyer tasdiqlaydi -> payment RELEASED ->
 * balans +50 000 -> reyting -> pul yechish.
 */

let buyer: { token: string; userId: string };
let worker: { token: string; userId: string };
let other: { token: string; userId: string };

beforeAll(async () => {
  await resetDb();
});

beforeEach(async () => {
  await resetDb();
  buyer = await login({ id: 800000001, first_name: 'Abdulaziz', username: 'abdulaziz' });
  worker = await login({ id: 800000002, first_name: 'Ali', username: 'ali' });
  other = await login({ id: 800000003, first_name: 'Bekzod', username: 'bekzod' });
});

describe('to‘liq demo ssenariy', () => {
  it('buyurtma -> to‘lov -> qabul -> ish -> tasdiq -> balans', async () => {
    const B = authed(buyer.token);
    const W = authed(worker.token);

    // 1. Navbatchi bo'sh vaqtini belgilaydi
    const availabilityRes = await W.post('/availability').send(sampleAvailability());
    expect(availabilityRes.status).toBe(201);

    // 2. Buyurtmachi buyurtma yaratadi
    const createRes = await B.post('/orders').send(sampleOrder());
    expect(createRes.status).toBe(201);
    const order = createRes.body;
    expect(order.status).toBe('DRAFT');
    expect(order.offeredAmount).toBe(50000);
    expect(order.platformFee).toBe(5000);
    expect(order.totalAmount).toBe(55000);
    expect(order.payment.status).toBe('PENDING');

    // 3. To'lov -> escrow HELD, buyurtma PUBLISHED
    const payRes = await B.post(`/orders/${order.id}/pay`).send({});
    expect(payRes.status).toBe(200);
    expect(payRes.body.status).toBe('PUBLISHED');
    expect(payRes.body.payment.status).toBe('HELD');

    // Buyurtmachining hisobi: TOP_UP +55 000, ORDER_PAYMENT -50 000, PLATFORM_FEE -5 000
    const buyerTx = await authed(buyer.token).get('/balance/transactions');
    const types = buyerTx.body.items.map((t: { type: string }) => t.type);
    expect(types).toContain('TOP_UP');
    expect(types).toContain('ORDER_PAYMENT');
    expect(types).toContain('PLATFORM_FEE');
    const buyerBalance = await B.get('/balance');
    expect(buyerBalance.body.availableBalance).toBe(0);

    // 4. Feedda ko'rinadi va moslik ballari yuqori
    const feed = await W.get('/orders/feed');
    expect(feed.status).toBe(200);
    expect(feed.body.items).toHaveLength(1);
    expect(feed.body.items[0].id).toBe(order.id);
    expect(feed.body.items[0].matchScore).toBeGreaterThanOrEqual(90);
    expect(feed.body.items[0].distanceKm).toBeLessThan(1);

    // 5. Navbatchi qabul qiladi
    const acceptRes = await W.post(`/orders/${order.id}/accept`).send({});
    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.status).toBe('MATCHED');
    expect(acceptRes.body.worker.id).toBe(worker.userId);

    // Escrow puli navbatchining "kutilmoqda" balansida
    const pending = await W.get('/balance');
    expect(pending.body.pendingBalance).toBe(50000);
    expect(pending.body.availableBalance).toBe(0);

    // 6. Chat matched bo'lgandan keyin ochiladi
    const msgRes = await W.post(`/orders/${order.id}/messages`).send({ body: 'Yetib keldim' });
    expect(msgRes.status).toBe(201);
    const msgs = await authed(buyer.token).get(`/orders/${order.id}/messages`);
    expect(msgs.body.items).toHaveLength(1);

    // 7. Ishni boshlash (lokatsiya bilan check-in)
    const startRes = await W.post(`/orders/${order.id}/start`).send({
      location: { latitude: 41.2757, longitude: 69.2035 },
    });
    expect(startRes.status).toBe(200);
    expect(startRes.body.status).toBe('IN_PROGRESS');

    const checkIns = await W.get(`/orders/${order.id}/checkins`);
    expect(checkIns.body.items).toHaveLength(1);
    expect(checkIns.body.items[0].type).toBe('ARRIVAL');
    expect(checkIns.body.items[0].distanceM).toBeLessThan(100);

    // 8. Davomiy tasdiqlash
    const periodic = await W.post(`/orders/${order.id}/checkin`).send({
      location: { latitude: 41.2757, longitude: 69.2035 },
    });
    expect(periodic.status).toBe(201);

    // 9. Navbatchi yakunlaydi
    const completeRes = await W.post(`/orders/${order.id}/complete`).send({});
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.status).toBe('COMPLETION_PENDING');

    // 10. Buyurtmachi tasdiqlaydi -> payment RELEASED
    const confirmRes = await B.post(`/orders/${order.id}/confirm`).send({});
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.status).toBe('COMPLETED');
    expect(confirmRes.body.payment.status).toBe('RELEASED');

    // 11. Navbatchi balansi: +50 000 mavjud, kutilayotgan 0
    const finalBalance = await W.get('/balance');
    expect(finalBalance.body.availableBalance).toBe(50000);
    expect(finalBalance.body.pendingBalance).toBe(0);
    expect(finalBalance.body.totalEarned).toBe(50000);

    // 12. Platforma daromadi = 5 000
    const payment = await prisma.payment.findUnique({ where: { orderId: order.id } });
    expect(payment?.platformFee).toBe(5000);
    expect(payment?.workerAmount).toBe(50000);
    expect(payment?.status).toBe('RELEASED');

    // 13. Reytinglar
    const rate1 = await B.post(`/orders/${order.id}/rate`).send({ rating: 5, comment: 'Zo‘r!' });
    expect(rate1.status).toBe(201);
    const rate2 = await W.post(`/orders/${order.id}/rate`).send({ rating: 5 });
    expect(rate2.status).toBe(201);

    const workerMe = await W.get('/users/me');
    expect(workerMe.body.profile.rating).toBe(500);
    expect(workerMe.body.profile.completedOrders).toBe(1);

    // Ikki marta baholab bo'lmaydi
    const dup = await B.post(`/orders/${order.id}/rate`).send({ rating: 4 });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('ALREADY_RATED');
  });
});

describe('to‘lov va balans', () => {
  it('pul yechish balansdan darhol bloklanadi', async () => {
    await prisma.profile.update({
      where: { userId: worker.userId },
      data: { availableBalance: 300000 },
    });
    const W = authed(worker.token);

    const res = await W.post('/withdrawals').send({
      amount: 200000,
      method: 'CARD',
      account: '8600123412341234',
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING');

    const balance = await W.get('/balance');
    expect(balance.body.availableBalance).toBe(100000);
  });

  it('yetarli mablag‘ bo‘lmasa rad etadi', async () => {
    const res = await authed(worker.token).post('/withdrawals').send({
      amount: 200000,
      method: 'CARD',
      account: '8600123412341234',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INSUFFICIENT_BALANCE');
  });

  it('minimal summadan kam bo‘lsa rad etadi', async () => {
    await prisma.profile.update({
      where: { userId: worker.userId },
      data: { availableBalance: 300000 },
    });
    const res = await authed(worker.token).post('/withdrawals').send({
      amount: 10000,
      method: 'CARD',
      account: '8600123412341234',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('WITHDRAWAL_TOO_SMALL');
  });

  it('bekor qilingan so‘rov summani qaytaradi', async () => {
    await prisma.profile.update({
      where: { userId: worker.userId },
      data: { availableBalance: 300000 },
    });
    const W = authed(worker.token);
    const created = await W.post('/withdrawals').send({
      amount: 200000,
      method: 'CARD',
      account: '8600123412341234',
    });
    await W.post(`/withdrawals/${created.body.id}/cancel`).send({});
    const balance = await W.get('/balance');
    expect(balance.body.availableBalance).toBe(300000);
  });
});

describe('bekor qilish va qaytarish', () => {
  async function publishedOrder() {
    const B = authed(buyer.token);
    const created = await B.post('/orders').send(sampleOrder());
    await B.post(`/orders/${created.body.id}/pay`).send({});
    return created.body.id as string;
  }

  it('buyurtmachi bekor qilsa pul qaytariladi', async () => {
    const orderId = await publishedOrder();
    const B = authed(buyer.token);

    const res = await B.post(`/orders/${orderId}/cancel`).send({ reason: 'Kerak emas' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');

    const balance = await B.get('/balance');
    expect(balance.body.availableBalance).toBe(55000);

    const payment = await prisma.payment.findUnique({ where: { orderId } });
    expect(payment?.status).toBe('REFUNDED');
  });

  it('navbatchi voz kechsa buyurtma qayta e’lon qilinadi va cancellation oshadi', async () => {
    const orderId = await publishedOrder();
    const W = authed(worker.token);
    await W.post('/availability').send(sampleAvailability());
    await W.post(`/orders/${orderId}/accept`).send({});

    const res = await W.post(`/orders/${orderId}/cancel`).send({ reason: 'Bandman' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PUBLISHED');
    expect(res.body.worker).toBeNull();

    const me = await W.get('/users/me');
    expect(me.body.profile.cancelledOrders).toBe(1);

    const balance = await W.get('/balance');
    expect(balance.body.pendingBalance).toBe(0);
  });

  it('bitta topshiriqni ikki navbatchi qabul qila olmaydi', async () => {
    const orderId = await publishedOrder();
    await authed(worker.token).post(`/orders/${orderId}/accept`).send({});
    const second = await authed(other.token).post(`/orders/${orderId}/accept`).send({});
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('ORDER_ALREADY_ACCEPTED');
  });

  it('o‘z buyurtmasini qabul qilib bo‘lmaydi', async () => {
    const orderId = await publishedOrder();
    const res = await authed(buyer.token).post(`/orders/${orderId}/accept`).send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CANNOT_ACCEPT_OWN_ORDER');
  });
});

describe('taklifni oshirish (dynamic price)', () => {
  it('summani oshiradi va komissiyani qayta hisoblaydi', async () => {
    const B = authed(buyer.token);
    const created = await B.post('/orders').send(sampleOrder());
    await B.post(`/orders/${created.body.id}/pay`).send({});

    const res = await B.post(`/orders/${created.body.id}/raise-price`).send({ amount: 70000 });
    expect(res.status).toBe(200);
    expect(res.body.offeredAmount).toBe(70000);
    expect(res.body.platformFee).toBe(7000);
    expect(res.body.totalAmount).toBe(77000);
    expect(res.body.priceRaises).toBe(1);
  });

  it('summani kamaytirishga ruxsat bermaydi', async () => {
    const B = authed(buyer.token);
    const created = await B.post('/orders').send(sampleOrder());
    await B.post(`/orders/${created.body.id}/pay`).send({});
    const res = await B.post(`/orders/${created.body.id}/raise-price`).send({ amount: 40000 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PRICE_MUST_INCREASE');
  });
});

describe('nizo (dispute)', () => {
  it('“Muammo bor” nizo ochadi va to‘lov HELD bo‘lib qoladi', async () => {
    const B = authed(buyer.token);
    const W = authed(worker.token);
    const created = await B.post('/orders').send(sampleOrder());
    const orderId = created.body.id;
    await B.post(`/orders/${orderId}/pay`).send({});
    await W.post(`/orders/${orderId}/accept`).send({});
    await W.post(`/orders/${orderId}/start`).send({});
    await W.post(`/orders/${orderId}/complete`).send({});

    const res = await B.post(`/orders/${orderId}/dispute`).send({
      reason: 'WORKER_LATE',
      description: 'Kech keldi',
    });
    expect(res.status).toBe(201);

    const order = await B.get(`/orders/${orderId}`);
    expect(order.body.status).toBe('DISPUTED');
    expect(order.body.payment.status).toBe('HELD');
  });

  it('admin nizoni navbatchi foydasiga hal qiladi -> to‘lov chiqariladi', async () => {
    const admin = await login({ id: 900000001, first_name: 'Admin' });
    const B = authed(buyer.token);
    const W = authed(worker.token);
    const created = await B.post('/orders').send(sampleOrder());
    const orderId = created.body.id;
    await B.post(`/orders/${orderId}/pay`).send({});
    await W.post(`/orders/${orderId}/accept`).send({});
    await W.post(`/orders/${orderId}/start`).send({});
    await W.post(`/orders/${orderId}/complete`).send({});
    await B.post(`/orders/${orderId}/dispute`).send({ reason: 'WORKER_LATE' });

    const disputes = await authed(admin.token).get('/admin/disputes?status=OPEN');
    expect(disputes.status).toBe(200);
    const disputeId = disputes.body.items[0].id;

    const resolved = await authed(admin.token)
      .post(`/admin/disputes/${disputeId}/resolve`)
      .send({ winner: 'WORKER', resolution: 'Navbatchi ishni bajargan' });
    expect(resolved.status).toBe(200);
    expect(resolved.body.status).toBe('COMPLETED');

    const balance = await W.get('/balance');
    expect(balance.body.availableBalance).toBe(50000);
  });

  it('admin nizoni buyurtmachi foydasiga hal qiladi -> pul qaytariladi', async () => {
    const admin = await login({ id: 900000001, first_name: 'Admin' });
    const B = authed(buyer.token);
    const W = authed(worker.token);
    const created = await B.post('/orders').send(sampleOrder());
    const orderId = created.body.id;
    await B.post(`/orders/${orderId}/pay`).send({});
    await W.post(`/orders/${orderId}/accept`).send({});
    await B.post(`/orders/${orderId}/dispute`).send({ reason: 'WORKER_NO_SHOW' });

    const disputes = await authed(admin.token).get('/admin/disputes?status=OPEN');
    const disputeId = disputes.body.items[0].id;
    const resolved = await authed(admin.token)
      .post(`/admin/disputes/${disputeId}/resolve`)
      .send({ winner: 'BUYER', resolution: 'Navbatchi kelmagan' });
    expect(resolved.status).toBe(200);
    expect(resolved.body.status).toBe('REFUNDED');

    const buyerBalance = await B.get('/balance');
    expect(buyerBalance.body.availableBalance).toBe(55000);

    const workerMe = await W.get('/users/me');
    expect(workerMe.body.profile.cancelledOrders).toBe(1);
  });
});

describe('validatsiya', () => {
  it('o‘tgan sanaga buyurtma yaratib bo‘lmaydi', async () => {
    const res = await authed(buyer.token)
      .post('/orders')
      .send(sampleOrder({ date: dayOffset(-1) }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PAST_DATE');
  });

  it('tugash vaqti boshlanishdan oldin bo‘lolmaydi', async () => {
    const res = await authed(buyer.token)
      .post('/orders')
      .send(sampleOrder({ startTime: '16:00', endTime: '14:00' }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TIME_RANGE');
  });

  it('minimal summadan kam buyurtma rad etiladi', async () => {
    const res = await authed(buyer.token).post('/orders').send(sampleOrder({ offeredAmount: 5000 }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('AMOUNT_TOO_LOW');
  });

  it('noto‘g‘ri vaqt formati 422 qaytaradi', async () => {
    const res = await authed(buyer.token).post('/orders').send(sampleOrder({ startTime: '25:99' }));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('matching feed', () => {
  it('bo‘sh vaqtga mos kelmaydigan topshiriqlarni yashiradi', async () => {
    const B = authed(buyer.token);
    const W = authed(worker.token);
    await W.post('/availability').send(sampleAvailability({ startTime: '08:00', endTime: '10:00' }));

    const created = await B.post('/orders').send(sampleOrder());
    await B.post(`/orders/${created.body.id}/pay`).send({});

    const feed = await W.get('/orders/feed');
    expect(feed.body.items).toHaveLength(0);

    const all = await W.get('/orders/feed?all=true');
    expect(all.body.items).toHaveLength(1);
  });

  it('eng yuqori to‘lov bo‘yicha saralaydi', async () => {
    const B = authed(buyer.token);
    const W = authed(worker.token);
    await W.post('/availability').send(sampleAvailability());

    const cheap = await B.post('/orders').send(sampleOrder({ offeredAmount: 30000 }));
    await B.post(`/orders/${cheap.body.id}/pay`).send({});
    const rich = await B.post('/orders').send(sampleOrder({ offeredAmount: 90000 }));
    await B.post(`/orders/${rich.body.id}/pay`).send({});

    const feed = await W.get('/orders/feed?sort=highest_pay');
    expect(feed.body.items[0].offeredAmount).toBe(90000);
  });

  it('bo‘sh vaqt yozuvi mos topshiriqlar sonini ko‘rsatadi', async () => {
    const B = authed(buyer.token);
    const created = await B.post('/orders').send(sampleOrder());
    await B.post(`/orders/${created.body.id}/pay`).send({});

    const res = await authed(worker.token).post('/availability').send(sampleAvailability());
    expect(res.body.matchingOrders).toBe(1);
  });
});
