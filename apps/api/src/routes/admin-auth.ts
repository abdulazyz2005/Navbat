import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '@navbat/shared';
import { prisma } from '../lib/prisma.js';
import { createSessionToken } from '../lib/session.js';
import { authLimiter } from '../middleware/rate-limit.js';

/**
 * ADMIN PANELGA KIRISH
 * ------------------------------------------------------------------
 * Admin panel Telegramdan tashqarida (oddiy brauzerda) ochiladi, shuning uchun
 * initData yo'q. Kirish zanjiri:
 *
 *   1. Admin botga /admin yuboradi
 *   2. Bot faqat ADMIN foydalanuvchiga bir martalik kod bilan havola yuboradi
 *   3. Havola admin panelni ochadi va kodni shu endpointga almashtiradi
 *   4. Server 12 soatlik `scope='admin'` sessiya tokenini qaytaradi
 *
 * Kod bazada FAQAT SHA-256 hash ko'rinishida saqlanadi va bir marta ishlatiladi.
 */

export const adminAuthRouter = Router();

/** Admin sessiyasi qancha yashaydi */
export const ADMIN_SESSION_TTL_SEC = 12 * 60 * 60;

/** Kod qancha vaqt amal qiladi */
export const ADMIN_CODE_TTL_MS = 10 * 60 * 1000;

export function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

/** Chalkashmaydigan alifbo: 0/O va 1/I yo'q */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateCode(length = 8): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return out;
}

/** Bot chaqiradi: admin uchun yangi bir martalik kod yaratadi */
export async function issueAdminCode(userId: string): Promise<{ code: string; expiresAt: Date }> {
  // Eski ishlatilmagan kodlar bekor qilinadi — bir vaqtda faqat bittasi amal qiladi
  await prisma.adminLoginCode.deleteMany({ where: { userId, usedAt: null } });

  const code = generateCode();
  const expiresAt = new Date(Date.now() + ADMIN_CODE_TTL_MS);
  await prisma.adminLoginCode.create({
    data: { userId, codeHash: hashCode(code), expiresAt },
  });
  return { code, expiresAt };
}

const sessionSchema = z.object({ code: z.string().min(6).max(16) });

/** POST /api/admin/session — kodni admin sessiya tokeniga almashtiradi */
adminAuthRouter.post('/session', authLimiter, async (req, res, next) => {
  try {
    const { code } = sessionSchema.parse(req.body);

    const row = await prisma.adminLoginCode.findUnique({
      where: { codeHash: hashCode(code) },
      include: { user: true },
    });

    if (!row || row.usedAt || row.expiresAt < new Date()) {
      throw new AppError('ADMIN_CODE_INVALID', 401);
    }
    if (!row.user.isAdmin || row.user.isBanned) throw new AppError('ADMIN_ONLY', 403);

    // Bir martalik: atomar ravishda "ishlatilgan" deb belgilaymiz
    const used = await prisma.adminLoginCode.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (used.count === 0) throw new AppError('ADMIN_CODE_INVALID', 401);

    const token = createSessionToken(row.user.id, row.user.telegramId.toString(), {
      scope: 'admin',
      ttlSec: ADMIN_SESSION_TTL_SEC,
    });

    res.json({
      token,
      expiresIn: ADMIN_SESSION_TTL_SEC,
      admin: {
        id: row.user.id,
        firstName: row.user.firstName,
        username: row.user.username,
      },
    });
  } catch (error) {
    next(error);
  }
});
