/**
 * P19 — Consumer order command center APIs.
 */
function attachP19Routes(ctx, match, json, readBody, authUser) {
  match('GET', '/orders/:orderId/receipt', (req, res, params) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    let order;
    try {
      order = ctx.orders.get(params.orderId);
    } catch {
      return json(res, 404, { success: false, error: { code: 'NOT_FOUND' } });
    }
    const isOwner = order.consumerId === user.sub || user.role === 'ADMIN';
    const isVendor = order.vendorProfileId === `vp_${user.sub}` || user.role === 'VENDOR';
    if (!isOwner && !isVendor) {
      return json(res, 403, { success: false, error: { code: 'FORBIDDEN' } });
    }
    return json(res, 200, {
      success: true,
      data: {
        brand: 'NazdikStore',
        orderId: order.id,
        kind: order.kind,
        status: order.status,
        totalToman: order.totalToman,
        lines: order.lines,
        deliveryAddress: order.deliveryAddress,
        vendorProfileId: order.vendorProfileId,
        createdAt: order.createdAt,
      },
    });
  });

  match('POST', '/orders/:orderId/dispute', async (req, res, params) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    const body = await readBody(req);
    let order;
    try {
      order = ctx.orders.get(params.orderId);
    } catch {
      return json(res, 404, { success: false, error: { code: 'NOT_FOUND' } });
    }
    if (order.consumerId !== user.sub && user.role !== 'ADMIN') {
      return json(res, 403, { success: false, error: { code: 'FORBIDDEN' } });
    }
    if (order.status === 'CANCELLED') {
      return json(res, 400, {
        success: false,
        error: { code: 'INVALID_STATUS', message: 'سفارش لغوشده قابل اختلاف نیست' },
      });
    }
    if (order.status === 'COMPLETED') {
      return json(res, 400, {
        success: false,
        error: { code: 'ALREADY_COMPLETED', message: 'سفارش تکمیل شده است' },
      });
    }
    try {
      ctx.orders.transition(params.orderId, 'DISPUTED', { id: user.sub, role: user.role });
    } catch (e) {
      // invalid transition e.g. PENDING->DISPUTED not allowed — try IN_PROGRESS first
      try {
        if (order.status === 'PENDING_ACCEPTANCE') {
          await ctx.orders.transition(params.orderId, 'PREPARING', { id: user.sub, role: user.role });
          await ctx.orders.transition(params.orderId, 'IN_PROGRESS', { id: user.sub, role: user.role });
        }
        ctx.orders.transition(params.orderId, 'DISPUTED', { id: user.sub, role: user.role });
      } catch (e2) {
        return json(res, 409, {
          success: false,
          error: {
            code: 'INVALID_TRANSITION',
            message: e2.message || e.message || 'ثبت اختلاف ممکن نیست',
          },
        });
      }
    }
    order.meta = { ...(order.meta || {}), dispute: { reason: body.reason || '', at: Date.now() } };
    return json(res, 200, {
      success: true,
      data: { orderId: order.id, status: order.status || 'DISPUTED', reason: body.reason || null },
    });
  });
}

module.exports = { attachP19Routes };
