/**
 * Geospatial utilities for NazdikStore hyperlocal map engine.
 * Pure functions — used by API, tests, and frontend.
 */

export const EARTH_RADIUS_M = 6371000;
export const FUZZY_LOCATION_RADIUS_M = 200;

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Bbox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

export interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface MapVendorMarker {
  id: string;
  vendorProfileId: string;
  businessName: string;
  vendorType: string;
  categoryTags: string[];
  description: string | null;
  isHomeBased: boolean;
  verificationStatus: string;
  /** Exact coords only for non-home vendors; null when fuzzy */
  lat: number | null;
  lng: number | null;
  /** Always present — fuzzy circle center (obfuscated for home-based) */
  displayLat: number;
  displayLng: number;
  /** Privacy polygon (fuzzy mode) or null when exact pin is safe */
  fuzzyPolygon: GeoJsonPolygon | null;
  distanceMeters: number | null;
  address: string | null;
}

export interface MapCluster {
  id: string;
  type: 'cluster';
  count: number;
  lat: number;
  lng: number;
  vendorTypes: string[];
}

export type MapFeature = ({ type: 'vendor' } & MapVendorMarker) | MapCluster;

/** Haversine distance in meters */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Approx meters → degrees latitude */
export function metersToLatDeg(meters: number): number {
  return meters / 111_320;
}

/** Approx meters → degrees longitude at a given latitude */
export function metersToLngDeg(meters: number, atLat: number): number {
  return meters / (111_320 * Math.max(0.01, Math.cos((atLat * Math.PI) / 180)));
}

/** Axis-aligned bbox around a point */
export function boundingBoxAround(center: LatLng, radiusMeters: number): Bbox {
  const dLat = metersToLatDeg(radiusMeters);
  const dLng = metersToLngDeg(radiusMeters, center.lat);
  return {
    minLat: center.lat - dLat,
    maxLat: center.lat + dLat,
    minLng: center.lng - dLng,
    maxLng: center.lng + dLng,
  };
}

/**
 * Parse bbox string.
 * Canonical API order is GeoJSON/WMS: `minLng,minLat,maxLng,maxLat`.
 * Also accepts `minLat,minLng,maxLat,maxLng` when values are clearly lat-first
 * (Iran latitudes ~25–40, longitudes ~44–64).
 */
