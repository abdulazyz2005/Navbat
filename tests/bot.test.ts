import http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Bot } from 'grammy';
import { createBot } from '../apps/bot/src/bot.js';
import { app, prisma, resetDb } from './helpers.js';

/**
 * Bot testlari — haqiqiy Telegramga ulanmasdan.
 *
 * Soxta Bot API server ko'tariladi va grammY o'sha manzilga yo'naltiriladi.
 * Shu tufayli to'liq zanjir tekshiriladi:
 *   update → handler → DB → Telegramga yuborilgan javob
 */

const TOKEN = '123456:TEST-BOT-TOKEN';

interface SentMessage {
  method: string;
  body: Record<string, any>;
}

let server: http.Server;
let apiRoot: string;
let sent: SentMessage[] = [];
let bot: Bot;

/** Minimal soxta Telegram Bot API */
function createFakeTelegram(): http.Server {
  return http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk as Buffer));
    req.on('end', () => {
      const method = (req.url ?? '').split('/').pop() ?? '';
      let body: Record<string, any> = {};
      try {
        body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      } catch {
        body = {};
      }
      sent.push({ method, body });

      const reply = (result: unknown) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, result }));
      };

      if (method === 'getMe') {
        return reply({
          id: 123456,
          is_bot: true,
          first_name: 'NAVBAT',
          username: 'navbat_test_bot',
          can_join_groups: true,
          can_read_all_group_messages: false,
          supports_inline_queries: false,
        });
      }
      return reply({ message_id: sent.length, date: 0, chat: { id: 1, type: 'private' } });
    });
  });
}

function textUpdate(text: string, fromId: number, updateId = 1) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: fromId, type: 'private' as const, first_name: 'Test' },
      from: { id: fromId, is_bot: false, first_name: 'Test', language_code: 'uz' },
      text,
      entities: text.startsWith('/')
        ? [{ type: 'bot_command' as const, offset: 0, length: text.split(' ')[0].length }]
        : undefined,
    },
  };
}

function locationUpdate(fromId: number, latitude: number, longitude: number, updateId = 90) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: fromId, type: 'private' as const, first_name: 'Test' },
      from: { id: fromId, is_bot: false, first_name: 'Test' },
      location: { latitude, longitude },
    },
  };
}

/** Oxirgi yuborilgan sendMessage */
function lastMessage(): Record<string, any> | undefined {
  return [...sent].reverse().find((s) => s.method === 'sendMessage')?.body;
}

