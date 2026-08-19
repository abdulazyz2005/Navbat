-- NAVBAT: karta-karta to'lov (escrow) + alohida admin panel
-- Qo'lda yozilgan migratsiya (schema-engine mavjud bo'lmagan muhitda yaratildi).

-- 1. Buyurtmada navbatchi qo'liga tegadigan summa alohida saqlanadi.
--    Yangi model: buyurtmachi offeredAmount to'laydi, navbatchi (offeredAmount - platformFee) oladi.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "workerAmount" INTEGER NOT NULL DEFAULT 0;

-- Eski yozuvlarni yangi modelga moslash: workerAmount = offeredAmount - platformFee
UPDATE "orders"
   SET "workerAmount" = GREATEST("offeredAmount" - "platformFee", 0)
 WHERE "workerAmount" = 0;

-- 2. Pul yechish uchun karta (payout) — profilda.
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "cardNumber" TEXT;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "cardHolder" TEXT;

-- 3. Karta-karta to'lov niyati
DO $$ BEGIN
  CREATE TYPE "PaymentIntentStatus" AS ENUM ('AWAITING_TRANSFER', 'PENDING_REVIEW', 'CONFIRMED', 'REJECTED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "payment_intents" (
  "id"             TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "orderId"        TEXT,
  "amount"         INTEGER NOT NULL,
  "expectedAmount" INTEGER NOT NULL,
  "status"         "PaymentIntentStatus" NOT NULL DEFAULT 'AWAITING_TRANSFER',
  "cardNumber"     TEXT NOT NULL,
  "cardHolder"     TEXT NOT NULL,
  "receiptFileId"  TEXT,
  "receiptData"    BYTEA,
  "receiptMime"    TEXT,
  "receiptAt"      TIMESTAMP(3),
  "reviewedById"   TEXT,
  "reviewedAt"     TIMESTAMP(3),
  "rejectReason"   TEXT,
  "expiresAt"      TIMESTAMP(3) NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "payment_intents_status_createdAt_idx" ON "payment_intents"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "payment_intents_userId_status_idx" ON "payment_intents"("userId", "status");

DO $$ BEGIN
  ALTER TABLE "payment_intents"
    ADD CONSTRAINT "payment_intents_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "payment_intents"
    ADD CONSTRAINT "payment_intents_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Bir vaqtning o'zida ikkita faol to'lov bir xil summaga ega bo'lmasligi kerak —
-- aynan shu unikal summa to'lovni identifikatsiya qiladi.
CREATE UNIQUE INDEX IF NOT EXISTS "payment_intents_active_amount_key"
  ON "payment_intents"("expectedAmount")
  WHERE "status" IN ('AWAITING_TRANSFER', 'PENDING_REVIEW');

-- 4. Admin veb-paneliga kirish uchun bir martalik kod
CREATE TABLE IF NOT EXISTS "admin_login_codes" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "codeHash"  TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt"    TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_login_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "admin_login_codes_codeHash_key" ON "admin_login_codes"("codeHash");
CREATE INDEX IF NOT EXISTS "admin_login_codes_userId_idx" ON "admin_login_codes"("userId");

DO $$ BEGIN
  ALTER TABLE "admin_login_codes"
    ADD CONSTRAINT "admin_login_codes_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5. Sozlamalar (platforma kartasi va h.k.)
CREATE TABLE IF NOT EXISTS "settings" (
  "key"       TEXT NOT NULL,
  "value"     TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);
