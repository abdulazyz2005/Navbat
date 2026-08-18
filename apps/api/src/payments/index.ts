import { env } from '../env.js';
import { MockPaymentProvider } from './mock-provider.js';
import type { PaymentProvider } from './provider.js';

export * from './provider.js';
export { MockPaymentProvider } from './mock-provider.js';

const providers = new Map<string, () => PaymentProvider>([
  ['mock', () => new MockPaymentProvider()],
  // Real provayder ulanganda shu yerga qo'shiladi:
  // ['click', () => new ClickPaymentProvider(env.CLICK_MERCHANT_ID, env.CLICK_SECRET)],
  // ['payme', () => new PaymePaymentProvider(env.PAYME_MERCHANT_ID, env.PAYME_KEY)],
]);

let instance: PaymentProvider | null = null;

export function getPaymentProvider(): PaymentProvider {
  if (instance) return instance;
  const factory = providers.get(env.PAYMENT_PROVIDER);
  if (!factory) {
    throw new Error(
      `Noma'lum PAYMENT_PROVIDER="${env.PAYMENT_PROVIDER}". Mavjud: ${[...providers.keys()].join(', ')}`,
    );
  }
  instance = factory();
  return instance;
}

/** Testlar uchun */
export function setPaymentProvider(provider: PaymentProvider | null): void {
  instance = provider;
}