export function parseBbox(raw: string): Bbox | null {
  const parts = raw.split(',').map((p) => Number(p.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [a, b, c, d] = parts;

  // Invalid latitude forces lng-first interpretation
  if (Math.abs(b) > 90 || Math.abs(d) > 90) {
    return normalizeBbox({ minLng: a, minLat: b, maxLng: c, maxLat: d });
  }
  // Both first and third look like Iran longitudes (44–64) → GeoJSON
  const looksLng = (v: number) => v >= 44 && v <= 64;
  const looksLat = (v: number) => v >= 25 && v <= 40;
  if (looksLng(a) && looksLng(c) && looksLat(b) && looksLat(d)) {
    return normalizeBbox({ minLng: a, minLat: b, maxLng: c, maxLat: d });
  }
  // Both first and third look like latitudes → lat-first input
  if (looksLat(a) && looksLat(c) && looksLng(b) && looksLng(d)) {
    return normalizeBbox({ minLat: a, minLng: b, maxLat: c, maxLng: d });
  }
  // Default: GeoJSON lng,lat order
  return normalizeBbox({ minLng: a, minLat: b, maxLng: c, maxLat: d });
}

function normalizeBbox(b: Bbox): Bbox {
  return {
    minLat: Math.min(b.minLat, b.maxLat),
    maxLat: Math.max(b.minLat, b.maxLat),
    minLng: Math.min(b.minLng, b.maxLng),
    maxLng: Math.max(b.minLng, b.maxLng),
  };
}

export function pointInBbox(p: LatLng, bbox: Bbox): boolean {
  return (
    p.lat >= bbox.minLat &&
    p.lat <= bbox.maxLat &&
    p.lng >= bbox.minLng &&
    p.lng <= bbox.maxLng
  );
}

/** FNV-1a 32-bit hash for deterministic obfuscation seeds */
export function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Deterministic fuzzy offset: same vendor id → same display point within radius.
 * Uses seed so map markers don't jump every reload, but still hides the true home.
 */
export function obfuscateCoordinate(
  lat: number,
  lng: number,
  seed: string,
  radiusMeters: number = FUZZY_LOCATION_RADIUS_M,
): LatLng {
  const h1 = hashSeed(`${seed}:a`);
  const h2 = hashSeed(`${seed}:b`);
  // angle 0..2π, radial fraction biased to outer ring (less center-pinning)
  const angle = ((h1 % 100000) / 100000) * Math.PI * 2;
  const frac = 0.45 + ((h2 % 100000) / 100000) * 0.55; // 0.45–1.0
  const r = radiusMeters * frac;
  const dLat = (r * Math.cos(angle)) / 111_320;
  const dLng = (r * Math.sin(angle)) / (111_320 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  return { lat: lat + dLat, lng: lng + dLng };
}

/** Circle approximated as GeoJSON polygon (for fuzzy map overlay) */
export function circlePolygon(
  center: LatLng,
  radiusMeters: number,
  segments = 12,
): GeoJsonPolygon {
  const coords: number[][] = [];
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const dLat = (radiusMeters * Math.cos(theta)) / 111_320;
    const dLng =
      (radiusMeters * Math.sin(theta)) /
      (111_320 * Math.max(0.01, Math.cos((center.lat * Math.PI) / 180)));
    coords.push([center.lng + dLng, center.lat + dLat]);
  }
  return { type: 'Polygon', coordinates: [coords] };
}

/**
 * Apply privacy rules for map markers.
 * Home-based vendors never expose true coordinates — only fuzzy display point + polygon.
 */
export function applyLocationPrivacy(vendor: {
  id: string;
  lat: number | null;
  lng: number | null;
  isHomeBased: boolean;
}): {
  displayLat: number;
  displayLng: number;
  lat: number | null;
  lng: number | null;
  fuzzyPolygon: GeoJsonPolygon | null;
} {
  // No location at all → Tehran center placeholder
  if (vendor.lat == null || vendor.lng == null) {
    const center = { lat: 35.6892, lng: 51.389 };
    return {
      displayLat: center.lat,
      displayLng: center.lng,
      lat: null,
      lng: null,
      fuzzyPolygon: null,
    };
  }

  if (vendor.isHomeBased) {
    const fuzzy = obfuscateCoordinate(vendor.lat, vendor.lng, vendor.id, FUZZY_LOCATION_RADIUS_M);
    return {
      displayLat: fuzzy.lat,
      displayLng: fuzzy.lng,
      lat: null,
      lng: null,
      fuzzyPolygon: circlePolygon(fuzzy, FUZZY_LOCATION_RADIUS_M),
    };
  }

  return {
    displayLat: vendor.lat,
    displayLng: vendor.lng,
    lat: vendor.lat,
    lng: vendor.lng,
    fuzzyPolygon: null,
  };
}

export interface ClusterPoint {
  id: string;
  lat: number;
  lng: number;
  vendorType: string;
}

/**
 * Grid clustering (geohash-style). cellSizeDeg ≈ zoom-dependent:
 * zoom 10–14 → 0.02–0.005, zoom 8 → 0.05, etc.
 */
export function gridCluster(
  points: ClusterPoint[],
  cellSizeDeg: number,
): MapFeature[] {
  const cells = new Map<
    string,
    { points: ClusterPoint[]; sumLat: number; sumLng: number; types: Set<string> }
  >();

  for (const p of points) {
    const gx = Math.floor(p.lng / cellSizeDeg);
    const gy = Math.floor(p.lat / cellSizeDeg);
    const key = `${gx}:${gy}`;
    let cell = cells.get(key);
    if (!cell) {
      cell = { points: [], sumLat: 0, sumLng: 0, types: new Set() };
      cells.set(key, cell);
    }
    cell.points.push(p);
    cell.sumLat += p.lat;
    cell.sumLng += p.lng;
    cell.types.add(p.vendorType);
  }

  const features: MapFeature[] = [];
  for (const [key, cell] of cells) {
    if (cell.points.length === 1) {
      // Leave single points as-is (caller will merge with full vendor data)
      const p = cell.points[0];
      features.push({
        type: 'vendor',
        id: p.id,
        vendorProfileId: p.id,
        businessName: '',
        vendorType: p.vendorType,
        categoryTags: [],
        description: null,
        isHomeBased: false,
        verificationStatus: 'VERIFIED',
        lat: p.lat,
        lng: p.lng,
        displayLat: p.lat,
        displayLng: p.lng,
        fuzzyPolygon: null,
        distanceMeters: null,
        address: null,
      });
    } else {
      features.push({
        type: 'cluster',
        id: `cluster:${key}`,
        count: cell.points.length,
        lat: cell.sumLat / cell.points.length,
        lng: cell.sumLng / cell.points.length,
        vendorTypes: Array.from(cell.types),
      });
    }
  }
  return features;
}

/** Suggested grid cell size from map zoom (MapLibre zoom levels) */
export function cellSizeForZoom(zoom: number): number {
  if (zoom >= 15) return 0.002;
  if (zoom >= 14) return 0.004;
  if (zoom >= 13) return 0.008;
  if (zoom >= 12) return 0.015;
  if (zoom >= 11) return 0.03;
  if (zoom >= 10) return 0.05;
  if (zoom >= 9) return 0.08;
  return 0.15;
}

export const RADIUS_PRESETS_KM = [1, 3, 5, 10] as const;

export function isValidRadiusKm(v: number): boolean {
  return Number.isFinite(v) && v > 0 && v <= 50;
}

/** Tehran / common Iranian city centers for demo */
export const DEFAULT_MAP_CENTER: LatLng = { lat: 35.6892, lng: 51.389 };
export const IRAN_BBOX: Bbox = {
  minLat: 25.0,
  maxLat: 40.0,
  minLng: 44.0,
  maxLng: 63.5,
};
