import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

/**
 * .env monorepo ildizida turadi, lekin bu ilova apps/api ichidan ishga tushadi.
 * Shuning uchun .env faylini yuqoriga qarab qidiramiz.
 */
function loadEnvFile(): void {
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
loadEnvFile();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Muhit o'zgaruvchisi topilmadi: ${name}. .env.example faylga qarang.`);
  }
  return value;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed)) throw new Error(`${name} butun son bo'lishi kerak`);
  return parsed;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw === 'true' || raw === '1';
}

const NODE_ENV = process.env.NODE_ENV ?? 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

/**
 * Servisning public bazaviy URL'i.
 * Bitta servis rejimida Mini App ham, API ham, webhook ham shu manzilda turadi.
 * Railway `RAILWAY_PUBLIC_DOMAIN` ni avtomatik beradi.
 */
const PUBLIC_URL = (
  process.env.PUBLIC_URL ??
  (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '')
).replace(/\/+$/, '');

function botMode(): 'webhook' | 'polling' | 'off' {
  const raw = process.env.BOT_MODE;
  if (raw === 'webhook' || raw === 'polling' || raw === 'off') return raw;
  if (!process.env.TELEGRAM_BOT_TOKEN) return 'off';
  // Standart: productionda webhook (bitta servis), lokalda bot alohida process
  return IS_PRODUCTION ? 'webhook' : 'off';
}

export const env = {
  NODE_ENV,
  isProduction: NODE_ENV === 'production',
  isTest: NODE_ENV === 'test',
  PORT: int('PORT', 3001),
  DATABASE_URL: required('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/navbat'),

  /**
   * Telegram bot token. initData imzosini tekshirish uchun MAJBURIY.
   * Hech qachon frontendga chiqmaydi.
   */
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ?? '',

  /** Sessiya tokenlarini imzolash uchun maxfiy kalit */
  SESSION_SECRET: process.env.SESSION_SECRET ?? 'navbat-dev-session-secret-change-me',

  /** Sessiya tokeni amal qilish muddati (sekund) */
  SESSION_TTL_SEC: int('SESSION_TTL_SEC', 60 * 60 * 24 * 7),

  /** Servisning public bazaviy URL'i (bitta servis rejimida hammasi shu yerda) */
  PUBLIC_URL,

  /** Mini App public URL — bot shu URL'ni ochadi */
  WEB_APP_URL:
    process.env.WEB_APP_URL ?? (PUBLIC_URL || 'http://localhost:5173'),

  /**
   * Qurilgan Mini App fayllarini shu server bersinmi?
   * Bitta servis rejimida (Railway) — ha. Alohida frontend hostingda — yo'q.
   */
  SERVE_WEB: bool('SERVE_WEB', IS_PRODUCTION),

  /** Bot shu processda ishlasinmi: webhook | polling | off */
  BOT_MODE: botMode(),

  /**
   * Telegram webhook'ni himoyalash uchun maxfiy so'z.
   * Telegram uni `X-Telegram-Bot-Api-Secret-Token` sarlavhasida qaytaradi.
   */
  TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET ?? '',

  /**
   * CORS uchun ruxsat etilgan originlar (vergul bilan).
   * Bitta servis rejimida frontend va API bir originda — PUBLIC_URL avtomatik qo'shiladi.
   */
  CORS_ORIGINS: [
    ...(process.env.CORS_ORIGINS ?? 'http://localhost:5173')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    ...(PUBLIC_URL ? [PUBLIC_URL] : []),
  ],

  /** Platforma komissiyasi foizi */
  PLATFORM_FEE_PERCENT: int('PLATFORM_FEE_PERCENT', 10),

  /** Minimal buyurtma summasi (UZS) */
  MIN_ORDER_AMOUNT: int('MIN_ORDER_AMOUNT', 10000),

  /**
   * Minimal pul yechish summasi (UZS).
   * Komissiya navbatchidan ushlanadi, shuning uchun bitta o'rtacha topshiriqdan
   * keyin ham pul yechish mumkin bo'lishi kerak.
   */
  MIN_WITHDRAWAL_AMOUNT: int('MIN_WITHDRAWAL_AMOUNT', 20000),

  /** initData qancha vaqt amal qiladi (sekund) */
  INIT_DATA_MAX_AGE_SEC: int('INIT_DATA_MAX_AGE_SEC', 86400),

  /** Admin Telegram ID'lari */
  ADMIN_TELEGRAM_IDS: (process.env.ADMIN_TELEGRAM_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  /** To'lov provayderi: mock | click | payme */
  PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER ?? 'mock',

  /**
   * DEV REJIMI: initData imzosi tekshirilmasin (faqat lokal test uchun).
   * Productionda HAR DOIM false.
   */
  ALLOW_INSECURE_AUTH: bool('ALLOW_INSECURE_AUTH', false) && NODE_ENV !== 'production',

  /** Check-in geofence radiusi (metr) — bundan uzoqda check-in ogohlantirish bilan yoziladi */
  CHECKIN_RADIUS_M: int('CHECKIN_RADIUS_M', 500),
};

if (env.isProduction) {
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new Error('Productionda TELEGRAM_BOT_TOKEN majburiy — initData imzosini tekshirish uchun.');
  }
  if (env.SESSION_SECRET === 'navbat-dev-session-secret-change-me') {
    throw new Error('Productionda SESSION_SECRET o‘zgartirilishi shart.');
  }
  if (env.BOT_MODE === 'webhook') {
    if (!env.PUBLIC_URL.startsWith('https://')) {
      throw new Error(
        'BOT_MODE=webhook uchun PUBLIC_URL HTTPS bo‘lishi shart (masalan https://navbat.up.railway.app).',
      );
    }
    if (!env.TELEGRAM_WEBHOOK_SECRET) {
      throw new Error(
        'BOT_MODE=webhook uchun TELEGRAM_WEBHOOK_SECRET majburiy. Yarating: openssl rand -hex 24',
      );
    }
  }
}

/** Telegram webhook uchun yo'l (secret sarlavhada tekshiriladi) */
export const TELEGRAM_WEBHOOK_PATH = '/telegram/webhook';
