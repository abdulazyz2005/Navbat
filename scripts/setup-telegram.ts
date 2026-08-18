/**
 * Telegram botni NAVBAT Mini Appga avtomatik ulaydi.
 *
 *   npm run setup:telegram
 *
 * Bajaradigan ishlar:
 *   1. Tokenni tekshiradi (getMe)
 *   2. Menyu tugmasini Mini Appga bog'laydi (setChatMenuButton)
 *   3. Buyruqlar ro'yxatini o'rnatadi (setMyCommands)
 *   4. Bot tavsifi va "about" matnini yozadi
 *   5. BOT_MODE ga qarab webhook o'rnatadi yoki o'chiradi
 *   6. Natijani tekshirib, havolani chiqaradi
 *
 * Bu @BotFather ichida qo'lda bosiladigan sozlamalarning HAMMASINI almashtiradi —
 * faqat botni yaratish (/newbot) qo'lda qilinadi.
 */
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

function loadRootEnv(): void {
  let dir = process.cwd();
  for (let depth = 0; depth < 5; depth += 1) {
    const candidate = path.join(dir, '.env');
    if (fs.existsSync(candidate)) {
      dotenv.config({ path: candidate });
      return;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
}
loadRootEnv();

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const PUBLIC_URL = (process.env.PUBLIC_URL ?? '').replace(/\/+$/, '');
const WEB_APP_URL = (process.env.WEB_APP_URL ?? PUBLIC_URL).replace(/\/+$/, '');
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';
const BOT_MODE = process.env.BOT_MODE ?? (PUBLIC_URL ? 'webhook' : 'polling');

const COMMANDS = [
  { command: 'start', description: 'NAVBATni ochish' },
  { command: 'balans', description: 'Balansim' },
  { command: 'topshiriqlar', description: 'Faol topshiriqlar' },
  { command: 'lokatsiya', description: 'Joylashuvni yuborish' },
  { command: 'yordam', description: 'Yordam' },
];

const DESCRIPTION =
  'NAVBAT — vaqtingiz yo‘q bo‘lsa, navbatda siz uchun kutadigan odam toping. ' +
  'Bo‘sh vaqtingiz bo‘lsa, boshqalar uchun navbat kutib pul ishlang. ' +
  'To‘lov xavfsiz saqlanadi va ish tugagandan keyin o‘tkaziladi.';

const SHORT_DESCRIPTION = 'Navbatda siz uchun kutadigan odam toping yoki navbat kutib pul ishlang.';

function fail(message: string): never {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

async function call<T = unknown>(method: string, body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });

  const payload = (await response.json()) as {
    ok: boolean;
    result?: T;
    description?: string;
    error_code?: number;
  };

  if (!payload.ok) {
    throw new Error(`${method}: ${payload.description ?? 'noma’lum xatolik'} (${payload.error_code})`);
  }
  return payload.result as T;
}

async function main(): Promise<void> {
  console.log('\n🔧 NAVBAT — Telegram sozlash\n');

  if (!TOKEN) {
    fail(
      'TELEGRAM_BOT_TOKEN topilmadi.\n\n' +
        '  1. Telegramda @BotFather ni oching\n' +
        '  2. /newbot → bot nomi va username kiriting\n' +
        '  3. Olingan tokenni .env fayliga yozing:\n' +
        '     TELEGRAM_BOT_TOKEN="123456789:AA..."',
    );
  }

  if (!WEB_APP_URL) {
    fail(
      'WEB_APP_URL (yoki PUBLIC_URL) topilmadi.\n\n' +
        '  Production: PUBLIC_URL="https://navbat-production.up.railway.app"\n' +
        '  Lokal test:  npm run tunnel → olingan HTTPS manzilni WEB_APP_URL ga yozing',
    );
  }

  if (!WEB_APP_URL.startsWith('https://')) {
    fail(
      `WEB_APP_URL HTTPS bo‘lishi shart. Hozirgi qiymat: ${WEB_APP_URL}\n\n` +
        '  Telegram Mini App faqat HTTPS manzilni ochadi.\n' +
        '  Lokal test uchun tunnel oching: npm run tunnel',
    );
  }

  /* ---------------------------------------------------------------- 1. getMe */
  const me = await call<{ id: number; username: string; first_name: string }>('getMe');
  console.log(`✅ Bot topildi: @${me.username} (${me.first_name})`);

  /* ------------------------------------------------------- 2. menyu tugmasi */
  await call('setChatMenuButton', {
    menu_button: { type: 'web_app', text: 'NAVBAT', web_app: { url: WEB_APP_URL } },
  });
  console.log(`✅ Menyu tugmasi Mini Appga bog‘landi: ${WEB_APP_URL}`);

  /* ------------------------------------------------------------ 3. buyruqlar */
  await call('setMyCommands', { commands: COMMANDS });
  console.log(`✅ Buyruqlar o‘rnatildi (${COMMANDS.length} ta)`);

  /* -------------------------------------------------------------- 4. tavsif */
  try {
    await call('setMyDescription', { description: DESCRIPTION });
    await call('setMyShortDescription', { short_description: SHORT_DESCRIPTION });
    console.log('✅ Bot tavsifi yozildi');
  } catch (error) {
    // Telegram bir xil matnni qayta yozishga ruxsat bermasligi mumkin — kritik emas
    console.log(`⚠️  Tavsifni yangilab bo‘lmadi: ${(error as Error).message}`);
  }

  /* -------------------------------------------------------------- 5. webhook */
  if (BOT_MODE === 'webhook') {
    if (!PUBLIC_URL.startsWith('https://')) {
      fail('BOT_MODE=webhook uchun PUBLIC_URL HTTPS bo‘lishi shart.');
    }
    if (!WEBHOOK_SECRET) {
      fail(
        'TELEGRAM_WEBHOOK_SECRET topilmadi.\n\n' +
          '  Yarating va .env ga qo‘shing:\n' +
          '    openssl rand -hex 24',
      );
    }

    const webhookUrl = `${PUBLIC_URL}/telegram/webhook`;
    await call('setWebhook', {
      url: webhookUrl,
      secret_token: WEBHOOK_SECRET,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: false,
    });

    const info = await call<{
      url: string;
      pending_update_count: number;
      last_error_message?: string;
    }>('getWebhookInfo');

    console.log(`✅ Webhook o‘rnatildi: ${info.url}`);
    if (info.last_error_message) {
      console.log(`⚠️  Telegramning oxirgi xatosi: ${info.last_error_message}`);
      console.log('   (server hali ko‘tarilmagan bo‘lsa, bu normal — keyin o‘tib ketadi)');
    }
  } else {
    await call('deleteWebhook', { drop_pending_updates: false });
    console.log('✅ Webhook o‘chirildi (long polling rejimi)');
  }

  /* --------------------------------------------------------------- natija */
  console.log('\n─────────────────────────────────────────────');
  console.log(`  Bot:      @${me.username}`);
  console.log(`  Havola:   https://t.me/${me.username}`);
  console.log(`  Mini App: ${WEB_APP_URL}`);
  console.log(`  Rejim:    ${BOT_MODE}`);
  console.log('─────────────────────────────────────────────');
  console.log('\nEndi Telegramda botni oching va /start yuboring 🚀\n');
}

main().catch((error: Error) => {
  if (error.message.includes('401')) {
    fail('Token noto‘g‘ri. @BotFather dan yangi token oling va .env ni yangilang.');
  }
  fail(error.message);
});
