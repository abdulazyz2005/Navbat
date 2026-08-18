import rateLimit from 'express-rate-limit';
import { ERROR_MESSAGES } from '@navbat/shared';
import { env } from '../env.js';

const payload = {
  error: { code: 'RATE_LIMITED', message: ERROR_MESSAGES.RATE_LIMITED },
};

const disabled = env.isTest;

function make(windowMs: number, max: number) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => disabled,
    keyGenerator: (req) => req.user?.id ?? req.ip ?? 'anon',
    handler: (_req, res) => {
      res.status(429).json(payload);
    },
  });
}

/** Umumiy API limiti */
export const generalLimiter = make(60_000, 240);

/** Auth — brute force'dan himoya */
export const authLimiter = make(60_000, 30);

/** Yozuv amallari (buyurtma yaratish, xabar yuborish) */
export const writeLimiter = make(60_000, 60);
