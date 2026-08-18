import { createApp } from './app.js';
import { TELEGRAM_WEBHOOK_PATH, env } from './env.js';
import { prisma } from './lib/prisma.js';
import { expireStaleOrders } from './services/orders.js';
import { getBot, initBot } from './telegram.js';

const app = createApp();

const server = app.listen(env.PORT, async () => {
  console.log(`[navbat] http://localhost:${env.PORT} (${env.NODE_ENV})`);
  console.log(`[navbat] API:      /api`);
  console.log(`[navbat] Mini App: ${env.SERVE_WEB ? 'shu serverdan beriladi' : 'alohida hosting'}`);
  console.log(`[navbat] To'lov:   ${env.PAYMENT_PROVIDER}`);

  if (!env.TELEGRAM_BOT_TOKEN) {
    console.warn(
      "[navbat] OGOHLANTIRISH: TELEGRAM_BOT_TOKEN yo'q — initData tekshiruvi ishlamaydi.",
    );
  }

  await startBot();
});

async function startBot(): Promise<void> {
  if (env.BOT_MODE === 'off') {
    console.log('[navbat] Bot: o‘chirilgan (BOT_MODE=off)');
    return;
  }

  try {
    if (env.BOT_MODE === 'webhook') {
      const bot = await initBot();
      if (!bot) {
        console.error(
          '[navbat] Bot ishga tushmadi — API va Mini App ishlashda davom etadi.\n' +
            '  Tokenni va tarmoqni tekshiring, so‘ng servisni qayta ishga tushiring.',
        );
        return;
      }
      const url = `${env.PUBLIC_URL}${TELEGRAM_WEBHOOK_PATH}`;
      await bot.api.setWebhook(url, {
        secret_token: env.TELEGRAM_WEBHOOK_SECRET,
        allowed_updates: ['message', 'callback_query'],
      });
      console.log(`[navbat] Bot: @${bot.botInfo.username} (webhook)`);
      console.log(`[navbat] Webhook: ${url}`);
      console.log(`[navbat] Havola: https://t.me/${bot.botInfo.username}`);
      return;
    }

    // polling
    const bot = getBot();
    if (!bot) return;
    await bot.api.deleteWebhook({ drop_pending_updates: false });
    void bot.start({
      onStart: (info) => {
        console.log(`[navbat] Bot: @${info.username} (long polling)`);
        console.log(`[navbat] Havola: https://t.me/${info.username}`);
      },
    });
  } catch (error) {
    // Bot ishga tushmasa ham API va Mini App ishlashda davom etadi
    console.error('[navbat] Botni ishga tushirib bo‘lmadi:', error);
  }
}

// Muddati o'tgan buyurtmalarni har soatda tozalash
const expiryTimer = setInterval(
  () => {
    expireStaleOrders().catch((error) => console.error('[navbat] expire xatolik:', error));
  },
  60 * 60 * 1000,
);

async function shutdown(signal: string) {
  console.log(`[navbat] ${signal} — to‘xtatilmoqda...`);
  clearInterval(expiryTimer);
  server.close();
  if (env.BOT_MODE === 'polling') {
    await getBot()?.stop();
  }
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
