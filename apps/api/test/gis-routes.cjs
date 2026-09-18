/**
 * Alert perimeter store — consumer zones (home/work) + nearby vendor hits.
 */
const zones = new Map(); // id -> zone

function uid() {
  return `zone_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function attachGisRoutes(ctx, match, json, readBody, authUser) {
  const gis = require('@nazdik/shared');

  match('GET', '/gis/tiles', (req, res) => {
    return json(res, 200, { success: true, data: gis.resolveTileConfig() });
  });

  match('POST', '/alert-zones', async (req, res) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    const body = await readBody(req);
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!gis.isInIran(lat, lng)) {
      return json(res, 400, {
        success: false,
        error: { code: 'OUT_OF_IRAN_BOUNDS', message: 'مختصات خارج از محدوده ایران است' },
      });
    }
    const zone = {
      id: uid(),
      consumerId: user.sub,
      label: body.label || 'home',
      lat,
      lng,
      radiusM: Number(body.radiusM) > 0 ? Number(body.radiusM) : gis.ALERT_RADIUS_M,
      vendorTypes: Array.isArray(body.vendorTypes) ? body.vendorTypes : [],
      createdAt: new Date().toISOString(),
    };
    zones.set(zone.id, zone);
    return json(res, 200, { success: true, data: zone });
  });

  match('GET', '/alert-zones', (req, res) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    const list = Array.from(zones.values()).filter((z) => z.consumerId === user.sub);
    return json(res, 200, { success: true, data: list });
  });

  match('GET', '/alert-zones/:id/nearby', (req, res, params) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    const zone = zones.get(params.id);
    if (!zone || zone.consumerId !== user.sub) {
      return json(res, 404, { success: false, error: { code: 'NOT_FOUND' } });
    }
    const pins = ctx.map.getMemoryLocations().map((l) => ({
      vendorProfileId: l.vendorProfileId,
      businessName: l.businessName,
      vendorType: l.vendorType,
      lat: l.lat,
      lng: l.lng,
    }));
    const hits = gis.vendorsInPerimeter(zone, pins, { lat: zone.lat, lng: zone.lng });
    return json(res, 200, {
      success: true,
      data: { zone, hits, alertCount: hits.length, radiusM: zone.radiusM },
    });
  });

  match('POST', '/gis/locate', async (req, res) => {
    const body = await readBody(req);
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const ok = gis.isInIran(lat, lng);
    return json(res, 200, {
      success: true,
      data: {
        ok,
        lat,
        lng,
        bounds: gis.IRAN_BOUNDS,
        message: ok ? 'موقعیت معتبر' : 'خارج از محدوده ایران',
      },
    });
  });

  match('POST', '/gis/proximity', async (req, res) => {
    const body = await readBody(req);
    const from = { lat: Number(body.fromLat), lng: Number(body.fromLng) };
    const to = { lat: Number(body.toLat), lng: Number(body.toLng) };
    if (![from.lat, from.lng, to.lat, to.lng].every(Number.isFinite)) {
      return json(res, 400, { success: false, error: { code: 'VALIDATION_FAILED' } });
    }
    return json(res, 200, { success: true, data: gis.estimateProximity(from, to) });
  });
}

module.exports = { attachGisRoutes, zones };
