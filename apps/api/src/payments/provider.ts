/**
 * To'lov provayderi abstraksiyasi.
 *
 * MVPda `MockPaymentProvider` ishlaydi, lekin arxitektura real provayder
 * (Click, Payme, Uzum) ulanishiga tayyor: faqat shu interfeysni implement qilish kifoya.
 * Provider tanlash `PAYMENT_PROVIDER` env orqali.
 */

export interface ChargeRequest {
  paymentId: string;
  orderId: string;
  payerId: string;
  amount: number; // integer UZS
  description: string;
}

export interface ChargeResult {
  success: boolean;
  transactionId: string;
  /** Real provayderda foydalanuvchi yo'naltiriladigan URL */
  redirectUrl?: string;
  failureReason?: string;
}

export interface TransferRequest {
  paymentId: string;
  transactionId: string;
  receiverId: string;
  amount: number;
}

export interface TransferResult {
  success: boolean;
  transactionId: string;
  failureReason?: string;
}

export interface RefundRequest {
  paymentId: string;
  transactionId: string;
  amount: number;
  reason: string;
}

export interface RefundResult {
  success: boolean;
  transactionId: string;
  failureReason?: string;
}

export interface PaymentProvider {
  readonly name: string;
  /** Buyurtmachidan pulni yechib, platformada HELD holatga o'tkazadi */
  charge(request: ChargeRequest): Promise<ChargeResult>;
  /** HELD puldan navbatchiga o'tkazadi */
  release(request: TransferRequest): Promise<TransferResult>;
  /** HELD pulni buyurtmachiga qaytaradi */
  refund(request: RefundRequest): Promise<RefundResult>;
}
