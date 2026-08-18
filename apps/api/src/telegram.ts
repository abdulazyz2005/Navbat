import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Bot } from 'grammy';
import { createBot } from '@navbat/bot';
import { env } from './env.js';
import { prisma } from './lib/prisma.js';

/**
 * Bot API bilan BIR PROCESSDA ishlaydi (bitta servis rejimi).
 *
 * - `BOT_MODE=webhook`  → Telegram yangiliklarni `/telegram/webhook` ga POST qiladi
 * - `BOT_MODE=polling`  → shu process Telegramdan yangiliklarni o'zi so'rab turadi
 * - `BOT_MODE=off`      → bot bu processda ishlamaydi (alohida `apps/bot` ishlatiladi)
 */

let bot: Bot | null = null;

export function getBot(): Bot | null {
  if (env.BOT_MODE === 'off' || !env.TELEGRAM_BOT_TOKEN) return null;
  if (!bot) {
    bot = createBot({ prisma, webAppUrl: env.WEB_APP_URL }, env.TELEGRAM_BOT_TOKEN);
  }
  return bot;
}

/**
 * Webhook rejimida `bot.init()` chaqirilishi shart (grammY talabi).
 * Telegram vaqtincha yetib bo'lmasa, orqa fonda qayta urinadi —
 * bu vaqtda webhook 503 qaytaradi va API/Mini App ishlashda davom etadi.
 */
export async function initBot(retries = 5): Promise<Bot | null> {
  const instance = getBot();
  if (!instance) return null;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await instance.init();
      return instance;
    } catch (error) {
      const waitMs = Math.min(30_000, 2 ** attempt * 1000);
      console.error(
        `[navbat] Bot init muvaffaqiyatsiz (${attempt}/${retries}): ${(error as Error).message}. ` +
          `${waitMs / 1000}s dan keyin qayta urinamiz.`,
      );
      if (attempt === retries) return null;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  return null;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Webhookni himoyalovchi middleware.
 *
 * grammY ham secret tokenni tekshiradi, lekin biz uni OLDINROQ tekshiramiz:
 *   - noto'g'ri so'rov grammYgacha yetib bormaydi
 *   - bot hali init bo'lmagan bo'lsa, so'rov osilib qolmaydi (503 qaytaradi)
 */
export function webhookGuard(req: Request, res: Response, next: NextFunction): void {
  const provided = req.header('x-telegram-bot-api-secret-token') ?? '';
  if (!env.TELEGRAM_WEBHOOK_SECRET || !safeEqual(provided, env.TELEGRAM_WEBHOOK_SECRET)) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid secret token' } });
    return;
  }

  const instance = getBot();
  if (!instance?.isInited()) {
    res.setHeader('Retry-After', '10');
    res.status(503).json({ error: { code: 'BOT_NOT_READY', message: 'Bot is starting' } });
    return;
  }

  next();
}
