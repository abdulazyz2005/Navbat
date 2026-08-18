import crypto from 'node:crypto';

/**
 * Telegram WebApp initData validatsiyasi.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * MUHIM: frontenddan kelgan user_id'ga hech qachon ko'r-ko'rona ishonilmaydi.
 * Faqat shu funksiya qaytargan `user` obyektiga ishoniladi.
 */

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
  is_premium?: boolean;
}

export interface VerifiedInitData {
  user: TelegramUser;
  authDate: number;
  queryId?: string;
  startParam?: string;
}

export class InitDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InitDataError';
  }
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * initData qatorini tekshiradi va foydalanuvchini qaytaradi.
 * @param initData Telegram.WebApp.initData (raw query string)
 * @param botToken bot tokeni
 * @param maxAgeSec auth_date qancha vaqt amal qiladi
 */
export function verifyInitData(
  initData: string,
  botToken: string,
  maxAgeSec = 86400,
): VerifiedInitData {
  if (!initData) throw new InitDataError('initData bo‘sh');
  if (!botToken) throw new InitDataError('bot token sozlanmagan');

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) throw new InitDataError('hash yo‘q');

  params.delete('hash');

  /**
   * MUHIM: data-check-string'ga `hash`dan BOSHQA hamma maydon kiradi —
   * shu jumladan yangi mijozlar yuboradigan `signature` (Ed25519 imzo) ham.
   * `signature` faqat uchinchi tomon tekshiruvida (public key) chiqarib tashlanadi.
   * Uni HMAC hisobidan olib tashlash Telegram Web va yangi ilovalarda
   * "imzo mos kelmadi" xatosini beradi.
   */
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();

  const hmacOf = (entries: [string, string][]): string =>
    crypto
      .createHmac('sha256', secretKey)
      .update(
        entries
          .map(([key, value]) => `${key}=${value}`)
          .sort()
          .join('\n'),
      )
      .digest('hex');

  const entries = [...params.entries()];
  let matched = timingSafeEqualHex(hmacOf(entries), hash);

  // Zaxira: `signature`ni hisobga olmaydigan mijozlar bilan moslik uchun
  if (!matched && params.has('signature')) {
    matched = timingSafeEqualHex(hmacOf(entries.filter(([key]) => key !== 'signature')), hash);
  }

  if (!matched) {
    throw new InitDataError('imzo mos kelmadi');
  }

  const authDateRaw = params.get('auth_date');
  if (!authDateRaw) throw new InitDataError('auth_date yo‘q');
  const authDate = Number.parseInt(authDateRaw, 10);
  if (!Number.isInteger(authDate)) throw new InitDataError('auth_date noto‘g‘ri');

  const ageSec = Math.floor(Date.now() / 1000) - authDate;
  if (ageSec > maxAgeSec) throw new InitDataError('initData muddati o‘tgan');

  const userRaw = params.get('user');
  if (!userRaw) throw new InitDataError('user yo‘q');

  let user: TelegramUser;
  try {
    user = JSON.parse(userRaw) as TelegramUser;
  } catch {
    throw new InitDataError('user JSON noto‘g‘ri');
  }
  if (typeof user.id !== 'number' || !user.first_name) {
    throw new InitDataError('user maydonlari to‘liq emas');
  }

  return {
    user,
    authDate,
    queryId: params.get('query_id') ?? undefined,
    startParam: params.get('start_param') ?? undefined,
  };
}

/** Test/seed uchun to'g'ri imzolangan initData yaratadi. */
export function signInitData(user: TelegramUser, botToken: string, authDate?: number): string {
  const params = new URLSearchParams();
  params.set('user', JSON.stringify(user));
  params.set('auth_date', String(authDate ?? Math.floor(Date.now() / 1000)));
  params.set('query_id', `AA${crypto.randomBytes(6).toString('hex')}`);

  const dataCheckString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  params.set('hash', hash);
  return params.toString();
}
