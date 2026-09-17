-- Phase 4: Polymorphic transaction engine

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrderStatus') THEN
    CREATE TYPE "OrderStatus" AS ENUM (
      'PENDING_ACCEPTANCE','PREPARING','SCHEDULED','IN_PROGRESS',
      'COMPLETED','DISPUTED','CANCELLED'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrderKind') THEN
    CREATE TYPE "OrderKind" AS ENUM ('APPOINTMENT','DELIVERY','RFQ');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "vendor_schedules" (
    "id" TEXT NOT NULL,
    "vendorProfileId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "slotMinutes" INTEGER NOT NULL DEFAULT 30,
    "breaks" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "vendor_schedules_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "vendor_schedules_vendorProfileId_weekday_key"
  ON "vendor_schedules"("vendorProfileId", "weekday");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendor_schedules_vendorProfileId_fkey') THEN
    ALTER TABLE "vendor_schedules" ADD CONSTRAINT "vendor_schedules_vendorProfileId_fkey"
      FOREIGN KEY ("vendorProfileId") REFERENCES "vendor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "time_slots" (
    "id" TEXT NOT NULL,
    "vendorProfileId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "isBooked" BOOLEAN NOT NULL DEFAULT false,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "time_slots_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "time_slots_vendorProfileId_day_startMinute_key"
  ON "time_slots"("vendorProfileId", "day", "startMinute");
CREATE UNIQUE INDEX IF NOT EXISTS "time_slots_orderId_key" ON "time_slots"("orderId");
CREATE INDEX IF NOT EXISTS "time_slots_vendorProfileId_day_idx" ON "time_slots"("vendorProfileId", "day");

CREATE TABLE IF NOT EXISTS "orders" (
    "id" TEXT NOT NULL,
    "kind" "OrderKind" NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_ACCEPTANCE',
    "vendorProfileId" TEXT NOT NULL,
    "consumerId" TEXT NOT NULL,
    "totalToman" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "deliveryAddress" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "orders_consumerId_status_idx" ON "orders"("consumerId", "status");
CREATE INDEX IF NOT EXISTS "orders_vendorProfileId_status_idx" ON "orders"("vendorProfileId", "status");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_vendorProfileId_fkey') THEN
    ALTER TABLE "orders" ADD CONSTRAINT "orders_vendorProfileId_fkey"
      FOREIGN KEY ("vendorProfileId") REFERENCES "vendor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'time_slots_orderId_fkey') THEN
    ALTER TABLE "time_slots" ADD CONSTRAINT "time_slots_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "order_lines" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "title" TEXT NOT NULL,
    "unitPriceToman" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "variation" TEXT,
    CONSTRAINT "order_lines_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "order_lines_orderId_idx" ON "order_lines"("orderId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_lines_orderId_fkey') THEN
    ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "job_requests" (
    "id" TEXT NOT NULL,
    "consumerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "mediaIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "radiusKm" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "budgetMaxToman" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "lockedQuoteId" TEXT,
    "vendorProfileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "job_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "job_requests_status_createdAt_idx" ON "job_requests"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "job_requests_consumerId_idx" ON "job_requests"("consumerId");

CREATE TABLE IF NOT EXISTS "job_quotes" (
    "id" TEXT NOT NULL,
    "jobRequestId" TEXT NOT NULL,
    "vendorProfileId" TEXT NOT NULL,
    "priceToman" INTEGER NOT NULL,
    "etaHours" INTEGER NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "job_quotes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "job_quotes_jobRequestId_vendorProfileId_key"
  ON "job_quotes"("jobRequestId", "vendorProfileId");
CREATE INDEX IF NOT EXISTS "job_quotes_jobRequestId_idx" ON "job_quotes"("jobRequestId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_quotes_jobRequestId_fkey') THEN
    ALTER TABLE "job_quotes" ADD CONSTRAINT "job_quotes_jobRequestId_fkey"
      FOREIGN KEY ("jobRequestId") REFERENCES "job_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_quotes_vendorProfileId_fkey') THEN
    ALTER TABLE "job_quotes" ADD CONSTRAINT "job_quotes_vendorProfileId_fkey"
      FOREIGN KEY ("vendorProfileId") REFERENCES "vendor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Atomic slot booking helper (row lock)
CREATE OR REPLACE FUNCTION nazdik_book_slot(
  p_slot_id TEXT,
  p_order_id TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  ok BOOLEAN;
BEGIN
  UPDATE time_slots
  SET "isBooked" = true, "orderId" = p_order_id
  WHERE id = p_slot_id AND "isBooked" = false
  RETURNING true INTO ok;
  RETURN COALESCE(ok, false);
END;
$$ LANGUAGE plpgsql;
