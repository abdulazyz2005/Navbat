import type { NotificationType } from '@navbat/shared';
import { env } from '../env.js';
import { prisma } from '../lib/prisma.js';

/**
 * Bildirishnomalar: DBga yoziladi + Telegram bot orqali yuboriladi.
 * Bot token yo'q bo'lsa (lokal dev) faqat DBga yoziladi — oqim buzilmaydi.
 */

interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  orderId?: string;
  /** Mini App ichida ochiladigan sahifa (deep link uchun) */
  deepLink?: string;
}

async function sendTelegramMessage(
  telegramId: bigint,
  text: string,
  deepLink?: string,
): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  try {
    const body: Record<string, unknown> = {
      chat_id: telegramId.toString(),
      text,
      parse_mode: 'HTML',
    };
    if (deepLink) {
      body.reply_markup = {
        inline_keyboard: [[{ text: 'Ochish', web_app: { url: `${env.WEB_APP_URL}${deepLink}` } }]],
      };
    }
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok && !env.isTest) {
      console.warn('[notify] telegram sendMessage muvaffaqiyatsiz:', res.status);
    }
  } catch (error) {
    if (!env.isTest) console.warn('[notify] telegram xatolik:', error);
  }
}

export async function notify(input: NotifyInput): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { telegramId: true },
  });

  await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      orderId: input.orderId ?? null,
    },
  });

  if (user) {
    void sendTelegramMessage(
      user.telegramId,
      `<b>${input.title}</b>\n${input.body}`,
      input.deepLink,
    );
  }
}

export async function notifyMany(inputs: NotifyInput[]): Promise<void> {
  for (const input of inputs) {
    await notify(input);
  }
}
