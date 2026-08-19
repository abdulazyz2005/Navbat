import type { NextFunction, Request, Response } from 'express';
import { AppError } from '@navbat/shared';
import { prisma } from '../lib/prisma.js';
import { verifySessionToken, type SessionScope } from '../lib/session.js';

export interface AuthUser {
  id: string;
  telegramId: bigint;
  firstName: string;
  isAdmin: boolean;
  isBanned: boolean;
  /** Token qaysi interfeysdan berilgan: Mini App yoki admin panel */
  scope: SessionScope;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function extractToken(req: Request): string | null {
  const header = req.header('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  const alt = req.header('x-session-token');
  return alt ? alt.trim() : null;
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractToken(req);
    if (!token) throw new AppError('UNAUTHORIZED', 401);

    const payload = verifySessionToken(token);
    if (!payload) throw new AppError('UNAUTHORIZED', 401);

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, telegramId: true, firstName: true, isAdmin: true, isBanned: true },
    });
    if (!user) throw new AppError('UNAUTHORIZED', 401);
    if (user.isBanned) throw new AppError('USER_BANNED', 403);

    req.user = { ...user, scope: payload.scp ?? 'app' };
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Admin endpointlari FAQAT admin panel sessiyasi bilan ochiladi.
 * Mini App tokeni (scope='app') admin bo'lsa ham rad etiladi —
 * shu tufayli foydalanuvchi interfeysida admin imkoniyatlari umuman yo'q.
 */
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) return next(new AppError('UNAUTHORIZED', 401));
  if (!req.user.isAdmin) return next(new AppError('ADMIN_ONLY', 403));
  if (req.user.scope !== 'admin') return next(new AppError('ADMIN_SESSION_REQUIRED', 403));
  next();
}

/** Controller ichida foydalanuvchini xavfsiz olish */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw new AppError('UNAUTHORIZED', 401);
  return req.user;
}
