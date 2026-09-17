import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  boundingBoxAround,
  cellSizeForZoom,
  gridCluster,
  haversineMeters,
  isValidRadiusKm,
  parseBbox,
  applyLocationPrivacy,
  type Bbox,
  type LatLng,
  type MapFeature,
  type MapVendorMarker,
  type VendorType,
} from '@nazdik/shared';

export interface MapVendorsQuery {
  bbox?: string;
  lat?: number;
  lng?: number;
  /** radius in kilometers */
  radiusKm?: number;
  vendorType?: VendorType;
  zoom?: number;
  limit?: number;
  /** when true, skip clustering even at low zoom */
  exact?: boolean;
}

export interface MapVendorsResult {
  center: LatLng | null;
  radiusKm: number | null;
  bbox: Bbox | null;
  zoom: number;
  clustered: boolean;
  cellSizeDeg: number;
  total: number;
  features: MapFeature[];
  /** privacy note for clients */
  privacy: {
    fuzzyRadiusMeters: number;
    homeBasedHidden: true;
  };
}

interface VendorLocationRow {
  id: string;
  vendorProfileId: string;
  businessName: string;
  vendorType: string;
  categoryTags: string[];
  description: string | null;
  verificationStatus: string;
  isHomeBased: boolean;
  lat: number;
  lng: number;
  address: string | null;
  serviceRadiusKm: number;
}

/**
 * Hyperlocal map engine.
 * Prefers PostGIS (`nazdik_vendors_nearby` / bbox via geom GiST) when available;
 * falls back to in-memory scan + haversine with identical privacy semantics.
 */
@Injectable()
export class MapService {
  private readonly logger = new Logger(MapService.name);
  /** In-memory index used when PostGIS/Prisma is unavailable (dev/test) */
  private memoryLocations: VendorLocationRow[] = [];

  constructor(private readonly prisma: PrismaService) {}

  /** Seed / replace in-memory index (tests + local demo without PostGIS) */
  seedMemory(rows: VendorLocationRow[]): void {
    this.memoryLocations = rows.map((r) => ({ ...r }));
  }

  upsertMemory(row: VendorLocationRow): void {
    const idx = this.memoryLocations.findIndex((l) => l.vendorProfileId === row.vendorProfileId);
    if (idx >= 0) this.memoryLocations[idx] = { ...row };
    else this.memoryLocations.push({ ...row });
  }

  clearMemory(): void {
    this.memoryLocations = [];
  }

  getMemoryCount(): number {
    return this.memoryLocations.length;
  }

  /** Read-only snapshot of in-memory vendor pins (RFQ broadcast, admin tools) */
  getMemoryLocations(): VendorLocationRow[] {
    return this.memoryLocations.map((r) => ({ ...r }));
  }

  async queryVendors(params: MapVendorsQuery): Promise<MapVendorsResult> {
    const zoom = params.zoom ?? 13;
    const limit = Math.min(params.limit ?? 200, 500);
    const vendorType = params.vendorType;

    let center: LatLng | null = null;
    let radiusKm: number | null = null;
    let bbox: Bbox | null = null;

    if (params.bbox) {
      bbox = parseBbox(params.bbox);
    }

    if (params.lat != null && params.lng != null) {
      center = { lat: params.lat, lng: params.lng };
      const r = params.radiusKm ?? 5;
      radiusKm = isValidRadiusKm(r) ? r : 5;
    }

    let rows: VendorLocationRow[] = [];

    // Prefer DB; fall back to memory index
    const useDb = await this.canUseDatabase();
    if (useDb) {
      rows = await this.queryDatabase({ center, radiusKm, bbox, vendorType, limit });
    } else {
      rows = this.queryMemory({ center, radiusKm, bbox, vendorType, limit });
    }

    // Apply privacy + distance
    const markers: MapVendorMarker[] = rows.map((row) => {
      const privacy = applyLocationPrivacy({
        id: row.vendorProfileId,
        lat: row.lat,
        lng: row.lng,
        isHomeBased: row.isHomeBased,
      });
      const distanceMeters =
        center && row.lat != null && row.lng != null
          ? Math.round(haversineMeters(center, { lat: row.lat, lng: row.lng }))
          : null;

      return {
        id: row.id,
        vendorProfileId: row.vendorProfileId,
        businessName: row.businessName,
        vendorType: row.vendorType,
        categoryTags: row.categoryTags ?? [],
        description: row.description,
        isHomeBased: row.isHomeBased,
        verificationStatus: row.verificationStatus,
        lat: privacy.lat,
        lng: privacy.lng,
        displayLat: privacy.displayLat,
        displayLng: privacy.displayLng,
        fuzzyPolygon: privacy.fuzzyPolygon,
        distanceMeters,
        address: row.address,
      };
    });

    // Cluster when many points or low zoom (unless exact)
    const cellSize = cellSizeForZoom(zoom);
    const shouldCluster =
      !params.exact && (zoom < 13 || markers.length > 40);

    let features: MapFeature[];
    if (shouldCluster && markers.length > 1) {
      const clustered = gridCluster(
        markers.map((m) => ({
          id: m.id,
          lat: m.displayLat,
          lng: m.displayLng,
          vendorType: m.vendorType,
        })),
        cellSize,
      );
      // Re-attach full vendor payloads for non-cluster features
      const byId = new Map(markers.map((m) => [m.id, m]));
      features = clustered.map((f) => {
        if (f.type === 'cluster') return f;
        const full = byId.get(f.id);
        return { type: 'vendor' as const, ...(full ?? f) };
      });
    } else {
      features = markers.map((m) => ({ type: 'vendor' as const, ...m }));
    }

    return {
      center,
      radiusKm,
      bbox,
      zoom,
      clustered: shouldCluster,
      cellSizeDeg: cellSize,
      total: markers.length,
      features,
      privacy: {
        fuzzyRadiusMeters: 200,
        homeBasedHidden: true,
      },
    };
  }

