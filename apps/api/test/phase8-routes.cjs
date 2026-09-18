/**
 * Production Phase 8 — vendor kanban, stock, vacation, Sheba payouts.
 */
function attachVendorOpsRoutes(ctx, match, json, readBody, authUser) {
  const ops = require('@nazdik/shared');

  const payouts = new Map(); // id -> PayoutRequest
  const vacation = new Map(); // vp -> { on, until?, reason? }
  const stockOverrides = new Map(); // productId -> boolean (false = out of stock)

  function vpOf(user) {
    return user.role === 'ADMIN' ? `vp_admin_${user.sub}` : `vp_${user.sub}`;
  }

  match('GET', '/vendors/me/kanban', (req, res) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    const vp = vpOf(user);
    const orders = ctx.orders.listForVendor(vp);
    const columns = {};
    for (const col of ops.KANBAN_COLUMNS) columns[col.key] = [];
    for (const o of orders) {
      if (columns[o.status]) columns[o.status].push(o);
      else if (o.status === 'SCHEDULED') columns.PREPARING.push(o);
    }
    return json(res, 200, {
      success: true,
      data: {
        vendorProfileId: vp,
        columns: ops.KANBAN_COLUMNS.map((c) => ({
          ...c,
          count: columns[c.key].length,
          orders: columns[c.key],
        })),
        nextMap: Object.fromEntries(
          ops.KANBAN_COLUMNS.map((c) => [c.key, ops.nextKanbanStatus(c.key)]),
        ),
      },
    });
  });

  match('POST', '/vendors/me/kanban/:orderId/advance', (req, res, params) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    const vp = vpOf(user);
    try {
      const order = ctx.orders.get(params.orderId);
      const next = ops.nextKanbanStatus(order.status);
      if (!next) {
        return json(res, 400, {
          success: false,
          error: { code: 'NO_TRANSITION', message: 'گذار بعدی مجاز نیست' },
        });
      }
      const data = ctx.orders.transition(params.orderId, next, { id: vp, role: 'VENDOR' });
      // Loyalty punch: stamp when order completes (Phase 13 integration)
      if (next === 'COMPLETED') {
        try {
          const sharedL = require('@nazdik/shared');
          const key = `${order.vendorProfileId}:${order.consumerId}`;
          const store = global.__nazdikLoyalty || (global.__nazdikLoyalty = new Map());
          let card = store.get(key) || {
            vendorProfileId: order.vendorProfileId,
            consumerId: order.consumerId,
            stamps: 0,
            threshold: 5,
            rewardPercent: 50,
          };
          card = sharedL.bumpLoyaltyStamp(card);
          store.set(key, card);
        } catch {
          /* ignore */
        }
      }
      ctx.notifications?.notify?.({
        userId: order.consumerId,
        channel: 'websocket',
        topic: 'order.status',
        payload: { orderId: order.id, status: next },
      });
      return json(res, 200, {
        success: true,
        next,
        data: {
          id: params.orderId,
          status: data?.status || next,
          totalToman: data?.totalToman,
          kind: data?.kind,
        },
      });
    } catch (e) {
      return json(res, e.status || 400, {
        success: false,
        error: { code: e.code || 'ERROR', message: e.message },
      });
    }
  });

  match('GET', '/vendors/me/stock', (req, res) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    const vp = vpOf(user);
    let products = [];
    try {
      products = ctx.feed.getVendorProfile(vp).products;
    } catch {
      products = [];
    }
    return json(res, 200, {
      success: true,
      data: products.map((p) => {
        const inStock = stockOverrides.has(p.id)
          ? Boolean(stockOverrides.get(p.id))
          : p.stock !== 0;
        return {
          ...p,
          inStock,
          faStock: ops.faStockLabel(inStock),
        };
      }),
    });
  });

  match('PATCH', '/vendors/me/stock/:productId', async (req, res, params) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    const body = await readBody(req);
    const inStock = body.inStock !== false;
    stockOverrides.set(params.productId, inStock);
    return json(res, 200, {
      success: true,
      data: {
        productId: params.productId,
        inStock,
        faStock: ops.faStockLabel(inStock),
        badge: inStock ? 'موجود' : 'تمام شد',
      },
    });
  });

  match('GET', '/vendors/me/vacation', (req, res) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    const vp = vpOf(user);
    return json(res, 200, { success: true, data: vacation.get(vp) || { on: false } });
  });

  match('POST', '/vendors/me/vacation', async (req, res) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    const body = await readBody(req);
    const vp = vpOf(user);
    const state = {
      on: Boolean(body.on),
      reason: body.reason ? String(body.reason).slice(0, 200) : 'تعطیل موقت',
      until: body.until || null,
      updatedAt: new Date().toISOString(),
    };
    vacation.set(vp, state);
    return json(res, 200, { success: true, data: state });
  });

  match('GET', '/vendors/me/ledger', (req, res) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    const vp = vpOf(user);
    const orders = ctx.orders.listForVendor(vp).filter((o) => o.status === 'COMPLETED');
    const gross = orders.reduce((s, o) => s + (o.totalToman || 0), 0);
    const paid = Array.from(payouts.values())
      .filter((p) => p.vendorProfileId === vp && p.status === 'PAID')
      .reduce((s, p) => s + p.amountToman, 0);
    const summary = ops.summarizeLedger({ grossToman: gross, alreadyPaidToman: paid });
    return json(res, 200, {
      success: true,
      data: {
        ...summary,
        completedOrders: orders.length,
        payouts: Array.from(payouts.values()).filter((p) => p.vendorProfileId === vp),
      },
    });
  });

  match('POST', '/vendors/me/payouts', async (req, res) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    const body = await readBody(req);
    const sheba = String(body.sheba || '');
    const amount = Number(body.amountToman);
    if (!ops.isValidSheba(sheba)) {
      return json(res, 400, {
        success: false,
        error: {
          code: 'SHEBA_INVALID',
          message: 'شماره شبا معتبر نیست (IR + ۲۴ رقم + چک‌سامانه ISO 7064)',
        },
      });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return json(res, 400, {
        success: false,
        error: { code: 'VALIDATION_FAILED', message: 'مبلغ نامعتبر' },
      });
    }
    const vp = vpOf(user);
    const orders = ctx.orders.listForVendor(vp).filter((o) => o.status === 'COMPLETED');
    const gross = orders.reduce((s, o) => s + (o.totalToman || 0), 0);
    const paid = Array.from(payouts.values())
      .filter((p) => p.vendorProfileId === vp && (p.status === 'PAID' || p.status === 'PROCESSING' || p.status === 'REQUESTED'))
      .reduce((s, p) => s + p.amountToman, 0);
    const summary = ops.summarizeLedger({ grossToman: gross, alreadyPaidToman: paid });
    if (amount > summary.withdrawableToman) {
      return json(res, 400, {
        success: false,
        error: {
          code: 'INSUFFICIENT_BALANCE',
          message: `موجودی قابل برداشت ${summary.withdrawableToman} تومان است`,
        },
      });
    }
    const reqId = `pay_${Date.now().toString(36)}`;
    const record = {
      id: reqId,
      vendorProfileId: vp,
      sheba: ops.formatSheba(sheba),
      shebaDisplay: ops.formatShebaDisplay(sheba),
      amountToman: amount,
      status: 'REQUESTED',
      createdAt: new Date().toISOString(),
    };
    payouts.set(reqId, record);
    return json(res, 200, { success: true, data: record });
  });

  match('POST', '/admin/payouts/:id/status', async (req, res, params) => {
    const user = authUser(ctx, req);
    if (!user || user.role !== 'ADMIN') {
      return json(res, 403, { success: false, error: { code: 'FORBIDDEN' } });
    }
    const body = await readBody(req);
    const rec = payouts.get(params.id);
    if (!rec) return json(res, 404, { success: false, error: { code: 'NOT_FOUND' } });
    const allowed = ['REQUESTED', 'PROCESSING', 'PAID', 'REJECTED'];
    if (!allowed.includes(body.status)) {
      return json(res, 400, { success: false, error: { code: 'VALIDATION_FAILED' } });
    }
    rec.status = body.status;
    return json(res, 200, { success: true, data: rec });
  });
}

module.exports = { attachVendorOpsRoutes };
