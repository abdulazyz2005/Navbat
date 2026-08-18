import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '@navbat/shared';
import { env } from '../env.js';
import { prisma } from '../lib/prisma.js';
import { createSessionToken } from '../lib/session.js';
import { InitDataError, verifyInitData, type TelegramUser } from '../lib/telegram-auth.js';
import { authLimiter } from '../middleware/rate-limit.js';

export const authRouter = Router();

const bodySchema = z.object({
  initData: z.string().min(1),
});

/**
 * POST /auth/telegram
 * Telegram initData'ni tekshiradi, foydalanuvchini yaratadi/yangilaydi va sessiya tokeni qaytaradi.
 *
 * XAVFSIZLIK: frontenddan kelgan user_id'ga ISHONILMAYDI — faqat imzolangan initData ichidagi user.
 */
authRouter.post('/telegram', authLimiter, async (req, res, next) => {
  try {
    const { initData } = bodySchema.parse(req.body);

    let tgUser: TelegramUser;

    if (env.ALLOW_INSECURE_AUTH && initData.startsWith('dev:')) {
      // Faqat lokal dev: `dev:{"id":1,"first_name":"Test"}`
      tgUser = JSON.parse(initData.slice(4)) as TelegramUser;
      if (typeof tgUser.id !== 'number') throw new AppError('INVALID_INIT_DATA', 401);
    } else {
      try {
        tgUser = verifyInitData(
          initData,
          env.TELEGRAM_BOT_TOKEN,
          env.INIT_DATA_MAX_AGE_SEC,
        ).user;
      } catch (error) {
        if (error instanceof InitDataError) throw new AppError('INVALID_INIT_DATA', 401);
        throw error;
      }
    }

    const telegramId = BigInt(tgUser.id);
    const isAdmin = env.ADMIN_TELEGRAM_IDS.includes(String(tgUser.id));

    const user = await prisma.user.upsert({
      where: { telegramId },
      create: {
        telegramId,
        firstName: tgUser.first_name,
        lastName: tgUser.last_name ?? null,
        username: tgUser.username ?? null,
        photoUrl: tgUser.photo_url ?? null,
        languageCode: tgUser.language_code ?? null,
        isAdmin,
        profile: { create: {} },
      },
      update: {
        firstName: tgUser.first_name,
        lastName: tgUser.last_name ?? null,
        username: tgUser.username ?? null,
        photoUrl: tgUser.photo_url ?? null,
        isAdmin,
      },
      include: { profile: true },
    });

    if (user.isBanned) throw new AppError('USER_BANNED', 403);

    // Eski foydalanuvchida profil bo'lmasa yaratamiz
    if (!user.profile) {
      await prisma.profile.create({ data: { userId: user.id } });
    }

    res.json({
      token: createSessionToken(user.id, user.telegramId.toString()),
      expiresIn: env.SESSION_TTL_SEC,
    });
  } catch (error) {
    next(error);
  }
});
