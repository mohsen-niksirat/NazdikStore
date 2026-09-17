// Phase 1 schema — PostgreSQL
-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CONSUMER', 'VENDOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "VendorType" AS ENUM ('MEDICAL', 'FOOD', 'ECOMMERCE', 'FIELD_SERVICE', 'BEAUTY');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CONSUMER',
    "firstName" TEXT,
    "lastName" TEXT,
    "avatarUrl" TEXT,
    "isPhoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "vendorType" "VendorType" NOT NULL,
    "categoryTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "nationalId" TEXT,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "description" TEXT,
    "socialLinks" JSONB NOT NULL DEFAULT '{}',
    "isHomeBased" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_audit_logs" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_profiles_userId_key" ON "vendor_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_profiles_nationalId_key" ON "vendor_profiles"("nationalId");

-- CreateIndex
CREATE INDEX "vendor_profiles_vendorType_idx" ON "vendor_profiles"("vendorType");

-- CreateIndex
CREATE INDEX "vendor_profiles_verificationStatus_idx" ON "vendor_profiles"("verificationStatus");

-- CreateIndex
CREATE INDEX "auth_audit_logs_phone_createdAt_idx" ON "auth_audit_logs"("phone", "createdAt");

-- CreateIndex
CREATE INDEX "auth_audit_logs_action_createdAt_idx" ON "auth_audit_logs"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "vendor_profiles" ADD CONSTRAINT "vendor_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PostGIS extension for Phase 2 (safe to run early)
CREATE EXTENSION IF NOT EXISTS postgis;
