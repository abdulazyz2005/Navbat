import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express, { Router } from 'express';
import helmet from 'helmet';
import { webhookCallback } from 'grammy';
import { TELEGRAM_WEBHOOK_PATH, env } from './env.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { generalLimiter } from './middleware/rate-limit.js';
import { adminRouter } from './routes/admin.js';
import { adminAuthRouter } from './routes/admin-auth.js';
import { authRouter } from './routes/auth.js';
import { availabilityRouter } from './routes/availability.js';
import { balanceRouter, withdrawalsRouter } from './routes/balance.js';
import { disputesRouter } from './routes/disputes.js';
import { notificationsRouter } from './routes/notifications.js';
import { ordersRouter } from './routes/orders.js';
import { paymentsRouter } from './routes/payments.js';
import { usersRouter } from './routes/users.js';
import { getBot, webhookGuard } from './telegram.js';

/**
 * Qurilgan Mini App papkasi.
 * `apps/api/src/app.ts` va `apps/api/dist/app.js` — ikkalasi ham `apps/web/dist` ga chiqadi.
 */
const WEB_DIST = fileURLToPath(new URL('../../web/dist', import.meta.url));

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // Mini App Telegram WebView ichida ochiladi — CSP'ni o'zimiz boshqaramiz
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      // Telegram iframe ichida ochishi uchun
      crossOriginEmbedderPolicy: false,
      frameguard: false,
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        // Telegram WebView ba'zan Origin yubormaydi
        if (!origin) return callback(null, true);
        if (env.CORS_ORIGINS.includes('*') || env.CORS_ORIGINS.includes(origin)) {
          return callback(null, true);
        }
        callback(new Error('CORS: ruxsat etilmagan origin'));
      },
      credentials: false,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Token'],
    }),
  );

  /**
   * JSON body cheklovi — katta payload hujumlaridan himoya.
   * Chek rasmi uchun alohida, kattaroq chegara (rasm base64 bo'lib keladi).
   */
  app.use('/api/payments/intents/:id/receipt', express.json({ limit: '3mb' }));
  app.use(express.json({ limit: '256kb' }));

  /* ------------------------------------------------------- telegram webhook */

  // Webhook rate limiterdan OLDIN turadi — Telegram yangiliklari cheklanmasligi kerak.
  // Himoya: `X-Telegram-Bot-Api-Secret-Token` sarlavhasi grammY tomonidan tekshiriladi.
  if (env.BOT_MODE === 'webhook') {
    const bot = getBot();
    if (bot) {
      app.post(
        TELEGRAM_WEBHOOK_PATH,
        webhookGuard,
        webhookCallback(bot, 'express', {
          secretToken: env.TELEGRAM_WEBHOOK_SECRET,
          onTimeout: 'return',
          timeoutMilliseconds: 8_000,
        }),
      );
    }
  }

  /* ------------------------------------------------------------- xizmat yo'llari */

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'navbat',
      env: env.NODE_ENV,
      bot: env.BOT_MODE,
      web: env.SERVE_WEB,
    });
  });

  /* ------------------------------------------------------------------- API */

  const api = Router();
  api.use(generalLimiter);

  api.get('/config', (_req, res) => {
    res.json({
      platformFeePercent: env.PLATFORM_FEE_PERCENT,
      minOrderAmount: env.MIN_ORDER_AMOUNT,
      minWithdrawalAmount: env.MIN_WITHDRAWAL_AMOUNT,
      paymentProvider: env.PAYMENT_PROVIDER,
      /** To'lov usuli: karta-karta o'tkazma + admin tasdig'i */
      paymentMode: 'card',
    });
  });

  api.use('/auth', authRouter);
  api.use('/users', usersRouter);
  api.use('/orders', ordersRouter);
  api.use('/availability', availabilityRouter);
  api.use('/payments', paymentsRouter);
  api.use('/balance', balanceRouter);
  api.use('/withdrawals', withdrawalsRouter);
  api.use('/disputes', disputesRouter);
  api.use('/notifications', notificationsRouter);
  // Login endpointi guarddan OLDIN turadi (kod tokenga almashtiriladi)
  api.use('/admin', adminAuthRouter);
  api.use('/admin', adminRouter);

  // Noma'lum API yo'li — SPA fallbackka tushmasligi kerak
  api.use(notFoundHandler);

  app.use('/api', api);

  /* --------------------------------------------------------- Mini App (SPA) */

  if (env.SERVE_WEB) {
    if (!fs.existsSync(path.join(WEB_DIST, 'index.html'))) {
      console.warn(
        `[navbat] SERVE_WEB=true, lekin qurilgan frontend topilmadi: ${WEB_DIST}\n` +
          '  Avval `npm run build` bajaring.',
      );
    } else {
      // Hashlangan asset'lar uzoq keshlanadi, index.html — hech qachon
      app.use(
        express.static(WEB_DIST, {
          index: false,
          setHeaders(res, filePath) {
            if (filePath.endsWith('index.html')) {
              res.setHeader('Cache-Control', 'no-cache');
            } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
              res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            }
          },
        }),
      );

      /**
       * IKKI ALOHIDA ILOVA:
       *   /admin*  -> admin.html  (brauzerdagi admin panel)
       *   qolgani  -> index.html  (Telegram Mini App)
       *
       * Ular alohida bundle: Mini App kodida admin panelining bironta ham
       * komponenti yoki so'rovi yo'q.
       */
      const ADMIN_HTML = path.join(WEB_DIST, 'admin.html');
      const hasAdminHtml = fs.existsSync(ADMIN_HTML);

      app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api') || req.path.startsWith('/telegram')) return next();
        res.setHeader('Cache-Control', 'no-cache');
        if (hasAdminHtml && (req.path === '/admin' || req.path.startsWith('/admin/'))) {
          res.sendFile(ADMIN_HTML);
          return;
        }
        res.sendFile(path.join(WEB_DIST, 'index.html'));
      });
    }
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
