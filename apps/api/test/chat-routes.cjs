/**
 * Phase 9 — order chat + notification endpoints for mini API.
 */
function attachChatRoutes(ctx, match, json, readBody, authUser) {
  /** In-memory chat threads: orderId -> messages[] */
  const threads = new Map();
  const notices = new Map(); // userId -> notifications[]

  function pushNotice(userId, topic, payload) {
    const list = notices.get(userId) || [];
    list.unshift({
      id: `n_${Date.now()}_${list.length}`,
      topic,
      payload,
      createdAt: new Date().toISOString(),
    });
    notices.set(userId, list.slice(0, 50));
    return list[0];
  }

  match('GET', '/orders/:orderId/messages', (req, res, params) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    const msgs = threads.get(params.orderId) || [];
    return json(res, 200, { success: true, data: msgs });
  });

  match('POST', '/orders/:orderId/messages', async (req, res, params) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    const body = await readBody(req);
    const text = String(body.body || body.text || '').slice(0, 1000).trim();
    if (!text) return json(res, 400, { success: false, error: { message: 'empty message' } });

    let order = null;
    try {
      order = ctx.orders.get(params.orderId);
    } catch {
      order = null;
    }
    const from = user.role === 'VENDOR' ? `vp_${user.sub}` : user.sub;
    const msg = {
      id: `msg_${Date.now()}`,
      orderId: params.orderId,
      from,
      role: user.role,
      body: text,
      createdAt: new Date().toISOString(),
    };
    const list = threads.get(params.orderId) || [];
    list.push(msg);
    threads.set(params.orderId, list);

    // notify the other party
    const other =
      user.role === 'VENDOR'
        ? order?.consumerId || 'consumer'
        : order?.vendorProfileId || 'vendor';
    pushNotice(other, 'chat.message', { orderId: params.orderId, from, preview: text.slice(0, 40) });
    const bus = ctx.notifications || ctx.notif;
    if (bus?.notify) {
      bus.notify({
        userId: other,
        channel: 'websocket',
        topic: 'chat.message',
        payload: { orderId: params.orderId, from, body: text },
      });
    }

    return json(res, 200, { success: true, data: msg });
  });

  match('GET', '/notifications', (req, res) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    const keys = [user.sub, `vp_${user.sub}`, `vp_admin_${user.sub}`];
    const out = [];
    const bus = ctx.notifications || ctx.notif;
    for (const k of keys) {
      out.push(...(notices.get(k) || []));
      try {
        out.push(...((bus && bus.history && bus.history(k, 20)) || []));
      } catch {
        /* ignore */
      }
    }
    out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return json(res, 200, { success: true, data: out.slice(0, 30) });
  });

  match('GET', '/notifications/health', (req, res) => {
    return json(res, 200, {
      success: true,
      data: { transport: 'websocket-facade', push: 'stub', chat: true },
    });
  });

  // seed a demo thread
  threads.set('demo_order', [
    {
      id: 'm1',
      orderId: 'demo_order',
      from: 'consumer_demo',
      role: 'CONSUMER',
      body: 'سلام، سفارش کی آماده می‌شود؟',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'm2',
      orderId: 'demo_order',
      from: 'vp_vendor_demo',
      role: 'VENDOR',
      body: 'تا یک ساعت دیگر ارسال می‌شود.',
      createdAt: new Date().toISOString(),
    },
  ]);
}

module.exports = { attachChatRoutes };
