-- Phase 2: PostGIS geolocation & hyperlocal map engine

-- Ensure PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- CreateTable vendor_locations
CREATE TABLE IF NOT EXISTS "vendor_locations" (
    "id" TEXT NOT NULL,
    "vendorProfileId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "address" TEXT,
    "serviceRadiusKm" DOUBLE PRECISION NOT NULL DEFAULT 3,
    "isHomeBased" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_locations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "vendor_locations_vendorProfileId_key"
  ON "vendor_locations"("vendorProfileId");

CREATE INDEX IF NOT EXISTS "vendor_locations_lat_lng_idx"
  ON "vendor_locations"("lat", "lng");

CREATE INDEX IF NOT EXISTS "vendor_locations_isActive_idx"
  ON "vendor_locations"("isActive");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vendor_locations_vendorProfileId_fkey'
  ) THEN
    ALTER TABLE "vendor_locations"
      ADD CONSTRAINT "vendor_locations_vendorProfileId_fkey"
      FOREIGN KEY ("vendorProfileId") REFERENCES "vendor_profiles"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Geography column (WGS84) + GiST index — used by ST_DWithin / clustering
ALTER TABLE "vendor_locations"
  ADD COLUMN IF NOT EXISTS "geom" geography(Point, 4326);

-- Sync geom from lat/lng
CREATE OR REPLACE FUNCTION vendor_locations_sync_geom()
RETURNS trigger AS $$
BEGIN
  NEW.geom := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vendor_locations_geom ON "vendor_locations";
CREATE TRIGGER trg_vendor_locations_geom
  BEFORE INSERT OR UPDATE OF lat, lng ON "vendor_locations"
  FOR EACH ROW EXECUTE FUNCTION vendor_locations_sync_geom();

-- Backfill existing rows
UPDATE "vendor_locations"
SET geom = ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
WHERE geom IS NULL;

CREATE INDEX IF NOT EXISTS vendor_locations_geom_gix
  ON "vendor_locations" USING GIST (geom);

-- Performance helper: nearby verified vendors within radius meters
-- Example:
--   SELECT * FROM nazdik_vendors_nearby(35.6892, 51.389, 3000, NULL, 50);
CREATE OR REPLACE FUNCTION nazdik_vendors_nearby(
  center_lat DOUBLE PRECISION,
  center_lng DOUBLE PRECISION,
  radius_meters DOUBLE PRECISION,
  vendor_type_filter TEXT DEFAULT NULL,
  result_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  vendor_profile_id TEXT,
  business_name TEXT,
  vendor_type TEXT,
  is_home_based BOOLEAN,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  address TEXT,
  distance_meters DOUBLE PRECISION
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    vp.id::text,
    vp."businessName",
    vp."vendorType"::text,
    vl."isHomeBased",
    vl.lat,
    vl.lng,
    vl.address,
    ST_Distance(vl.geom, ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography)::double precision AS distance_meters
  FROM vendor_locations vl
  JOIN vendor_profiles vp ON vp.id = vl."vendorProfileId"
  JOIN users u ON u.id = vp."userId"
  WHERE vl."isActive" = true
    AND vp."verificationStatus" = 'VERIFIED'
    AND u."isActive" = true
    AND u.role = 'VENDOR'
    AND (vendor_type_filter IS NULL OR vp."vendorType"::text = vendor_type_filter)
    AND ST_DWithin(
      vl.geom,
      ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography,
      radius_meters
    )
  ORDER BY distance_meters ASC
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql STABLE;
