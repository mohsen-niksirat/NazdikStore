/**
 * Enterprise Phase 11 — Courier, dispatch state machine, GPS smoothing.
 */

export const COURIER_VEHICLES = ['bike', 'motor', 'car'] as const;
export type CourierVehicle = (typeof COURIER_VEHICLES)[number];

export interface CourierProfile {
  userId: string;
  displayName: string;
  vehicle: CourierVehicle;
  /** avg m/s used for ETA */
  speedMs: number;
  isActive: boolean;
}

export const VEHICLE_SPEED_MS: Record<CourierVehicle, number> = {
  bike: 4.5,
  motor: 8,
  car: 7,
};

export const DISPATCH_STATUSES = [
  'ASSIGNED',
  'PICKED_UP',
  'ARRIVED_AT_DESTINATION',
  'DELIVERED',
] as const;
export type DispatchStatus = (typeof DISPATCH_STATUSES)[number];

const DISPATCH_FLOW: Record<string, string[]> = {
  ASSIGNED: ['PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['ARRIVED_AT_DESTINATION', 'CANCELLED'],
  ARRIVED_AT_DESTINATION: ['DELIVERED'],
  DELIVERED: [],
};

export function canDispatchTransition(from: DispatchStatus | string, to: DispatchStatus | string): boolean {
  return (DISPATCH_FLOW[from] || []).includes(to);
}

export function assertDispatchTransition(from: DispatchStatus | string, to: DispatchStatus | string): void {
  if (!canDispatchTransition(from, to)) {
    const err = new Error(`INVALID_DISPATCH:${from}->${to}`) as Error & { code: string };
    err.code = 'INVALID_DISPATCH_TRANSITION';
    throw err;
  }
}

export interface GpsPoint {
  lat: number;
  lng: number;
  /** unix ms */
  t: number;
  /** m/s if provided by device */
  speed?: number;
  headingDeg?: number;
}

export interface SmoothedTrack {
  lat: number;
  lng: number;
  headingDeg: number;
  speedMs: number;
  trail: Array<{ lat: number; lng: number }>;
}

/**
 * Lightweight 1D Kalman-ish smoother for lat/lng + dead-reckoning when GPS gaps.
 */
export class GpsSmoother {
  private lat = 0;
  private lng = 0;
  private heading = 0;
  private speed = 0;
  private initialized = false;
  private lastT = 0;
  private trail: Array<{ lat: number; lng: number }> = [];
  private readonly q: number;
  private readonly r: number;

  constructor(opts?: { processNoise?: number; measureNoise?: number; trailSize?: number }) {
    this.q = opts?.processNoise ?? 0.08;
    this.r = opts?.measureNoise ?? 0.35;
    this.maxTrail = opts?.trailSize ?? 40;
  }

  private maxTrail: number;

  reset(): void {
    this.initialized = false;
    this.trail = [];
  }

  update(p: GpsPoint): SmoothedTrack {
    if (!this.initialized) {
      this.lat = p.lat;
      this.lng = p.lng;
      this.speed = p.speed ?? 0;
      this.heading = p.headingDeg ?? 0;
      this.lastT = p.t;
      this.initialized = true;
      this.trail.push({ lat: this.lat, lng: this.lng });
      return this.snapshot();
    }

    const dtMs = Math.max(0, p.t - this.lastT);
    const dt = dtMs / 1000;

    // Dead-reckoning prediction along heading
    const predictSpeed = p.speed ?? this.speed;
    if (dt > 0.8 && predictSpeed > 0) {
      const dist = predictSpeed * dt;
      const rad = (this.heading * Math.PI) / 180;
      const dLat = (dist * Math.cos(rad)) / 111320;
      const dLng =
        (dist * Math.sin(rad)) /
        (111320 * Math.max(0.01, Math.cos((this.lat * Math.PI) / 180)));
      this.lat += dLat * 0.5; // partial prediction
      this.lng += dLng * 0.5;
    }

    // Simple complementary filter blend (Kalman-lite)
    const k = this.r / (this.r + this.q);
    this.lat = this.lat + (1 - k) * (p.lat - this.lat);
    this.lng = this.lng + (1 - k) * (p.lng - this.lng);

    if (p.speed != null) this.speed = this.speed * 0.7 + p.speed * 0.3;
    if (p.headingDeg != null) this.heading = p.headingDeg;
    else if (dtMs > 0 && dtMs < 30000) {
      const dLat = p.lat - this.lat;
      const dLng = p.lng - this.lng;
      if (Math.abs(dLat) + Math.abs(dLng) > 1e-7) {
        this.heading = (Math.atan2(dLng, dLat) * 180) / Math.PI;
        if (this.heading < 0) this.heading += 360;
      }
    }

    this.lastT = p.t;
    this.trail.push({ lat: this.lat, lng: this.lng });
    if (this.trail.length > this.maxTrail) this.trail.shift();
    return this.snapshot();
  }

  snapshot(): SmoothedTrack {
    return {
      lat: this.lat,
      lng: this.lng,
      headingDeg: this.heading,
      speedMs: this.speed,
      trail: this.trail.slice(),
    };
  }
}

/** Redis Pub/Sub channel names */
export function trackingChannel(orderId: string): string {
  return `track:${orderId}`;
}

export function etaMinutes(distanceMeters: number, speedMs: number): number {
  const s = speedMs > 0 ? speedMs : 6;
  return Math.max(1, Math.round(distanceMeters / s / 60));
}

export function formatFaEta(minutes: number): string {
  const FA = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return `${String(minutes).replace(/\d/g, (d) => FA[Number(d)])} دقیقه تا مقصد`;
}

export const PRODUCTION_TRACKING_PHASE = 11;
