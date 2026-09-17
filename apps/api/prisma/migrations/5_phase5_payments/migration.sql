-- Phase 5: Payments, wallet, webhooks, notifications

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentStatus') THEN
    CREATE TYPE "PaymentStatus" AS ENUM
      ('CREATED','PENDING','PAID','FAILED','REFUNDED','CANCELLED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LedgerEntryType') THEN
    CREATE TYPE "LedgerEntryType" AS ENUM
      ('PAYMENT_IN','COMMISSION','VENDOR_CREDIT','REFUND_OUT','PAYOUT','ADJUSTMENT');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "wallets" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL DEFAULT 'USER',
    "balanceToman" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'IRR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "wallets_ownerId_key" ON "wallets"("ownerId");
CREATE INDEX IF NOT EXISTS "wallets_ownerType_idx" ON "wallets"("ownerType");

CREATE TABLE IF NOT EXISTS "ledger_entries" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "type" "LedgerEntryType" NOT NULL,
    "amountToman" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "paymentId" TEXT,
    "orderId" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ledger_entries_idempotencyKey_key"
  ON "ledger_entries"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "ledger_entries_walletId_createdAt_idx" ON "ledger_entries"("walletId", "createdAt");
CREATE INDEX IF NOT EXISTS "ledger_entries_paymentId_idx" ON "ledger_entries"("paymentId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ledger_entries_walletId_fkey') THEN
    ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_walletId_fkey"
      FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "payments" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amountToman" INTEGER NOT NULL,
    "commissionToman" INTEGER NOT NULL DEFAULT 0,
    "provider" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED',
    "authority" TEXT,
    "refId" TEXT,
    "providerPayload" JSONB NOT NULL DEFAULT '{}',
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "payments_authority_key" ON "payments"("authority");
CREATE UNIQUE INDEX IF NOT EXISTS "payments_idempotencyKey_key" ON "payments"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "payments_orderId_idx" ON "payments"("orderId");
CREATE INDEX IF NOT EXISTS "payments_status_idx" ON "payments"("status");

CREATE TABLE IF NOT EXISTS "payment_webhooks" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "signature" TEXT,
    "payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_webhooks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "payment_webhooks_eventKey_key" ON "payment_webhooks"("eventKey");
CREATE INDEX IF NOT EXISTS "payment_webhooks_paymentId_idx" ON "payment_webhooks"("paymentId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_webhooks_paymentId_fkey') THEN
    ALTER TABLE "payment_webhooks" ADD CONSTRAINT "payment_webhooks_paymentId_fkey"
      FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "settlements" (
    "id" TEXT NOT NULL,
    "vendorProfileId" TEXT NOT NULL,
    "grossToman" INTEGER NOT NULL,
    "commissionToman" INTEGER NOT NULL,
    "netToman" INTEGER NOT NULL,
    "paymentId" TEXT,
    "settledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "settlements_vendorProfileId_idx" ON "settlements"("vendorProfileId");

CREATE TABLE IF NOT EXISTS "notification_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "notification_logs_userId_createdAt_idx" ON "notification_logs"("userId", "createdAt");