beforeAll(async () => {
  server = createFakeTelegram();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  apiRoot = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  bot = createBot(
    { prisma, webAppUrl: 'https://navbat.example.com', apiRoot },
    TOKEN,
  );
  await bot.init();
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(async () => {
  await resetDb();
  sent = [];
});

/* ------------------------------------------------------------- buyruqlar */

describe('/start', () => {
  it('salomlashadi va Mini App tugmasini yuboradi', async () => {
    await bot.handleUpdate(textUpdate('/start', 500000001));

    const message = lastMessage();
    expect(message).toBeDefined();
    expect(message!.text).toContain('NAVBATga xush kelibsiz');
    expect(message!.text).toContain('Vaqtingiz yo‘qmi?');
    expect(message!.text).toContain('Bo‘sh vaqtingiz bormi?');

    const button = message!.reply_markup.inline_keyboard[0][0];
    expect(button.web_app.url).toBe('https://navbat.example.com/');
    expect(button.text).toContain('NAVBAT');
  });

  it('HTTPS bo‘lmasa oddiy URL tugmasi ishlatiladi (dev qulayligi)', async () => {
    const localBot = createBot(
      { prisma, webAppUrl: 'http://localhost:5173', apiRoot },
      TOKEN,
    );
    await localBot.init();
    sent = [];
    await localBot.handleUpdate(textUpdate('/start', 500000009));

    const button = lastMessage()!.reply_markup.inline_keyboard[0][0];
    expect(button.url).toBe('http://localhost:5173/');
    expect(button.web_app).toBeUndefined();
  });
});

describe('/balans', () => {
  it('ro‘yxatdan o‘tmagan foydalanuvchini Mini Appga yo‘naltiradi', async () => {
    await bot.handleUpdate(textUpdate('/balans', 500000002));
    expect(lastMessage()!.text).toContain('Avval Mini Appni oching');
  });

  it('balansni ko‘rsatadi', async () => {
    await prisma.user.create({
      data: {
        telegramId: BigInt(500000003),
        firstName: 'Ali',
        profile: { create: { availableBalance: 280000, pendingBalance: 50000, totalEarned: 1280000 } },
      },
    });

    await bot.handleUpdate(textUpdate('/balans', 500000003));

    const text = lastMessage()!.text as string;
    expect(text).toContain('280 000 UZS');
    expect(text).toContain('50 000 UZS');
    expect(text).toContain('1 280 000 UZS');
  });
});

describe('/topshiriqlar', () => {
  it('faol buyurtmalarni ro‘yxatlaydi', async () => {
    const buyer = await prisma.user.create({
      data: { telegramId: BigInt(500000004), firstName: 'Abdulaziz', profile: { create: {} } },
    });
    await prisma.order.create({
      data: {
        buyerId: buyer.id,
        category: 'DOCTOR',
        title: 'Kardiolog navbati',
        locationName: 'Chilonzor poliklinikasi',
        address: 'Bunyodkor 12',
        latitude: 41.2756,
        longitude: 69.2034,
        date: new Date('2026-08-20T00:00:00.000Z'),
        startTime: '14:30',
        endTime: '16:00',
        offeredAmount: 50000,
        platformFee: 5000,
        totalAmount: 55000,
        status: 'PUBLISHED',
      },
    });

    await bot.handleUpdate(textUpdate('/topshiriqlar', 500000004));

    const text = lastMessage()!.text as string;
    expect(text).toContain('Kardiolog navbati');
    expect(text).toContain('50 000 UZS');
    expect(text).toContain('14:30–16:00');
  });

  it('buyurtma bo‘lmasa tushunarli xabar beradi', async () => {
    await prisma.user.create({
      data: { telegramId: BigInt(500000005), firstName: 'Bo‘sh', profile: { create: {} } },
    });
    await bot.handleUpdate(textUpdate('/topshiriqlar', 500000005));
    expect(lastMessage()!.text).toContain('Hozircha faol topshiriq yo‘q');
  });
});

/* ------------------------------------------------------------- lokatsiya */

describe('lokatsiya / check-in', () => {
  it('/lokatsiya joylashuv so‘rash tugmasini yuboradi va maqsadini tushuntiradi', async () => {
    await bot.handleUpdate(textUpdate('/lokatsiya', 500000006));
    const message = lastMessage()!;
    expect(message.text).toContain('check-in');
    expect(message.reply_markup.keyboard[0][0].request_location).toBe(true);
  });

  it('faol topshiriq bo‘lmasa lokatsiya SAQLANMAYDI', async () => {
    await prisma.user.create({
      data: { telegramId: BigInt(500000007), firstName: 'Bekor', profile: { create: {} } },
    });

    await bot.handleUpdate(locationUpdate(500000007, 41.2756, 69.2034));

    expect(await prisma.checkIn.count()).toBe(0);
    expect(lastMessage()!.text).toContain('lokatsiya saqlanmadi');
  });

  it('bajarilayotgan topshiriqda check-in yozadi', async () => {
    const buyer = await prisma.user.create({
      data: { telegramId: BigInt(500000010), firstName: 'Buyurtmachi', profile: { create: {} } },
    });
    const worker = await prisma.user.create({
      data: { telegramId: BigInt(500000008), firstName: 'Ali', profile: { create: {} } },
    });
    const order = await prisma.order.create({
      data: {
        buyerId: buyer.id,
        category: 'DOCTOR',
        title: 'Kardiolog navbati',
        locationName: 'Chilonzor',
        address: 'Bunyodkor 12',
        latitude: 41.2756,
        longitude: 69.2034,
        date: new Date('2026-08-20T00:00:00.000Z'),
        startTime: '14:30',
        endTime: '16:00',
        offeredAmount: 50000,
        platformFee: 5000,
        totalAmount: 55000,
        status: 'IN_PROGRESS',
      },
    });
    await prisma.assignment.create({
      data: { orderId: order.id, workerId: worker.id, status: 'ACTIVE' },
    });

    await bot.handleUpdate(locationUpdate(500000008, 41.2757, 69.2035));

    const checkIns = await prisma.checkIn.findMany();
    expect(checkIns).toHaveLength(1);
    expect(checkIns[0].type).toBe('PERIODIC');
    expect(checkIns[0].latitude).toBeCloseTo(41.2757, 4);
    expect(checkIns[0].orderId).toBe(order.id);
    expect(lastMessage()!.text).toContain('Check-in qabul qilindi');
  });
});

/* --------------------------------------------------------------- boshqa */

describe('boshqa xabarlar', () => {
  it('oddiy matnga Mini App tugmasi bilan javob beradi', async () => {
    await bot.handleUpdate(textUpdate('salom', 500000011));
    const message = lastMessage()!;
    expect(message.text).toContain('Mini App ichida');
    expect(message.reply_markup.inline_keyboard[0][0].web_app.url).toBeTruthy();
  });

  it('/yordam buyruqlar ro‘yxatini beradi', async () => {
    await bot.handleUpdate(textUpdate('/yordam', 500000012));
    const text = lastMessage()!.text as string;
    expect(text).toContain('/balans');
    expect(text).toContain('/topshiriqlar');
    expect(text).toContain('davlat navbat tizimini almashtirmaydi');
  });
});

/* --------------------------------------------------------------- webhook */

describe('webhook xavfsizligi', () => {
  it('BOT_MODE=off bo‘lganda webhook yo‘li ochilmaydi', async () => {
    // Test muhitida BOT_MODE=off — Telegram yo'li mavjud emas
    const res = await request(app).post('/telegram/webhook').send({ update_id: 1 });
    expect(res.status).toBe(404);
  });

  it('healthcheck bot rejimini ko‘rsatadi', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.bot).toBe('off');
  });
});
