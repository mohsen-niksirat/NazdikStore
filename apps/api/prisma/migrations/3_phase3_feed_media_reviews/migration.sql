-- Phase 3: Business feed, social commerce & media management

CREATE TABLE IF NOT EXISTS "media_assets" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "checksum" TEXT NOT NULL,
    "exifStripped" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "media_assets_ownerId_idx" ON "media_assets"("ownerId");

CREATE TABLE IF NOT EXISTS "products" (
    "id" TEXT NOT NULL,
    "vendorProfileId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priceToman" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IRR',
    "stock" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "coverMediaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "products_vendorProfileId_isActive_idx" ON "products"("vendorProfileId", "isActive");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_vendorProfileId_fkey') THEN
    ALTER TABLE "products" ADD CONSTRAINT "products_vendorProfileId_fkey"
      FOREIGN KEY ("vendorProfileId") REFERENCES "vendor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "vendor_posts" (
    "id" TEXT NOT NULL,
    "vendorProfileId" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vendor_posts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "vendor_posts_vendorProfileId_createdAt_idx" ON "vendor_posts"("vendorProfileId", "createdAt");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendor_posts_vendorProfileId_fkey') THEN
    ALTER TABLE "vendor_posts" ADD CONSTRAINT "vendor_posts_vendorProfileId_fkey"
      FOREIGN KEY ("vendorProfileId") REFERENCES "vendor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "post_images" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "altText" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "post_images_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "post_images_postId_idx" ON "post_images"("postId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'post_images_postId_fkey') THEN
    ALTER TABLE "post_images" ADD CONSTRAINT "post_images_postId_fkey"
      FOREIGN KEY ("postId") REFERENCES "vendor_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "post_product_tags" (
    "postId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "priceToman" INTEGER,
    CONSTRAINT "post_product_tags_pkey" PRIMARY KEY ("postId", "productId")
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'post_product_tags_postId_fkey') THEN
    ALTER TABLE "post_product_tags" ADD CONSTRAINT "post_product_tags_postId_fkey"
      FOREIGN KEY ("postId") REFERENCES "vendor_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'post_product_tags_productId_fkey') THEN
    ALTER TABLE "post_product_tags" ADD CONSTRAINT "post_product_tags_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "reviews" (
    "id" TEXT NOT NULL,
    "vendorProfileId" TEXT NOT NULL,
    "consumerId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "body" TEXT,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reviews_rating_check" CHECK ("rating" >= 1 AND "rating" <= 5)
);
CREATE UNIQUE INDEX IF NOT EXISTS "reviews_vendorProfileId_consumerId_key"
  ON "reviews"("vendorProfileId", "consumerId");
CREATE INDEX IF NOT EXISTS "reviews_vendorProfileId_createdAt_idx" ON "reviews"("vendorProfileId", "createdAt");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_vendorProfileId_fkey') THEN
    ALTER TABLE "reviews" ADD CONSTRAINT "reviews_vendorProfileId_fkey"
      FOREIGN KEY ("vendorProfileId") REFERENCES "vendor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "review_replies" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "review_replies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "review_replies_reviewId_key" ON "review_replies"("reviewId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'review_replies_reviewId_fkey') THEN
    ALTER TABLE "review_replies" ADD CONSTRAINT "review_replies_reviewId_fkey"
      FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "completed_engagements" (
    "id" TEXT NOT NULL,
    "vendorProfileId" TEXT NOT NULL,
    "consumerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'ORDER',
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meta" JSONB NOT NULL DEFAULT '{}',
    CONSTRAINT "completed_engagements_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "completed_engagements_vendorProfileId_consumerId_kind_key"
  ON "completed_engagements"("vendorProfileId", "consumerId", "kind");
CREATE INDEX IF NOT EXISTS "completed_engagements_consumerId_idx" ON "completed_engagements"("consumerId");
CREATE INDEX IF NOT EXISTS "completed_engagements_vendorProfileId_idx" ON "completed_engagements"("vendorProfileId");
