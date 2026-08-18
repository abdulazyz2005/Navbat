import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { env } from '../env.js';

// BigInt JSON.stringify'da xato bermasligi uchun
(BigInt.prototype as unknown as { toJSON(): string }).toJSON = function () {
  return this.toString();
};

/**
 * Prisma `driverAdapters` rejimida ishlaydi: ulanish `pg` drayveri orqali,
 * Rust query engine binari kerak emas. Bu deployni yengillashtiradi
 * (Railway/Render/Fly.io konteynerlarida qo'shimcha binar yuklanmaydi).
 */
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma = new PrismaClient({
  adapter,
  log: env.isProduction ? ['error'] : ['warn', 'error'],
});

export type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;
