import crypto from 'node:crypto';
import { env } from '../env.js';

/**
 * Stateless sessiya tokeni: base64url(payload).base64url(hmac)
 * Tashqi JWT kutubxonasiga ehtiyoj yo'q — payload kichik va faqat server imzolaydi.
 */

interface SessionPayload {
  /** internal user id (uuid) */
  sub: string;
  /** telegram id — audit uchun */
  tg: string;
  /** issued at (sec) */
  iat: number;
  /** expires at (sec) */
  exp: number;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(data: string): string {
  return crypto.createHmac('sha256', env.SESSION_SECRET).update(data).digest('base64url');
}

export function createSessionToken(userId: string, telegramId: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: userId,
    tg: telegramId,
    iat: now,
    exp: now + env.SESSION_TTL_SEC,
  };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, signature] = parts;

  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number') return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
