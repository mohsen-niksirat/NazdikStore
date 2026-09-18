/**
 * P20 — Vendor operating hours + trust bits.
 */
function attachP20Routes(ctx, match, json, readBody, authUser) {
  // hours: vendorProfileId -> [{weekday 0-6, start, end}]
  if (!global.__nazdikHours) global.__nazdikHours = new Map();

  function isOpenNow(rules) {
    if (!rules || !rules.length) return true; // unknown = open for demo
    const now = new Date();
    // Tehran-ish: use local server weekday/minutes
    const wd = now.getDay();
    const minute = now.getHours() * 60 + now.getMinutes();
    return rules.some((r) => r.weekday === wd && minute >= r.startMinute && minute < r.endMinute);
  }

  match('POST', '/vendors/me/hours', async (req, res) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    const body = await readBody(req);
    const vp = user.role === 'ADMIN' ? `vp_admin_${user.sub}` : `vp_${user.sub}`;
    const rules = Array.isArray(body.rules)
      ? body.rules.map((r) => ({
          weekday: Number(r.weekday),
          startMinute: Number(r.startMinute),
          endMinute: Number(r.endMinute),
        }))
      : [];
    global.__nazdikHours.set(vp, rules);
    return json(res, 200, {
      success: true,
      data: { vendorProfileId: vp, rules, isOpenNow: isOpenNow(rules) },
    });
  });

  match('GET', '/vendors/:id/hours', (req, res, params) => {
    const rules = global.__nazdikHours.get(params.id) || [];
    return json(res, 200, {
      success: true,
      data: { rules, isOpenNow: isOpenNow(rules) },
    });
  });

  // Seed demo clinic hours weekdays 9-17
  global.__nazdikHours.set(
    'vp_clinic_demo',
    [0, 1, 2, 3, 4].map((weekday) => ({
      weekday,
      startMinute: 9 * 60,
      endMinute: 17 * 60,
    })),
  );
  global.__nazdikHours.set(
    'vp_food_1',
    [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      startMinute: 10 * 60,
      endMinute: 22 * 60,
    })),
  );

  // Patch feed profile listing: wrap getVendorProfile via extra endpoint
  match('GET', '/vendors/:id/trust', (req, res, params) => {
    const rules = global.__nazdikHours.get(params.id) || [];
    let reviews = { count: 0, average: 0 };
    try {
      reviews = ctx.reviews.summaryForVendor(params.id);
    } catch {
      /* ignore */
    }
    const isHome = ['vp_food_1', 'vp_food_4', 'vp_field_1'].includes(params.id);
    return json(res, 200, {
      success: true,
      data: {
        vendorProfileId: params.id,
        isOpenNow: isOpenNow(rules),
        hours: rules,
        reviews,
        privacy: isHome
          ? {
              homeBased: true,
              fa: 'مکان دقیق این فروشنده تا تایید سفارش مخفی می‌ماند (شعاع ~۲۰۰ متر).',
            }
          : null,
      },
    });
  });
}

module.exports = { attachP20Routes };
