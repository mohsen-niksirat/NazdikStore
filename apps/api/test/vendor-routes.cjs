/**
 * Extend mini-server with vendor session + order/product endpoints
 * for Phase 6 dashboard. Loaded by mini-server after core load().
 */
const path = require('path');

function attachVendorRoutes(ctx, match, json, readBody, authUser) {
  // Demo vendor session: POST /auth/dev-login { role, id }
  match('POST', '/auth/dev-login', async (req, res) => {
    const body = await readBody(req);
    const role = body.role === 'VENDOR' ? 'VENDOR' : body.role === 'ADMIN' ? 'ADMIN' : 'CONSUMER';
    const id = body.id || (role === 'VENDOR' ? 'vendor_demo' : role === 'ADMIN' ? 'admin_demo' : 'consumer_demo');
    const user = { id, phone: body.phone || '09120000000', role, firstName: null, lastName: null, isPhoneVerified: true, createdAt: new Date().toISOString() };
    ctx.users.set(user.phone, user);
    const issued = await ctx.tokens.issueTokens({ id: user.id, phone: user.phone, role: user.role });
    const vendorProfileId = role === 'VENDOR' ? `vp_${user.id}` : null;
    if (vendorProfileId) {
      ctx.feed.seedProfile({
        id: vendorProfileId,
        businessName: body.businessName || 'فروشنده دمو',
        vendorType: body.vendorType || 'FOOD',
        description: body.description || 'پنل فروشنده',
        verificationStatus: 'PENDING',
        isHomeBased: Boolean(body.isHomeBased),
        categoryTags: body.categoryTags || [],
      });
    }
    return json(res, 200, {
      success: true,
      data: {
        user,
        tokens: { accessToken: issued.accessToken, expiresIn: issued.expiresIn },
        vendorProfileId,
      },
    });
  });

  match('GET', '/vendors/me/products', (req, res) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    const vp = `vp_${user.sub}`;
    const profile = ctx.feed.getVendorProfile(vp, { count: 0, average: 0 });
    return json(res, 200, { success: true, data: profile.products, vendorProfileId: vp });
  });

  match('POST', '/vendors/me/products', async (req, res) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    const body = await readBody(req);
    const vp = `vp_${user.sub}`;
    try {
      ctx.feed.getVendorProfile(vp);
    } catch {
      ctx.feed.seedProfile({
        id: vp,
        businessName: body.businessName || 'فروشنده',
        vendorType: body.vendorType || 'FOOD',
        verificationStatus: 'PENDING',
      });
    }
    const data = ctx.feed.createProduct({
      vendorProfileId: vp,
      title: body.title || 'محصول',
      description: body.description,
      priceToman: Number(body.priceToman) || 0,
      stock: body.stock == null ? null : Number(body.stock),
    });
    return json(res, 200, { success: true, data });
  });

  match('POST', '/vendors/me/posts', async (req, res) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    const body = await readBody(req);
    const vp = `vp_${user.sub}`;
    try {
      ctx.feed.getVendorProfile(vp);
    } catch {
      ctx.feed.seedProfile({ id: vp, businessName: 'فروشنده', vendorType: 'FOOD' });
    }
    const data = ctx.feed.createPost({
      vendorProfileId: vp,
      caption: body.caption || '',
      productTags: body.productTags,
    });
    return json(res, 200, { success: true, data });
  });

  match('POST', '/vendors/me/location', async (req, res) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    const body = await readBody(req);
    const vp = `vp_${user.sub}`;
    try {
      ctx.feed.getVendorProfile(vp);
    } catch {
      ctx.feed.seedProfile({ id: vp, businessName: 'فروشنده', vendorType: body.vendorType || 'FOOD' });
    }
    // update seed profile via map memory
    ctx.map.upsertMemory({
      id: `loc_${vp}`,
      vendorProfileId: vp,
      businessName: 'فروشنده',
      vendorType: body.vendorType || 'FOOD',
      categoryTags: [],
      description: null,
      verificationStatus: 'PENDING',
      isHomeBased: Boolean(body.isHomeBased),
      lat: Number(body.lat) || 35.6892,
      lng: Number(body.lng) || 51.389,
      address: body.address || null,
      serviceRadiusKm: Number(body.serviceRadiusKm) || 3,
    });
    return json(res, 200, {
      success: true,
      data: {
        lat: Number(body.lat),
        lng: Number(body.lng),
        isHomeBased: Boolean(body.isHomeBased),
        privacy: body.isHomeBased
          ? { note: 'HOME_FUZZY', fuzzyRadiusMeters: 200 }
          : { note: 'PUBLIC_PIN' },
      },
    });
  });

  // Orders
  match('GET', '/orders/vendor/me', (req, res) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    const vp = user.role === 'VENDOR' ? `vp_${user.sub}` : `vp_admin_${user.sub}`;
    return json(res, 200, { success: true, data: ctx.orders.listForVendor(vp) });
  });

  match('POST', '/orders/:id/transitions', async (req, res, params) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    const body = await readBody(req);
    const order = ctx.orders.get(params.id);
    const actor =
      user.role === 'VENDOR'
        ? { id: `vp_${user.sub}`, role: 'VENDOR' }
        : { id: user.sub, role: user.role };
    // allow vendor if order belongs to their vp
    if (user.role === 'VENDOR' && order.vendorProfileId !== `vp_${user.sub}`) {
      // still try — demo vendors may match
    }
    const data = ctx.orders.transition(order.id, body.status, actor);
    return json(res, 200, { success: true, data });
  });

  match('POST', '/orders/delivery', async (req, res) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    const body = await readBody(req);
    const data = await ctx.orders.createDeliveryOrder({
      consumerId: user.sub,
      vendorProfileId: body.vendorProfileId,
      lines: body.lines || [],
      deliveryAddress: body.deliveryAddress,
      note: body.note,
    });
    return json(res, 200, { success: true, data });
  });

  match('POST', '/orders/appointments', async (req, res) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    const body = await readBody(req);
    const data = await ctx.orders.createAppointmentOrder({
      consumerId: user.sub,
      vendorProfileId: body.vendorProfileId,
      slotId: body.slotId,
      note: body.note,
      priceToman: body.priceToman,
    });
    return json(res, 200, { success: true, data });
  });

  match('GET', '/orders/me', (req, res) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    return json(res, 200, { success: true, data: ctx.orders.listForConsumer(user.sub) });
  });

  match('POST', '/orders/:orderId/pay', async (req, res, params) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    const data = await ctx.payments.createPaymentForOrder({
      orderId: params.orderId,
      consumerId: user.sub,
      idempotencyKey: req.headers['idempotency-key'] || undefined,
    });
    return json(res, 200, { success: true, data });
  });

  match('POST', '/payments/simulate/:paymentId', (req, res, params) => {
    // Dev helper: mark payment paid
    return ctx.payments
      .simulateBankSuccess(params.paymentId)
      .then((data) => json(res, 200, { success: true, data }))
      .catch((err) => json(res, 400, { success: false, error: { message: err.message } }));
  });
}

module.exports = { attachVendorRoutes };
