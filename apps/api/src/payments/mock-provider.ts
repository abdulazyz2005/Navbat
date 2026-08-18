import crypto from 'node:crypto';
import type {
  ChargeRequest,
  ChargeResult,
  PaymentProvider,
  RefundRequest,
  RefundResult,
  TransferRequest,
  TransferResult,
} from './provider.js';

/**
 * MVP uchun simulyatsiya qiluvchi provayder.
 * Real pul harakati yo'q — lekin charge/hold/release/refund hayot sikli
 * to'liq real provayderdek modellashtirilgan.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';

  private txId(prefix: string): string {
    return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
  }

  async charge(request: ChargeRequest): Promise<ChargeResult> {
    if (request.amount <= 0) {
      return {
        success: false,
        transactionId: this.txId('ch'),
        failureReason: 'INVALID_AMOUNT',
      };
    }
    return { success: true, transactionId: this.txId('ch') };
  }

  async release(request: TransferRequest): Promise<TransferResult> {
    if (request.amount <= 0) {
      return { success: false, transactionId: this.txId('rl'), failureReason: 'INVALID_AMOUNT' };
    }
    return { success: true, transactionId: this.txId('rl') };
  }

  async refund(request: RefundRequest): Promise<RefundResult> {
    if (request.amount <= 0) {
      return { success: false, transactionId: this.txId('rf'), failureReason: 'INVALID_AMOUNT' };
    }
    return { success: true, transactionId: this.txId('rf') };
  }
}
