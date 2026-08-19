import { InlineKeyboard, InputFile, type Bot } from 'grammy';
import { AppError, formatUZS } from '@navbat/shared';
import type { PaymentIntent } from '@prisma/client';
import { env } from '../env.js';
import { prisma } from '../lib/prisma.js';
import { issueAdminCode } from '../routes/admin-auth.js';
import { confirmIntentAndPublish } from './orders.js';
import {
  activeIntentOf,
  attachReceipt,
  getIntentOrThrow,
  rejectIntent,
} from './payment-intents.js';
import { formatCard } from './settings.js';
import { decideWithdrawal } from './withdrawals.js';

/**
 * BOTDAGI ADMIN AMALLARI
 * ------------------------------------------------------------------
 * Admin panelga kirmasdan, to'g'ridan-to'g'ri Telegramdagi tugmalar orqali:
 *   - kelgan to'lov chekini tasdiqlash / rad etish
 *   - pul chiqarish so'rovini "to'landi" deb belgilash
 *
 * Har bir callback qayta tekshiriladi: bosgan odam DB'da `isAdmin` bo'lishi shart.
 * Tugmani boshqa odamga uzatib yuborish ham foyda bermaydi.
 */

function isAdminTelegramId(telegramId?: number): boolean {
  if (!telegramId) return false;
  return env.ADMIN_TELEGRAM_IDS.includes(String(telegramId));
}

async function requireAdminUser(telegramId?: number) {
  if (!telegramId) return null;
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } });
  if (!user || !user.isAdmin || user.isBanned) return null;
  return user;
}

/* --------------------------------------------------- adminlarga xabar berish */

async function callTelegram(method: string, body: unknown): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (!env.isTest) console.warn(`[admin-bot] ${method} xatolik:`, error);
  }
}

function intentKeyboard(intentId: string) {
  return {
    inline_keyboard: [
      [
        { text: '✅ Pul keldi', callback_data: `pi:ok:${intentId}` },
        { text: '❌ Kelmadi', callback_data: `pi:no:${intentId}` },
      ],
      [{ text: '🖥 Admin panel', url: `${env.PUBLIC_URL || env.WEB_APP_URL}/admin` }],
    ],
  };
}

/** Chek yuborilganda barcha adminlarga rasm + tugmalar bilan xabar boradi */
export async function notifyAdminsAboutReceipt(intent: PaymentIntent): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: intent.userId } });
  const caption =
    `🧾 <b>Yangi to‘lov cheki</b>\n\n` +
    `Kim: ${user?.firstName ?? '—'}` +
    `${user?.username ? ` (@${user.username})` : ''}\n` +
    `Kelishi kerak: <b>${formatUZS(intent.expectedAmount)}</b>\n` +
    `Karta: <code>${formatCard(intent.cardNumber)}</code>\n` +
    `${intent.orderId ? 'Buyurtma uchun' : 'Balansni to‘ldirish'}`;

  for (const adminId of env.ADMIN_TELEGRAM_IDS) {
    if (intent.receiptFileId) {
      await callTelegram('sendPhoto', {
        chat_id: adminId,
        photo: intent.receiptFileId,
        caption,
        parse_mode: 'HTML',
        reply_markup: intentKeyboard(intent.id),
      });
    } else {
      await callTelegram('sendMessage', {
        chat_id: adminId,
        text: `${caption}\n\nChek admin panelda ko‘rinadi.`,
        parse_mode: 'HTML',
        reply_markup: intentKeyboard(intent.id),
      });
    }
  }
}

/** Pul chiqarish so'rovi kelganda adminlarga xabar */
export async function notifyAdminsAboutWithdrawal(withdrawalId: string): Promise<void> {
  const row = await prisma.withdrawal.findUnique({
    where: { id: withdrawalId },
    include: { worker: { include: { profile: true } } },
  });
  if (!row) return;

  const card = row.worker.profile?.cardNumber ?? row.account;
  const text =
    `💸 <b>Pul chiqarish so‘rovi</b>\n\n` +
    `Kim: ${row.worker.firstName}${row.worker.username ? ` (@${row.worker.username})` : ''}\n` +
    `Summa: <b>${formatUZS(row.amount)}</b>\n` +
    `Karta: <code>${formatCard(card)}</code>\n` +
    `${row.worker.profile?.cardHolder ?? ''}`;

  for (const adminId of env.ADMIN_TELEGRAM_IDS) {
    await callTelegram('sendMessage', {
      chat_id: adminId,
      text,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ To‘ladim', callback_data: `wd:ok:${row.id}` }],
          [{ text: '🖥 Admin panel', url: `${env.PUBLIC_URL || env.WEB_APP_URL}/admin` }],
        ],
      },
    });
  }
}

/* ----------------------------------------------------------- bot handlerlari */

