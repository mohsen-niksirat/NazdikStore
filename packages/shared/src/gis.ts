/**
 * Production GIS extensions — Phase 6 (NazdikStore hardening brief).
 * Iran GPS sanity, travel-time estimator, alert perimeters, map pin meta.
 */

import { haversineMeters, type LatLng } from './geo';

/** Iran bounding box (WGS84) for Locate Me sanity checks */
export const IRAN_BOUNDS = {
  minLat: 25.0,
  maxLat: 40.0,
  minLng: 44.0,
  maxLng: 64.5,
} as const;

export function isInIran(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= IRAN_BOUNDS.minLat &&
    lat <= IRAN_BOUNDS.maxLat &&
    lng >= IRAN_BOUNDS.minLng &&
    lng <= IRAN_BOUNDS.maxLng
  );
}

export type TravelMode = 'walk' | 'bike' | 'car';

/** Average speeds in Tehran-ish urban context (m/s) */
export const TRAVEL_SPEED_MS: Record<TravelMode, number> = {
  walk: 1.25, // ~4.5 km/h
  bike: 3.5, // ~12.6 km/h
  car: 7.5, // ~27 km/h urban
};

export type ProximityEstimate = {
  distanceMeters: number;
  walkMinutes: number;
  bikeMinutes: number;
  carMinutes: number;
  /** Persian label e.g. "۳۵۰ متر فاصله" */
  faDistance: string;
  faWalk: string;
  faCar: string;
};

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

