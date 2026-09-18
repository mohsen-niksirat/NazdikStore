/**
 * P25 — Courier job list + RFQ offer list endpoints.
 */
function attachP25Routes(ctx, match, json, readBody, authUser) {
  match('GET', '/courier/jobs', (req, res) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    // assigned dispatches for this courier + open RFQ nearby
    const jobs = [];
    try {
      const mod = require('./phase11-routes.cjs');
      if (mod.dispatches) {
        for (const d of mod.dispatches.values()) {
          if (d.courierUserId === user.sub || user.role === 'ADMIN') {
            jobs.push({
              type: 'DELIVERY',
              orderId: d.orderId,
              status: d.status,
              dest: { lat: d.destLat, lng: d.destLng },
              etaMinutes: d.etaMinutes,
              courierUserId: d.courierUserId,
            });
          }
        }
      }
    } catch {
      /* ignore */
    }
    return json(res, 200, { success: true, data: jobs });
  });

  match('GET', '/rfq/open', (req, res) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    try {
      const data = ctx.rfq.listOpenJobsForVendor(`vp_${user.sub}`);
      return json(res, 200, { success: true, data });
    } catch (e) {
      return json(res, 200, { success: true, data: [] });
    }
  });

  match('POST', '/rfq/:jobId/quotes/:quoteId/accept', (req, res, params) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    try {
      const data = ctx.rfq.acceptQuote({
        jobRequestId: params.jobId,
        quoteId: params.quoteId,
        consumerId: user.sub,
      });
      return json(res, 200, { success: true, data });
    } catch (e) {
      return json(res, e.status || 400, {
        success: false,
        error: { code: e.code || 'ERROR', message: e.message },
      });
    }
  });
}

module.exports = { attachP25Routes };