export function registerBotExtensions(bot: Bot): void {
  /** /admin — admin panelga kirish uchun bir martalik kod va havola */
  bot.command('admin', async (ctx) => {
    const user = await requireAdminUser(ctx.from?.id);
    if (!user) {
      // Admin bo'lmaganlarga panel borligi ham bilinmaydi
      await ctx.reply('Noma’lum buyruq. /yordam');
      return;
    }

    const { code } = await issueAdminCode(user.id);
    const base = env.PUBLIC_URL || env.WEB_APP_URL;
    const link = `${base}/admin?code=${code}`;

    await ctx.reply(
      `🛠 <b>Admin panel</b>\n\n` +
        `Kirish kodi: <code>${code}</code>\n` +
        `Kod 10 daqiqa amal qiladi va bir marta ishlatiladi.`,
      {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard().url('Panelni ochish', link),
      },
    );
  });

  /**
   * Foydalanuvchi chekni rasm sifatida yuborsa — faol to'lovga biriktiriladi.
   * (Mini App orqali yuklash ham ishlaydi, bu qo'shimcha qulaylik.)
   */
  bot.on('message:photo', async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const user = await prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } });
    if (!user) return;

    const intent = await activeIntentOf(user.id);
    if (!intent) {
      await ctx.reply(
        'Hozircha tasdiqlanmagan to‘lov yo‘q. Avval ilovada to‘lovni boshlang.',
      );
      return;
    }
    if (intent.status === 'PENDING_REVIEW') {
      await ctx.reply('Chek allaqachon yuborilgan — tekshirilmoqda.');
      return;
    }

    const photo = ctx.message.photo.at(-1);
    if (!photo) return;

    try {
      const updated = await attachReceipt({
        intentId: intent.id,
        userId: user.id,
        fileId: photo.file_id,
      });
      await ctx.reply(
        `✅ Chek qabul qilindi.\n\nKutilayotgan summa: <b>${formatUZS(updated.expectedAmount)}</b>\n` +
          `Tasdiqlangach xabar beramiz.`,
        { parse_mode: 'HTML' },
      );
      void notifyAdminsAboutReceipt(updated);
    } catch (error) {
      const message = error instanceof AppError ? error.code : 'XATOLIK';
      await ctx.reply(`Chekni biriktirib bo‘lmadi (${message}).`);
    }
  });

  /** To'lovni tasdiqlash / rad etish */
  bot.callbackQuery(/^pi:(ok|no):(.+)$/, async (ctx) => {
    const admin = await requireAdminUser(ctx.from?.id);
    if (!admin || !isAdminTelegramId(ctx.from?.id)) {
      await ctx.answerCallbackQuery({ text: 'Ruxsat yo‘q', show_alert: true });
      return;
    }

    const [, action, intentId] = ctx.match as unknown as RegExpMatchArray;

    try {
      if (action === 'ok') {
        const result = await confirmIntentAndPublish(intentId, admin.id);
        await ctx.answerCallbackQuery({ text: 'Tasdiqlandi ✅' });
        await ctx.reply(
          `✅ ${formatUZS(result.credited)} balansga qo‘shildi.` +
            (result.publishedOrderId ? '\nBuyurtma e’lon qilindi.' : ''),
        );
      } else {
        await rejectIntent(intentId, admin.id, 'Pul kelmadi yoki summa mos emas');
        await ctx.answerCallbackQuery({ text: 'Rad etildi' });
        await ctx.reply('❌ To‘lov rad etildi, foydalanuvchiga xabar berildi.');
      }
      // Tugmalarni olib tashlaymiz — ikki marta bosilmasin
      await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);
    } catch (error) {
      const code = error instanceof AppError ? error.code : 'XATOLIK';
      await ctx.answerCallbackQuery({ text: code, show_alert: true });
    }
  });

  /** Pul chiqarish — "to'ladim" */
  bot.callbackQuery(/^wd:ok:(.+)$/, async (ctx) => {
    const admin = await requireAdminUser(ctx.from?.id);
    if (!admin || !isAdminTelegramId(ctx.from?.id)) {
      await ctx.answerCallbackQuery({ text: 'Ruxsat yo‘q', show_alert: true });
      return;
    }

    const [, withdrawalId] = ctx.match as unknown as RegExpMatchArray;
    try {
      const row = await decideWithdrawal(withdrawalId, 'COMPLETED');
      await ctx.answerCallbackQuery({ text: 'Belgilandi ✅' });
      await ctx.reply(`✅ ${formatUZS(row.amount)} to‘langan deb belgilandi.`);
      await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);
    } catch (error) {
      const code = error instanceof AppError ? error.code : 'XATOLIK';
      await ctx.answerCallbackQuery({ text: code, show_alert: true });
    }
  });
}

/** Testlar uchun: `InputFile` ishlatilmasa ham tip tekshiruvida kerak bo'ladi */
export type { InputFile };

/** Intent tasdiqlanganda foydalanuvchiga chek holati haqida xabar (ichki foydalanish) */
export async function notifyUserIntent(intentId: string, text: string): Promise<void> {
  const intent = await getIntentOrThrow(intentId);
  const user = await prisma.user.findUnique({ where: { id: intent.userId } });
  if (!user) return;
  await callTelegram('sendMessage', {
    chat_id: user.telegramId.toString(),
    text,
    parse_mode: 'HTML',
  });
}
