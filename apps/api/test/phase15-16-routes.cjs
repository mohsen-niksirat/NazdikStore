/**
 * Enterprise Phase 15–16 — assistant + admin BI/fraud APIs.
 */
const shared = require('@nazdik/shared');

const otpLog = [];
const cancelLog = new Map();
const fraudFlags = new Map();
const analyticsCache = new Map();

function attachAssistantBiRoutes(ctx, match, json, readBody, authUser) {
  match('POST', '/assistant/query', async (req, res) => {
    const body = await readBody(req);
    const result = await shared.assistantQuery(body.query || '', {
      externalParse: async () => {
        if (process.env.AI_ENDPOINT === 'disabled') throw new Error('AI down');
        return null;
      },
    });
    const params = shared.intentToSearchParams(result.intent);
    return json(res, 200, {
      success: true,
      data: {
        source: result.source,
        intent: result.intent,
        searchParams: params,
        hits: [],
        degrade: result.source === 'local' ? 'local-parser' : null,
      },
    });
  });

  match('POST', '/assistant/image-rfq', async (req, res) => {
    const body = await readBody(req);
    const cls = shared.classifyImageTags(body.filename || body.mime || '');
    return json(res, 200, { success: true, data: cls });
  });

  match('POST', '/assistant/faq', async (req, res) => {
    const body = await readBody(req);
    const reply = shared.vendorAutoReply(body.message || '');
    return json(res, 200, { success: true, data: { reply, matched: Boolean(reply) } });
  });

  match('POST', '/fraud/otp-event', async (req, res) => {
    const body = await readBody(req);
    const rec = { phone: body.phone, at: Date.now(), ip: body.ip || '' };
    otpLog.push(rec);
    const recent = otpLog.filter((x) => x.phone === rec.phone && Date.now() - x.at < 10 * 60 * 1000);
    if (recent.length >= 8) {
      fraudFlags.set(`otp:${rec.phone}`, {
        score: 0.9,
        reasons: ['OTP_ABUSE'],
        badge: 'OTP_ABUSE',
        at: Date.now(),
      });
      return json(res, 200, {
        success: true,
        data: { flagged: true, reason: 'OTP_ABUSE', count: recent.length },
      });
    }
    return json(res, 200, { success: true, data: { flagged: false, count: recent.length } });
  });

  match('POST', '/fraud/cancel-event', async (req, res) => {
    const body = await readBody(req);
    const userId = body.userId || 'anon';
    const list = cancelLog.get(userId) || [];
    list.push(Date.now());
    const window = list.filter((t) => Date.now() - t < 5 * 60 * 1000);
    cancelLog.set(userId, window);
    if (window.length >= 5) {
      fraudFlags.set(`cancel:${userId}`, {
        score: 0.85,
        reasons: ['RAPID_CANCELLATION'],
        badge: 'RAPID_CANCELLATION',
        at: Date.now(),
      });
      return json(res, 200, {
        success: true,
        data: { flagged: true, reason: 'RAPID_CANCELLATION', count: window.length },
      });
    }
    return json(res, 200, { success: true, data: { flagged: false, count: window.length } });
  });

  match('GET', '/admin/fraud', (req, res) => {
    const user = authUser(ctx, req);
    if (!user || user.role !== 'ADMIN') {
      return json(res, 403, { success: false, error: { code: 'FORBIDDEN' } });
    }
    return json(res, 200, {
      success: true,
      data: Array.from(fraudFlags.entries()).map(([k, v]) => ({ key: k, ...v })),
    });
  });

  match('GET', '/admin/metrics', (req, res) => {
    const user = authUser(ctx, req);
    if (!user || user.role !== 'ADMIN') {
      return json(res, 403, { success: false, error: { code: 'FORBIDDEN' } });
    }
    const cacheKey = 'metrics';
    const hit = analyticsCache.get(cacheKey);
    if (hit && Date.now() - hit.at < 60000) {
      return json(res, 200, { success: true, data: hit.data, cached: true, ttlMs: 60000 });
    }
    let gmv = 0;
    let orderCount = 0;
    try {
      const vendors = ['vp_food_1', 'vp_vendor_demo', 'vp_clinic_demo', 'vp_field_1'];
      for (const vp of vendors) {
        const list = ctx.orders.listForVendor(vp) || [];
        for (const o of list) {
          orderCount += 1;
          gmv += o.totalToman || 0;
        }
      }
    } catch {
      /* ignore */
    }
    const commissionBps = Number(process.env.PLATFORM_COMMISSION_BPS || 1000);
    const takeRate = commissionBps / 10000;
    const data = {
      gmvToman: gmv,
      orderCount,
      takeRate,
      aovToman: orderCount ? Math.round(gmv / orderCount) : 0,
      commissionToman: Math.round(gmv * takeRate),
      dau: 120,
      mau: 2400,
      series: [
        { t: '2026-09-15', orders: 12, gmv: 4000000 },
        { t: '2026-09-16', orders: 18, gmv: 6200000 },
        { t: '2026-09-17', orders: orderCount || 9, gmv: gmv || 3000000 },
      ],
    };
    analyticsCache.set(cacheKey, { at: Date.now(), data });
    return json(res, 200, { success: true, data, cached: false, ttlMs: 60000 });
  });

  // ── KYC verification queue (Phase 16 bureau) ──
  if (!global.__nazdikKyc) global.__nazdikKyc = new Map();

  match('POST', '/admin/kyc/:vendorProfileId', async (req, res, params) => {
    const user = authUser(ctx, req);
    if (!user || user.role !== 'ADMIN') {
      return json(res, 403, { success: false, error: { code: 'FORBIDDEN' } });
    }
    const body = await readBody(req);
    const rec = {
      vendorProfileId: params.vendorProfileId,
      status: body.status === 'REJECTED' ? 'REJECTED' : body.status === 'PENDING' ? 'PENDING' : 'APPROVED',
      reason: body.reason ? String(body.reason).slice(0, 200) : null,
      license: body.license ? String(body.license).slice(0, 80) : null,
      nationalId: body.nationalId ? String(body.nationalId).slice(0, 20) : null,
      updatedAt: new Date().toISOString(),
    };
    global.__nazdikKyc.set(params.vendorProfileId, rec);
    return json(res, 200, { success: true, data: rec });
  });

  match('GET', '/admin/kyc', (req, res) => {
    const user = authUser(ctx, req);
    if (!user || user.role !== 'ADMIN') {
      return json(res, 403, { success: false, error: { code: 'FORBIDDEN' } });
    }
    return json(res, 200, {
      success: true,
      data: Array.from(global.__nazdikKyc.values()),
    });
  });
}

module.exports = { attachAssistantBiRoutes, fraudFlags };
