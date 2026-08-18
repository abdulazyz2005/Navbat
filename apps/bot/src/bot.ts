import type { PrismaClient } from '@prisma/client';
import { Bot, InlineKeyboard, Keyboard } from 'grammy';
import { formatUZS } from '@navbat/shared';

/**
 * NAVBAT Telegram bot.
 *
 * Bu modul botni FAQAT quradi — ishga tushirish (polling yoki webhook)
 * chaqiruvchi tomonda hal qilinadi:
 *   - `apps/bot/src/index.ts`  → alohida process, long polling (dev)
 *   - `apps/api/src/telegram.ts` → API bilan bir processda, webhook (production)
 */

export interface BotDeps {
  prisma: PrismaClient;
  /** Mini App public URL (HTTPS bo'lishi shart) */
  webAppUrl: string;
  /**
   * Telegram Bot API manzili. Faqat testlarda o'zgartiriladi
   * (soxta API serverga yo'naltirish uchun).
   */
  apiRoot?: string;
}

export const BOT_COMMANDS = [
  { command: 'start', description: 'NAVBATni ochish' },
  { command: 'balans', description: 'Balansim' },
  { command: 'topshiriqlar', description: 'Faol topshiriqlar' },
  { command: 'lokatsiya', description: 'Joylashuvni yuborish' },
  { command: 'yordam', description: 'Yordam' },
];

