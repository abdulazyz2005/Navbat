import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Integration testlar bitta DBga yozadi — ketma-ket bajariladi
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        'postgresql://postgres:postgres@localhost:5432/navbat_test?schema=public',
      TELEGRAM_BOT_TOKEN: '123456:TEST-BOT-TOKEN-FOR-VITEST-ONLY',
      SESSION_SECRET: 'test-session-secret',
      PLATFORM_FEE_PERCENT: '10',
      MIN_ORDER_AMOUNT: '10000',
      MIN_WITHDRAWAL_AMOUNT: '50000',
      ADMIN_TELEGRAM_IDS: '900000001',
      ALLOW_INSECURE_AUTH: 'false',
      PAYMENT_PROVIDER: 'mock',
    },
  },
});