  private async canUseDatabase(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      // Also need vendor_locations table
      await this.prisma.$queryRaw`SELECT 1 FROM vendor_locations LIMIT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private async queryDatabase(opts: {
    center: LatLng | null;
    radiusKm: number | null;
    bbox: Bbox | null;
    vendorType?: VendorType;
    limit: number;
  }): Promise<VendorLocationRow[]> {
    const { center, radiusKm, bbox, vendorType, limit } = opts;

    try {
      if (center && radiusKm != null) {
        // Spatial path — GiST + ST_DWithin
        const rows = await this.prisma.$queryRaw<
          Array<{
            id: string;
            vendorProfileId: string;
            businessName: string;
            vendorType: string;
            categoryTags: string[];
            description: string | null;
            verificationStatus: string;
            isHomeBased: boolean;
            lat: number;
            lng: number;
            address: string | null;
            serviceRadiusKm: number;
          }>
        >`
          SELECT
            vl.id,
            vl."vendorProfileId",
            vp."businessName",
            vp."vendorType"::text AS "vendorType",
            vp."categoryTags",
            vp.description,
            vp."verificationStatus"::text AS "verificationStatus",
            vl."isHomeBased",
            vl.lat,
            vl.lng,
            vl.address,
            vl."serviceRadiusKm"
          FROM vendor_locations vl
          JOIN vendor_profiles vp ON vp.id = vl."vendorProfileId"
          JOIN users u ON u.id = vp."userId"
          WHERE vl."isActive" = true
            AND vp."verificationStatus" = 'VERIFIED'
            AND u."isActive" = true
            AND u.role = 'VENDOR'
            AND (${vendorType ?? null}::text IS NULL OR vp."vendorType"::text = ${vendorType ?? null})
            AND ST_DWithin(
              vl.geom,
              ST_SetSRID(ST_MakePoint(${center.lng}, ${center.lat}), 4326)::geography,
              ${radiusKm * 1000}
            )
          ORDER BY ST_Distance(
            vl.geom,
            ST_SetSRID(ST_MakePoint(${center.lng}, ${center.lat}), 4326)::geography
          )
          LIMIT ${limit}
        `;
        return rows.map((r) => ({ ...r, vendorType: String(r.vendorType) }));
      }

      if (bbox) {
        const rows = await this.prisma.$queryRaw<
          Array<{
            id: string;
            vendorProfileId: string;
            businessName: string;
            vendorType: string;
            categoryTags: string[];
            description: string | null;
            verificationStatus: string;
            isHomeBased: boolean;
            lat: number;
            lng: number;
            address: string | null;
            serviceRadiusKm: number;
          }>
        >`
          SELECT
            vl.id,
            vl."vendorProfileId",
            vp."businessName",
            vp."vendorType"::text AS "vendorType",
            vp."categoryTags",
            vp.description,
            vp."verificationStatus"::text AS "verificationStatus",
            vl."isHomeBased",
            vl.lat,
            vl.lng,
            vl.address,
            vl."serviceRadiusKm"
          FROM vendor_locations vl
          JOIN vendor_profiles vp ON vp.id = vl."vendorProfileId"
          JOIN users u ON u.id = vp."userId"
          WHERE vl."isActive" = true
            AND vp."verificationStatus" = 'VERIFIED'
            AND u."isActive" = true
            AND u.role = 'VENDOR'
            AND (${vendorType ?? null}::text IS NULL OR vp."vendorType"::text = ${vendorType ?? null})
            AND vl.lat BETWEEN ${bbox.minLat} AND ${bbox.maxLat}
            AND vl.lng BETWEEN ${bbox.minLng} AND ${bbox.maxLng}
          LIMIT ${limit}
        `;
        return rows.map((r) => ({ ...r, vendorType: String(r.vendorType) }));
      }

      const rows = await this.prisma.$queryRaw<
        Array<{
          id: string;
          vendorProfileId: string;
          businessName: string;
          vendorType: string;
          categoryTags: string[];
          description: string | null;
          verificationStatus: string;
          isHomeBased: boolean;
          lat: number;
          lng: number;
          address: string | null;
          serviceRadiusKm: number;
        }>
      >`
        SELECT
          vl.id,
          vl."vendorProfileId",
          vp."businessName",
          vp."vendorType"::text AS "vendorType",
          vp."categoryTags",
          vp.description,
          vp."verificationStatus"::text AS "verificationStatus",
          vl."isHomeBased",
          vl.lat,
          vl.lng,
          vl.address,
          vl."serviceRadiusKm"
        FROM vendor_locations vl
        JOIN vendor_profiles vp ON vp.id = vl."vendorProfileId"
        JOIN users u ON u.id = vp."userId"
        WHERE vl."isActive" = true
          AND vp."verificationStatus" = 'VERIFIED'
          AND u."isActive" = true
          AND u.role = 'VENDOR'
          AND (${vendorType ?? null}::text IS NULL OR vp."vendorType"::text = ${vendorType ?? null})
        LIMIT ${limit}
      `;
      return rows.map((r) => ({ ...r, vendorType: String(r.vendorType) }));
    } catch (err) {
      this.logger.warn(`PostGIS query failed, using memory index: ${(err as Error).message}`);
      return this.queryMemory(opts);
    }
  }

  private queryMemory(opts: {
    center: LatLng | null;
    radiusKm: number | null;
    bbox: Bbox | null;
    vendorType?: VendorType;
    limit: number;
  }): VendorLocationRow[] {
    const { center, radiusKm, bbox, vendorType, limit } = opts;
    let rows = this.memoryLocations.filter((r) => r.verificationStatus === 'VERIFIED');

    if (vendorType) {
      rows = rows.filter((r) => r.vendorType === vendorType);
    }

    if (center && radiusKm != null) {
      const radiusM = radiusKm * 1000;
      // Cheap AABB prefilter (≈ O(1) reject) before haversine
      const rough = boundingBoxAround(center, radiusM * 1.05);
      const candidates = rows.filter(
        (r) =>
          r.lat >= rough.minLat &&
          r.lat <= rough.maxLat &&
          r.lng >= rough.minLng &&
          r.lng <= rough.maxLng,
      );
      const scored: Array<{ row: VendorLocationRow; d: number }> = [];
      for (const r of candidates) {
        const d = haversineMeters(center, { lat: r.lat, lng: r.lng });
        if (d <= radiusM) scored.push({ row: r, d });
      }
      scored.sort((a, b) => a.d - b.d);
      return scored.slice(0, limit).map((s) => s.row);
    }

    if (bbox) {
      rows = rows.filter(
        (r) =>
          r.lat >= bbox.minLat &&
          r.lat <= bbox.maxLat &&
          r.lng >= bbox.minLng &&
          r.lng <= bbox.maxLng,
      );
    }

    return rows.slice(0, limit);
  }

  /**
   * Benchmark helper: spatial filter over N points.
   * Used by Phase 2 perf criterion (10k points).
   */
  benchmarkRadiusSearch(points: number, center: LatLng, radiusMeters: number): {
    ms: number;
    matched: number;
  } {
    const rows: VendorLocationRow[] = [];
    for (let i = 0; i < points; i++) {
      // Deterministic polar scatter: 20% near center (within 400m), rest wider
      const angle = (i / points) * Math.PI * 2 * 7;
      const distM = i % 5 === 0 ? (i % 40) * 10 : 200 + (i % 500) * 40;
      const dLat = (distM * Math.cos(angle)) / 111_320;
      const dLng =
        (distM * Math.sin(angle)) /
        (111_320 * Math.max(0.01, Math.cos((center.lat * Math.PI) / 180)));
      rows.push({
        id: `loc_${i}`,
        vendorProfileId: `vp_${i}`,
        businessName: `V${i}`,
        vendorType: 'FOOD',
        categoryTags: [],
        description: null,
        verificationStatus: 'VERIFIED',
        isHomeBased: i % 10 === 0,
        lat: center.lat + dLat,
        lng: center.lng + dLng,
        address: null,
        serviceRadiusKm: 3,
      });
    }
    this.seedMemory(rows);
    // Warm-up then measure
    this.queryMemory({ center, radiusKm: radiusMeters / 1000, bbox: null, limit: 500 });
    const t0 = performance.now();
    const result = this.queryMemory({
      center,
      radiusKm: radiusMeters / 1000,
      bbox: null,
      limit: 500,
    });
    const ms = performance.now() - t0;
    return { ms, matched: result.length };
  }
}
