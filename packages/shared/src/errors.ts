/**
 * Barcha API xatoliklari kod bilan qaytadi, frontend kodni o'zbekcha matnga aylantiradi.
 */
export const ERROR_MESSAGES = {
  UNAUTHORIZED: 'Avtorizatsiya talab qilinadi. Mini Appni qaytadan oching.',
  INVALID_INIT_DATA: "Telegram ma'lumotlari tasdiqlanmadi. Mini Appni Telegram ichidan oching.",
  FORBIDDEN: 'Bu amalni bajarishga ruxsatingiz yo‘q.',
  ADMIN_ONLY: 'Bu bo‘lim faqat administratorlar uchun.',
  USER_BANNED: 'Hisobingiz bloklangan. Qo‘llab-quvvatlash xizmatiga murojaat qiling.',
  NOT_FOUND: 'Ma’lumot topilmadi.',
  ORDER_NOT_FOUND: 'Bunday buyurtma topilmadi.',
  ORDER_ALREADY_ACCEPTED: 'Bu topshiriqni boshqa navbatchi allaqachon qabul qilgan.',
  ORDER_EXPIRED: 'Bu topshiriqning vaqti o‘tib ketgan.',
  ORDER_NOT_PUBLISHED: 'Bu topshiriq hozircha qabul qilish uchun ochiq emas.',
  CANNOT_ACCEPT_OWN_ORDER: 'O‘z buyurtmangizni o‘zingiz qabul qila olmaysiz.',
  ILLEGAL_ORDER_TRANSITION: 'Bu amalni buyurtmaning hozirgi holatida bajarib bo‘lmaydi.',
  ILLEGAL_PAYMENT_TRANSITION: 'To‘lov holatini bunday o‘zgartirib bo‘lmaydi.',
  INSUFFICIENT_BALANCE: 'Balansingizda yetarli mablag‘ yo‘q.',
  INVALID_AMOUNT: 'Summa noto‘g‘ri kiritilgan.',
  AMOUNT_TOO_LOW: 'Taklif qilingan summa juda kam.',
  PRICE_MUST_INCREASE: 'Yangi summa avvalgisidan yuqori bo‘lishi kerak.',
  PAYMENT_NOT_FOUND: 'To‘lov topilmadi.',
  PAYMENT_NOT_HELD: 'To‘lov hali saqlash holatida emas.',
  ALREADY_RATED: 'Siz bu topshiriqni allaqachon baholagansiz.',
  RATING_NOT_ALLOWED: 'Baholash faqat tugallangan topshiriqlar uchun mumkin.',
  NOT_ORDER_PARTICIPANT: 'Siz bu buyurtmaning ishtirokchisi emassiz.',
  CHAT_NOT_AVAILABLE: 'Chat faqat navbatchi topilgandan keyin ochiladi.',
  DISPUTE_ALREADY_OPEN: 'Bu buyurtma bo‘yicha nizo allaqachon ochilgan.',
  DISPUTE_NOT_ALLOWED: 'Hozirgi holatda nizo ochib bo‘lmaydi.',
  ALREADY_HAS_ASSIGNMENT: 'Bu buyurtmada faol navbatchi bor.',
  NO_ACTIVE_ASSIGNMENT: 'Bu buyurtmada faol navbatchi yo‘q.',
  NOT_ASSIGNED_WORKER: 'Siz bu topshiriqning navbatchisi emassiz.',
  ALREADY_STARTED: 'Ish allaqachon boshlangan.',
  NOT_STARTED: 'Avval “Ishni boshlash” tugmasini bosing.',
  VALIDATION_ERROR: 'Kiritilgan ma’lumotlarda xatolik bor.',
  RATE_LIMITED: 'Juda ko‘p so‘rov yuborildi. Biroz kuting.',
  WITHDRAWAL_TOO_SMALL: 'Minimal yechish summasidan kam.',
  WITHDRAWAL_NOT_FOUND: 'Pul yechish so‘rovi topilmadi.',
  PAST_DATE: 'O‘tgan sanaga buyurtma yaratib bo‘lmaydi.',
  INVALID_TIME_RANGE: 'Tugash vaqti boshlanish vaqtidan keyin bo‘lishi kerak.',
  INTERNAL_ERROR: 'Serverda xatolik yuz berdi. Birozdan so‘ng urinib ko‘ring.',
} as const;

export type ErrorCode = keyof typeof ERROR_MESSAGES;

export function errorMessage(code: string): string {
  return (ERROR_MESSAGES as Record<string, string>)[code] ?? ERROR_MESSAGES.INTERNAL_ERROR;
}

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly httpStatus: number = 400,
    public readonly details?: unknown,
  ) {
    super(ERROR_MESSAGES[code]);
    this.name = 'AppError';
  }
}
