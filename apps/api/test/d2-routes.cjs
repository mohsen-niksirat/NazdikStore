/**
 * D2 — Search map deep-link helpers (no server route required; shared via client).
 * Extra: GET /search/:id/map-pin for coordinate pin
 */
function attachD2Routes(ctx, match, json, readBody, authUser) {
  match('GET', '/search/map-pin/:id', (req, res, params) => {
    const pins = ctx.map.getMemoryLocations();
    const hit = pins.find((p) => p.vendorProfileId === params.id);
    if (!hit) {
      return json(res, 404, { success: false, error: { code: 'NOT_FOUND' } });
    }
    return json(res, 200, {
      success: true,
      data: {
        id: hit.vendorProfileId,
        businessName: hit.businessName,
        vendorType: hit.vendorType,
        lat: hit.lat,
        lng: hit.lng,
        mapHref: `/map?lat=${hit.lat}&lng=${hit.lng}&radiusKm=3`,
      },
    });
  });
}

module.exports = { attachD2Routes };