export function toFaDigits(n: number | string): string {
  return String(n).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

export function estimateProximity(from: LatLng, to: LatLng): ProximityEstimate {
  const distanceMeters = Math.round(haversineMeters(from, to));
  const walkMinutes = Math.max(1, Math.round(distanceMeters / TRAVEL_SPEED_MS.walk / 60));
  const bikeMinutes = Math.max(1, Math.round(distanceMeters / TRAVEL_SPEED_MS.bike / 60));
  const carMinutes = Math.max(1, Math.round(distanceMeters / TRAVEL_SPEED_MS.car / 60));
  return {
    distanceMeters,
    walkMinutes,
    bikeMinutes,
    carMinutes,
    faDistance:
      distanceMeters < 1000
        ? `${toFaDigits(distanceMeters)} متر فاصله`
        : `${toFaDigits((distanceMeters / 1000).toFixed(1))} کیلومتر فاصله`,
    faWalk: `${toFaDigits(walkMinutes)} دقیقه پیاده`,
    faCar: `${toFaDigits(carMinutes)} دقیقه با خودرو`,
  };
}

/** Default notification perimeter radius (meters) */
export const ALERT_RADIUS_M = 1500;

export interface AlertZone {
  id: string;
  consumerId: string;
  label: string; // home | work | custom
  lat: number;
  lng: number;
  radiusM: number;
  vendorTypes: string[]; // empty = all
  createdAt: string;
}

export interface VendorPinMeta {
  vendorType: string;
  /** Lucide/icon key */
  icon: string;
  /** CSS pin color */
  color: string;
  faLabel: string;
}

export const VENDOR_PIN_META: Record<string, VendorPinMeta> = {
  MEDICAL: { vendorType: 'MEDICAL', icon: 'stethoscope', color: '#B42318', faLabel: 'پزشکی' },
  FOOD: { vendorType: 'FOOD', icon: 'chef-hat', color: '#C4922A', faLabel: 'غذا' },
  FIELD_SERVICE: {
    vendorType: 'FIELD_SERVICE',
    icon: 'wrench',
    color: '#3D5A80',
    faLabel: 'خدمات میدانی',
  },
  BEAUTY: { vendorType: 'BEAUTY', icon: 'sparkles', color: '#7B4B94', faLabel: 'زیبایی' },
  ECOMMERCE: { vendorType: 'ECOMMERCE', icon: 'store', color: '#0F6B5C', faLabel: 'فروشگاه' },
};

export function pinMetaFor(vendorType: string): VendorPinMeta {
  return (
    VENDOR_PIN_META[vendorType] || {
      vendorType,
      icon: 'map-pin',
      color: '#0F6B5C',
      faLabel: vendorType,
    }
  );
}

export interface NearbyVendorHit {
  vendorProfileId: string;
  businessName: string;
  vendorType: string;
  lat: number;
  lng: number;
  distanceMeters: number;
  pin: VendorPinMeta;
  proximity: ProximityEstimate;
}

/**
 * Which vendors fall inside an alert zone (or any zones for a consumer).
 */
export function vendorsInPerimeter(
  zone: { lat: number; lng: number; radiusM: number; vendorTypes?: string[] },
  vendors: Array<{
    vendorProfileId: string;
    businessName: string;
    vendorType: string;
    lat: number;
    lng: number;
  }>,
  from?: LatLng,
): NearbyVendorHit[] {
  const origin = from ?? { lat: zone.lat, lng: zone.lng };
  return vendors
    .map((v) => {
      const distanceMeters = Math.round(haversineMeters(origin, { lat: v.lat, lng: v.lng }));
      return {
        vendorProfileId: v.vendorProfileId,
        businessName: v.businessName,
        vendorType: v.vendorType,
        lat: v.lat,
        lng: v.lng,
        distanceMeters,
        pin: pinMetaFor(v.vendorType),
        proximity: estimateProximity(origin, { lat: v.lat, lng: v.lng }),
      };
    })
    .filter((v) => v.distanceMeters <= zone.radiusM)
    .filter((v) => !zone.vendorTypes?.length || zone.vendorTypes.includes(v.vendorType))
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
}

/**
 * MapLibre tile provider presets (configurable via MAP_TILES_URL / MAP_PROVIDER).
 */
export const MAP_TILE_PRESETS: Record<
  string,
  { name: string; tiles?: string[]; styleUrl?: string; attribution: string }
> = {
  osm: {
    name: 'OpenStreetMap',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    attribution: '© OpenStreetMap',
  },
  neshan: {
    name: 'Neshan',
    styleUrl: 'https://api.neshan.org/styles/basic/{key}/style.json',
    attribution: '© Neshan',
  },
  parsimap: {
    name: 'ParsiMap',
    styleUrl: 'https://api.parsimap.com/tile/{key}/streets/{z}/{x}/{y}',
    attribution: '© ParsiMap',
  },
  offline: {
    name: 'Nazdik offline',
    attribution: 'NazdikStore canvas',
  },
};

export function resolveTileConfig(env?: Record<string, string | undefined>) {
  const e = env ?? {
    MAP_PROVIDER: process.env.MAP_PROVIDER,
    MAP_TILES_URL: process.env.MAP_TILES_URL,
    MAP_TILE_KEY: process.env.MAP_TILE_KEY,
  };
  const provider = (e.MAP_PROVIDER || 'offline').toLowerCase();
  const preset = MAP_TILE_PRESETS[provider] || MAP_TILE_PRESETS.offline;
  if (e.MAP_TILES_URL) {
    return {
      provider: 'custom',
      name: 'Custom',
      tiles: [e.MAP_TILES_URL],
      styleUrl: undefined,
      attribution: preset.attribution,
    };
  }
  return {
    provider,
    name: preset.name,
    tiles: preset.tiles,
    styleUrl: preset.styleUrl?.replace('{key}', e.MAP_TILE_KEY || ''),
    attribution: preset.attribution,
  };
}

/** Dashed circle ring for fuzzy privacy radius (SVG path points) */
export function dashedCirclePoints(
  center: LatLng,
  radiusM: number,
  segments = 16,
): Array<{ lat: number; lng: number }> {
  const pts: Array<{ lat: number; lng: number }> = [];
  for (let i = 0; i < segments; i++) {
    const th = (i / segments) * Math.PI * 2;
    const dLat = (radiusM * Math.cos(th)) / 111_320;
    const dLng =
      (radiusM * Math.sin(th)) /
      (111_320 * Math.max(0.01, Math.cos((center.lat * Math.PI) / 180)));
    pts.push({ lat: center.lat + dLat, lng: center.lng + dLng });
  }
  return pts;
}

export const PRODUCTION_GIS_PHASE = 6;
