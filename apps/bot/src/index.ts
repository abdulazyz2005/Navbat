import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { BOT_COMMANDS, createBot } from './bot.js';
import { loadRootEnv } from './config.js';

/**
 * Botni ALOHIDA process sifatida long polling rejimida ishga tushiradi.
 *
 * Bu rejim lokal ishlab chiqish uchun qulay (webhook / HTTPS kerak emas).
 * Productionda bot API bilan bir processda webhook orqali ishlaydi —
 * `apps/api/src/telegram.ts` ga qarang.
 *
 * Eslatma: yuqoridagi importlar env o'qimaydi, shuning uchun `loadRootEnv()`
 * ni modul tanasida chaqirish xavfsiz.
 */
loadRootEnv();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const WEB_APP_URL = process.env.WEB_APP_URL ?? 'http://localhost:5173';
const DATABASE_URL = process.env.DATABASE_URL ?? '';

if (!BOT_TOKEN) {
  console.error(
    '\n[navbat-bot] TELEGRAM_BOT_TOKEN topilmadi.\n' +
      '  1. Telegramda @BotFather ni oching\n' +
      '  2. /newbot buyrug‘ini yuboring\n' +
      '  3. Olingan tokenni .env fayliga yozing:\n' +
      '     TELEGRAM_BOT_TOKEN="123456789:AA..."\n',
  );
  process.exit(1);
}

if (!WEB_APP_URL.startsWith('https://')) {
  console.warn(
    '[navbat-bot] OGOHLANTIRISH: WEB_APP_URL HTTPS emas. ' +
      'Telegram Mini App tugmasi faqat HTTPS bilan ishlaydi.\n' +
      '  Lokal test uchun tunnel oching: npm run tunnel',
  );
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) });
const bot = createBot({ prisma, webAppUrl: WEB_APP_URL }, BOT_TOKEN);

async function main(): Promise<void> {
  const me = await bot.api.getMe();

  // Polling rejimida webhook o'chirilgan bo'lishi kerak
  await bot.api.deleteWebhook({ drop_pending_updates: false });
  await bot.api.setMyCommands(BOT_COMMANDS);

  console.log(`[navbat-bot] @${me.username} ishga tushdi (long polling)`);
  console.log(`[navbat-bot] Mini App: ${WEB_APP_URL}`);
  console.log(`[navbat-bot] Havola:   https://t.me/${me.username}`);

  await bot.start();
}

async function shutdown(): Promise<void> {
  await bot.stop();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

main().catch((error) => {
  console.error('[navbat-bot] ishga tushmadi:', error);
  process.exit(1);
});
