/**
 * Enterprise Phase 12 — search API (Persian fuzzy + geo-rank + autocomplete).
 */
const SEARCH_DOCS = [];

function seedDocsFromFeed(ctx, map) {
  if (SEARCH_DOCS.length) return;
  try {
    const pins = ctx.map.getMemoryLocations();
    for (const p of pins) {
      SEARCH_DOCS.push({
        id: p.vendorProfileId,
        vendorProfileId: p.vendorProfileId,
        title: p.businessName,
        subtitle: p.description || p.address || '',
        category: p.vendorType,
        categoryTags: p.categoryTags || [],
        lat: p.lat,
        lng: p.lng,
        rating: 3.5 + ((p.vendorProfileId.length * 7) % 15) / 10,
        isOpenNow: !p.isHomeBased || Math.random() > 0.3,
      });
    }
  } catch {
    /* ignore */
  }
  // extra catalogue docs
  const extras = [
    { id: 'p_food_1', title: 'پیتزای خونگی', subtitle: 'آشپزخانه مادر', category: 'FOOD', lat: 35.692, lng: 51.392, rating: 4.6, isOpenNow: true },
    { id: 'p_food_2', title: 'پيتزا مخصوص', subtitle: 'فست فود نزدیک', category: 'FOOD', lat: 35.7, lng: 51.4, rating: 4.2, isOpenNow: true },
    { id: 'p_pack', title: 'تعمیر پکیج', subtitle: 'خدمات میدانی', category: 'FIELD_SERVICE', lat: 35.67, lng: 51.42, rating: 4.0, isOpenNow: true },
    { id: 'p_nan', title: 'نان سنگک تازه', subtitle: 'نانوایی نزدیک', category: 'FOOD', lat: 35.6865, lng: 51.385, rating: 4.8, isOpenNow: true },
  ];
  for (const e of extras) {
    if (!SEARCH_DOCS.some((d) => d.id === e.id)) SEARCH_DOCS.push(e);
  }
}

function attachSearchRoutes(ctx, match, json, readBody, authUser) {
  const shared = require('@nazdik/shared');

  match('GET', '/search', (req, res) => {
    seedDocsFromFeed(ctx);
    const url = String(req.url || '');
    const qParam = url.includes('q=') ? decodeURIComponent(url.split('q=')[1].split('&')[0]) : '';
    const lat = url.includes('lat=') ? Number(url.split('lat=')[1].split('&')[0]) : undefined;
    const lng = url.includes('lng=') ? Number(url.split('lng=')[1].split('&')[0]) : undefined;
    const maxKm = url.includes('maxKm=') ? Number(url.split('maxKm=')[1].split('&')[0]) : undefined;
    const origin = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined;

    const t0 = performance.now();
    const hits = shared.geoRankSearch(qParam, SEARCH_DOCS, {
      origin,
      maxDistanceM: maxKm != null ? maxKm * 1000 : undefined,
    });
    const ms = performance.now() - t0;

    return json(res, 200, {
      success: true,
      data: {
        query: qParam,
        normalized: shared.normalizePersian(qParam),
        count: hits.length,
        tookMs: Number(ms.toFixed(2)),
        hits: hits.slice(0, 30),
      },
    });
  });

  match('GET', '/search/autocomplete', (req, res) => {
    seedDocsFromFeed(ctx);
    const url = String(req.url || '');
    const qParam = url.includes('q=') ? decodeURIComponent(url.split('q=')[1].split('&')[0]) : '';
    const t0 = performance.now();
    const suggestions = shared.autocomplete(qParam, SEARCH_DOCS, 8);
    const ms = performance.now() - t0;
    return json(res, 200, {
      success: true,
      data: {
        query: qParam,
        normalized: shared.normalizePersian(qParam),
        suggestions,
        tookMs: Number(ms.toFixed(2)),
        trending: shared.TRENDING_TAGS,
      },
    });
  });

  match('GET', '/search/trending', (req, res) => {
    return json(res, 200, { success: true, data: shared.TRENDING_TAGS });
  });

  match('POST', '/search/admin/doc', async (req, res) => {
    seedDocsFromFeed(ctx);
    const body = await readBody(req);
    const doc = {
      id: body.id || `doc_${Date.now().toString(36)}`,
      vendorProfileId: body.vendorProfileId || body.id,
      title: body.title,
      subtitle: body.subtitle,
      category: body.category,
      categoryTags: body.categoryTags || [],
      lat: body.lat,
      lng: body.lng,
      rating: body.rating,
      isOpenNow: body.isOpenNow,
    };
    const idx = SEARCH_DOCS.findIndex((d) => d.id === doc.id);
    if (idx >= 0) SEARCH_DOCS[idx] = doc;
    else SEARCH_DOCS.push(doc);
    return json(res, 200, { success: true, data: doc });
  });
}

module.exports = { attachSearchRoutes, SEARCH_DOCS };
