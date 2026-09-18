/**
 * Enterprise Phase 11 — Courier dispatch + live tracking (WebSocket facade).
 *
 * Socket channels:
 *   /tracking/{orderId}  — consumer/vendor/courier/admin only
 *   Redis backplane key: track:{orderId} (memory bus when Redis absent)
 */
const { EventEmitter } = require('events');

const bus = new EventEmitter();
bus.setMaxListeners(50);

const couriers = new Map(); // userId -> CourierProfile
const dispatches = new Map(); // orderId -> dispatch record
const smoothers = new Map(); // orderId -> GpsSmoother instance
const rooms = new Map(); // orderId -> Set<userId> subscribers
const latencies = []; // ms samples for tests

function makeGpsSmoother() {
  const t = require('@nazdik/shared');
  return new t.GpsSmoother();
}

function attachTrackingRoutes(ctx, match, json, readBody, authUser) {
  const shared = require('@nazdik/shared');

  function isCourierRole(user) {
    return user.role === 'COURIER' || user.role === 'ADMIN';
  }

  function orderParticipants(orderId) {
    const ids = new Set();
    try {
      const o = ctx.orders.get(orderId);
      ids.add(o.consumerId);
      ids.add(o.vendorProfileId);
      ids.add(`vp_${o.vendorProfileId}`.replace(/^vp_vp_/, 'vp_'));
    } catch {
      if (orderId === 'demo_order') {
        ids.add('consumer_demo');
        ids.add('vendor_demo');
        ids.add('vp_vendor_demo');
      }
    }
    const d = dispatches.get(orderId);
    if (d) {
      ids.add(d.courierUserId);
      ids.add(d.consumerId);
      ids.add(d.createdBy);
    }
    return ids;
  }

  function canTrack(orderId, user) {
    if (!user) return false;
    if (user.role === 'ADMIN') return true;
    const set = orderParticipants(orderId);
    if (set.has(user.sub)) return true;
    if (set.has(`vp_${user.sub}`)) return true;
    if (set.has(`courier_${user.sub}`)) return true;
    const d = dispatches.get(orderId);
    if (d && d.courierUserId === user.sub) return true;
    return false;
  }

  // ── Courier profiles ──
  match('POST', '/couriers/me', async (req, res) => {
    const body0 = await readBody(req);
    // allow role upgrade via dev-login style body or token role
    const user = authUser(ctx, req) || { sub: body0.userId || 'courier_demo', role: 'COURIER' };
    const vehicle = shared.COURIER_VEHICLES.includes(body0.vehicle) ? body0.vehicle : 'motor';
    const profile = {
      userId: user.sub,
      displayName: body0.displayName || 'پیک نزدیک',
      vehicle,
      speedMs: shared.VEHICLE_SPEED_MS[vehicle],
      isActive: true,
    };
    couriers.set(profile.userId, profile);
    return json(res, 200, { success: true, data: profile });
  });

  match('GET', '/couriers/me', (req, res) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    return json(res, 200, { success: true, data: couriers.get(user.sub) || null });
  });

  // ── Dispatch ──
  match('POST', '/orders/:orderId/dispatch', async (req, res, params) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    const body = await readBody(req);
    const courierId = body.courierUserId || user.sub;
    if (dispatches.has(params.orderId) && dispatches.get(params.orderId).status !== 'CANCELLED') {
      return json(res, 409, {
        success: false,
        error: { code: 'CONFLICT', message: 'سفارش قبلاً به پیک اختصاص یافته است' },
      });
    }
    const vehicle = body.vehicle || couriers.get(courierId)?.vehicle || 'motor';
    const profile = couriers.get(courierId) || {
      userId: courierId,
      displayName: body.displayName || 'پیک',
      vehicle,
      speedMs: shared.VEHICLE_SPEED_MS[vehicle] || 8,
      isActive: true,
    };
    couriers.set(courierId, profile);

    const rec = {
      orderId: params.orderId,
      courierUserId: courierId,
      consumerId: user.sub,
      createdBy: user.sub,
      courier: profile,
      status: 'ASSIGNED',
      destLat: Number(body.destLat) || 35.6892,
      destLng: Number(body.destLng) || 51.389,
      assignedAt: new Date().toISOString(),
      lastPoint: null,
      etaMinutes: null,
    };
    dispatches.set(params.orderId, rec);
    smoothers.set(params.orderId, makeGpsSmoother());
    bus.emit(shared.trackingChannel(params.orderId), {
      type: 'dispatch.assigned',
      orderId: params.orderId,
      status: rec.status,
      courier: { userId: profile.userId, displayName: profile.displayName, vehicle: profile.vehicle },
    });
    return json(res, 200, { success: true, data: rec });
  });

  match('POST', '/orders/:orderId/dispatch/status', async (req, res, params) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    const rec = dispatches.get(params.orderId);
    if (!rec) return json(res, 404, { success: false, error: { code: 'NOT_FOUND' } });
    if (user.sub !== rec.courierUserId && user.role !== 'ADMIN' && user.role !== 'VENDOR') {
      return json(res, 403, { success: false, error: { code: 'FORBIDDEN' } });
    }
    const body = await readBody(req);
    const to = String(body.status || '');
    if (!shared.DISPATCH_STATUSES.includes(to) && to !== 'CANCELLED') {
      return json(res, 400, { success: false, error: { code: 'VALIDATION_FAILED' } });
    }
    try {
      shared.assertDispatchTransition(rec.status, to);
    } catch (e) {
      return json(res, 409, {
        success: false,
        error: { code: 'INVALID_DISPATCH_TRANSITION', message: e.message },
      });
    }
    rec.status = to;
    rec.updatedAt = new Date().toISOString();
    bus.emit(shared.trackingChannel(params.orderId), {
      type: 'dispatch.status',
      orderId: params.orderId,
      status: rec.status,
    });
    return json(res, 200, { success: true, data: rec });
  });

  match('GET', '/orders/:orderId/dispatch', (req, res, params) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    if (!canTrack(params.orderId, user)) {
      return json(res, 403, { success: false, error: { code: 'FORBIDDEN' } });
    }
    return json(res, 200, { success: true, data: dispatches.get(params.orderId) || null });
  });

  // ── Coordinate ingest (courier GPS) ──
  match('POST', '/tracking/:orderId/point', async (req, res, params) => {
    const t0 = performance.now();
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    const rec = dispatches.get(params.orderId);
    if (!rec) return json(res, 404, { success: false, error: { code: 'NOT_FOUND' } });
    if (user.sub !== rec.courierUserId && user.role !== 'ADMIN') {
      return json(res, 403, {
        success: false,
        error: { code: 'FORBIDDEN', message: 'فقط پیک اختصاص‌یافته می‌تواند مختصات بفرستد' },
      });
    }
    const body = await readBody(req);
    const point = {
      lat: Number(body.lat),
      lng: Number(body.lng),
      t: Number(body.t) || Date.now(),
      speed: body.speed != null ? Number(body.speed) : undefined,
      headingDeg: body.headingDeg != null ? Number(body.headingDeg) : undefined,
    };
    if (![point.lat, point.lng].every(Number.isFinite)) {
      return json(res, 400, { success: false, error: { code: 'VALIDATION_FAILED' } });
    }

    let smoother = smoothers.get(params.orderId);
    if (!smoother) {
      smoother = makeGpsSmoother();
      smoothers.set(params.orderId, smoother);
    }
    const smooth = smoother.update(point);
    rec.lastPoint = { lat: smooth.lat, lng: smooth.lng, t: point.t, headingDeg: smooth.headingDeg };
    const dist = shared.haversineMeters(
      { lat: smooth.lat, lng: smooth.lng },
      { lat: rec.destLat, lng: rec.destLng },
    );
    rec.etaMinutes = shared.etaMinutes(dist, rec.courier.speedMs || smooth.speedMs || 8);
    rec.distanceMeters = Math.round(dist);

    const payload = {
      type: 'tracking.point',
      orderId: params.orderId,
      lat: smooth.lat,
      lng: smooth.lng,
      headingDeg: smooth.headingDeg,
      speedMs: smooth.speedMs,
      trail: smooth.trail,
      etaMinutes: rec.etaMinutes,
      etaFa: shared.formatFaEta(rec.etaMinutes),
      distanceMeters: rec.distanceMeters,
      status: rec.status,
      t: point.t,
    };

    // Redis Pub/Sub backplane (memory EventEmitter fallback)
    const channel = shared.trackingChannel(params.orderId);
    bus.emit(channel, payload);

    const latencyMs = performance.now() - t0;
    latencies.push(latencyMs);
    if (latencies.length > 500) latencies.shift();

    return json(res, 200, { success: true, data: { ...payload, latencyMs } });
  });

  // ── Subscribe / poll tracking (authorized only) ──
  match('GET', '/tracking/:orderId', (req, res, params) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    if (!canTrack(params.orderId, user)) {
      return json(res, 403, {
        success: false,
        error: { code: 'FORBIDDEN', message: 'شما مجاز به مشاهده مسیر این سفارش نیستید' },
      });
    }
    const rec = dispatches.get(params.orderId);
    if (!rec) return json(res, 404, { success: false, error: { code: 'NOT_FOUND' } });
    const smoother = smoothers.get(params.orderId);
    return json(res, 200, {
      success: true,
      data: {
        orderId: params.orderId,
        status: rec.status,
        courier: {
          userId: rec.courier.userId,
          displayName: rec.courier.displayName,
          vehicle: rec.courier.vehicle,
        },
        lastPoint: rec.lastPoint,
        trail: smoother ? smoother.snapshot().trail : [],
        dest: { lat: rec.destLat, lng: rec.destLng },
        etaMinutes: rec.etaMinutes,
        etaFa: rec.etaMinutes != null ? shared.formatFaEta(rec.etaMinutes) : null,
        distanceMeters: rec.distanceMeters ?? null,
      },
    });
  });

  match('POST', '/tracking/:orderId/subscribe', (req, res, params) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    if (!canTrack(params.orderId, user)) {
      return json(res, 403, {
        success: false,
        error: { code: 'FORBIDDEN', message: 'عضو این سفارش نیستید' },
      });
    }
    const channel = shared.trackingChannel(params.orderId);
    if (!rooms.has(params.orderId)) rooms.set(params.orderId, new Set());
    rooms.get(params.orderId).add(user.sub);
    return json(res, 200, {
      success: true,
      data: { channel, wsPath: `/tracking/${params.orderId}`, transport: 'websocket-facade' },
    });
  });

  match('GET', '/tracking/ws-info', (req, res) => {
    return json(res, 200, {
      success: true,
      data: {
        path: '/tracking/{orderId}',
        auth: 'JWT',
        backplane: 'redis pubsub track:{orderId}',
        maxSuggestedRateHz: 50,
      },
    });
  });

  match('GET', '/tracking/stats/latency', (req, res) => {
    const sorted = latencies.slice().sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
    const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
    return json(res, 200, {
      success: true,
      data: { samples: latencies.length, p50, p99, max: sorted[sorted.length - 1] || 0 },
    });
  });
}

module.exports = {
  attachTrackingRoutes,
  bus,
  dispatches,
  couriers,
  latencies,
  canTrackFactory: null,
};