export function createBot({ prisma, webAppUrl, apiRoot }: BotDeps, token: string): Bot {
  const bot = new Bot(token, apiRoot ? { client: { apiRoot } } : undefined);

  /**
   * Mini App tugmasi.
   * Telegram `web_app` tugmasi uchun HTTPS talab qiladi — lokal `http://localhost`
   * bo'lganda oddiy URL tugmasi qaytariladi (dev qulayligi uchun).
   */
  function miniApp(path = '/', label = '🚀 NAVBATni ochish'): InlineKeyboard {
    const url = `${webAppUrl}${path}`;
    return url.startsWith('https://')
      ? new InlineKeyboard().webApp(label, url)
      : new InlineKeyboard().url(label, url);
  }

  bot.command('start', async (ctx) => {
    const name = ctx.from?.first_name ?? 'Do‘stim';
    await ctx.reply(
      `<b>NAVBATga xush kelibsiz, ${name}!</b>\n\n` +
        `⏳ <b>Vaqtingiz yo‘qmi?</b>\n` +
        `Navbatda siz uchun kutadigan odam toping.\n\n` +
        `💰 <b>Bo‘sh vaqtingiz bormi?</b>\n` +
        `Boshqalar uchun navbat kutib pul ishlang.\n\n` +
        `Boshlash uchun pastdagi tugmani bosing 👇`,
      { parse_mode: 'HTML', reply_markup: miniApp('/') },
    );
  });

  bot.command(['yordam', 'help'], async (ctx) => {
    await ctx.reply(
      `<b>NAVBAT — yordam</b>\n\n` +
        `/start — Mini Appni ochish\n` +
        `/balans — balansingizni ko‘rish\n` +
        `/topshiriqlar — faol topshiriqlaringiz\n` +
        `/lokatsiya — joylashuvni yuborish (check-in uchun)\n\n` +
        `Buyurtmachi bilan yozishish uchun ilova ichidagi chatdan foydalaning.\n\n` +
        `<i>NAVBAT davlat navbat tizimini almashtirmaydi — u faqat ikki fuqaro ` +
        `o‘rtasidagi qonuniy xizmat kelishuvini tashkil qiladi.</i>`,
      { parse_mode: 'HTML', reply_markup: miniApp('/') },
    );
  });

  bot.command('balans', async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) },
      include: { profile: true },
    });

    if (!user?.profile) {
      await ctx.reply('Avval Mini Appni oching — hisobingiz avtomatik yaratiladi.', {
        reply_markup: miniApp('/'),
      });
      return;
    }

    await ctx.reply(
      `<b>💰 Balans</b>\n\n` +
        `Mavjud: <b>${formatUZS(user.profile.availableBalance)}</b>\n` +
        `Escrowda kutilmoqda: ${formatUZS(user.profile.pendingBalance)}\n` +
        `Jami ishlab topilgan: ${formatUZS(user.profile.totalEarned)}`,
      { parse_mode: 'HTML', reply_markup: miniApp('/balance', '💰 Balansni ochish') },
    );
  });

  bot.command('topshiriqlar', async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const user = await prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } });
    if (!user) {
      await ctx.reply('Avval Mini Appni oching.', { reply_markup: miniApp('/') });
      return;
    }

    const orders = await prisma.order.findMany({
      where: {
        status: { in: ['PUBLISHED', 'MATCHED', 'IN_PROGRESS', 'COMPLETION_PENDING'] },
        OR: [
          { buyerId: user.id },
          { assignments: { some: { workerId: user.id, status: 'ACTIVE' } } },
        ],
      },
      orderBy: { date: 'asc' },
      take: 10,
    });

    if (orders.length === 0) {
      await ctx.reply('Hozircha faol topshiriq yo‘q.', { reply_markup: miniApp('/') });
      return;
    }

    const lines = orders.map(
      (order) =>
        `• <b>${order.title}</b>\n  ${order.date.toISOString().slice(0, 10)} · ` +
        `${order.startTime}–${order.endTime} · ${formatUZS(order.offeredAmount)}`,
    );

    await ctx.reply(`<b>📋 Faol topshiriqlar</b>\n\n${lines.join('\n')}`, {
      parse_mode: 'HTML',
      reply_markup: miniApp('/'),
    });
  });

  /**
   * Lokatsiya — proof-of-presence uchun.
   * Foydalanuvchi ruxsatisiz lokatsiya YIG'ILMAYDI: u o'zi tugma orqali yuboradi.
   */
  bot.command('lokatsiya', async (ctx) => {
    await ctx.reply(
      'Joylashuvingizni yuborish uchun pastdagi tugmani bosing.\n\n' +
        'Lokatsiya faqat topshiriqni bajarayotganingizni tasdiqlash (check-in) uchun ' +
        'ishlatiladi va boshqa hech qayerda saqlanmaydi.',
      {
        reply_markup: new Keyboard().requestLocation('📍 Joylashuvni yuborish').resized().oneTime(),
      },
    );
  });

  bot.on('message:location', async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const user = await prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } });
    if (!user) return;

    const assignment = await prisma.assignment.findFirst({
      where: { workerId: user.id, status: 'ACTIVE', order: { status: 'IN_PROGRESS' } },
      include: { order: true },
      orderBy: { acceptedAt: 'desc' },
    });

    if (!assignment) {
      await ctx.reply('Hozirda bajarilayotgan topshiriq yo‘q — lokatsiya saqlanmadi.', {
        reply_markup: { remove_keyboard: true },
      });
      return;
    }

    await prisma.checkIn.create({
      data: {
        orderId: assignment.orderId,
        workerId: user.id,
        type: 'PERIODIC',
        latitude: ctx.message.location.latitude,
        longitude: ctx.message.location.longitude,
      },
    });

    await ctx.reply(`✅ Check-in qabul qilindi: <b>${assignment.order.title}</b>`, {
      parse_mode: 'HTML',
      reply_markup: { remove_keyboard: true },
    });
  });

  // Boshqa har qanday xabar — foydalanuvchini Mini Appga yo'naltiramiz
  bot.on('message:text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return;
    await ctx.reply('Barcha amallar Mini App ichida bajariladi 👇', {
      reply_markup: miniApp('/'),
    });
  });

  bot.catch((err) => {
    console.error('[navbat-bot] xatolik:', err.message);
  });

  return bot;
}
