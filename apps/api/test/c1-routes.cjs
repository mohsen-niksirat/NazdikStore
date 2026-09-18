/**
 * C1 — Public shop profile enrichment endpoint.
 */
function attachC1Routes(ctx, match, json, readBody, authUser) {
  match('GET', '/shop/:id', (req, res, params) => {
    const id = params.id;
    let profile = null;
    try {
      profile = ctx.feed.getVendorProfile(id, ctx.reviews.summaryForVendor(id));
    } catch {
      profile = null;
    }
    const trust = global.__nazdikHours?.get(id) || [];
    const now = new Date();
    const wd = now.getDay();
    const minute = now.getHours() * 60 + now.getMinutes();
    const isOpenNow =
      !trust.length || trust.some((r) => r.weekday === wd && minute >= r.startMinute && minute < r.endMinute);

    const pins = ctx.map.getMemoryLocations().find((p) => p.vendorProfileId === id);
    const reviews = ctx.reviews.listForVendor(id).slice(0, 5);

    if (!profile && !pins) {
      return json(res, 404, { success: false, error: { code: 'NOT_FOUND' } });
    }

    return json(res, 200, {
      success: true,
      data: {
        id,
        businessName: profile?.businessName || pins?.businessName || 'فروشنده',
        vendorType: profile?.vendorType || pins?.vendorType || 'FOOD',
        description: profile?.description || pins?.description || '',
        categoryTags: profile?.categoryTags || pins?.categoryTags || [],
        isHomeBased: profile?.isHomeBased ?? pins?.isHomeBased ?? false,
        address: pins?.address || null,
        hours: trust,
        isOpenNow,
        products: profile?.products || [],
        posts: (profile?.posts || []).slice(0, 6),
        reviewSummary: profile?.reviewSummary || ctx.reviews.summaryForVendor(id),
        reviews,
        cta: {
          chat: `/messages?order=demo_order`,
          book: `/book`,
          map: `/map?lat=${pins?.lat ?? 35.6892}&lng=${pins?.lng ?? 51.389}&radiusKm=3`,
        },
      },
    });
  });
}

module.exports = { attachC1Routes };
