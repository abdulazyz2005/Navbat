import { prisma } from '../lib/prisma.js';

/**
 * Sozlamalar — admin panelidan o'zgartiriladigan qiymatlar.
 * Deploy qilmasdan karta raqamini almashtirish uchun DBda saqlanadi.
 */

export const SETTING_KEYS = {
  cardNumber: 'payout.card_number',
  cardHolder: 'payout.card_holder',
  cardBank: 'payout.card_bank',
  supportUsername: 'support.username',
} as const;

export interface PlatformCard {
  cardNumber: string;
  cardHolder: string;
  bank: string;
}

/** Bo'sh string = sozlanmagan */
export async function getSetting(key: string): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? '';
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export async function getPlatformCard(): Promise<PlatformCard | null> {
  const [cardNumber, cardHolder, bank] = await Promise.all([
    getSetting(SETTING_KEYS.cardNumber),
    getSetting(SETTING_KEYS.cardHolder),
    getSetting(SETTING_KEYS.cardBank),
  ]);
  if (!cardNumber) return null;
  return { cardNumber, cardHolder, bank };
}

export async function setPlatformCard(card: PlatformCard): Promise<void> {
  await setSetting(SETTING_KEYS.cardNumber, card.cardNumber);
  await setSetting(SETTING_KEYS.cardHolder, card.cardHolder);
  await setSetting(SETTING_KEYS.cardBank, card.bank);
}

/** 8600123412341234 -> "8600 1234 1234 1234" */
export function formatCard(cardNumber: string): string {
  return cardNumber.replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ');
}

/** Chekda va xabarlarda karta to'liq ko'rsatilmaydigan joylar uchun */
export function maskCard(cardNumber: string): string {
  const digits = cardNumber.replace(/\D/g, '');
  if (digits.length < 8) return '****';
  return `${digits.slice(0, 4)} **** **** ${digits.slice(-4)}`;
}

export function isValidCard(cardNumber: string): boolean {
  return /^\d{16}$/.test(cardNumber.replace(/\D/g, ''));
}

export function normalizeCard(cardNumber: string): string {
  return cardNumber.replace(/\D/g, '');
}
