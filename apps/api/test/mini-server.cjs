const path = require('path');
const fs = require('fs');
const Module = require('module');
const http = require('http');
const { URL } = require('url');
const { installResolveHook, installTsHook } = require('./dep-paths.cjs');

const ROOT = path.resolve(__dirname, '..');
const SHARED_SRC = path.join(ROOT, '..', '..', 'packages', 'shared', 'src');
const API_SRC = path.join(ROOT, 'src');
const apiNM = path.join(ROOT, 'node_modules');
const rootNM = path.join(ROOT, '..', 'node_modules');

const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) {
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }
}
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'dev_access_change_me';
process.env.REDIS_URL = '';
process.env.PAYMENT_PROVIDER = process.env.PAYMENT_PROVIDER || 'mock';
process.env.PLATFORM_COMMISSION_BPS = process.env.PLATFORM_COMMISSION_BPS || '1000';
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://127.0.0.1:3000,http://127.0.0.1:3300,http://127.0.0.1:5000';

installResolveHook({ root: ROOT, sharedSrc: SHARED_SRC, apiSrc: API_SRC });
installTsHook();

function load() {
  const shared = require(path.join(SHARED_SRC, 'index.ts'));
  const { RedisService } = require(path.join(API_SRC, 'redis/redis.service.ts'));
  const { OtpService } = require(path.join(API_SRC, 'auth/otp.service.ts'));
  const { SmsService } = require(path.join(API_SRC, 'auth/sms.service.ts'));
  const { TokenService } = require(path.join(API_SRC, 'auth/token.service.ts'));
  const { MapService } = require(path.join(API_SRC, 'map/map.service.ts'));
  const { FeedService } = require(path.join(API_SRC, 'feed/feed.service.ts'));
  const { ReviewsService } = require(path.join(API_SRC, 'reviews/reviews.service.ts'));
  const { TimeSlotService } = require(path.join(API_SRC, 'orders/time-slot.service.ts'));
  const { OrdersService } = require(path.join(API_SRC, 'orders/orders.service.ts'));
  const { RfqService } = require(path.join(API_SRC, 'orders/rfq.service.ts'));
  const { WalletService } = require(path.join(API_SRC, 'payments/wallet.service.ts'));
  const { IdempotencyService } = require(path.join(API_SRC, 'payments/idempotency.service.ts'));
  const { PaymentsService } = require(path.join(API_SRC, 'payments/payments.service.ts'));
  const { NotificationService } = require(path.join(API_SRC, 'notifications/notification.service.ts'));
  const { demoVendors } = require(path.join(API_SRC, 'seed/seed.service.ts'));
  // Bare require — dep-paths resolves from apps/api/node_modules OR monorepo root
  const { JwtService } = require('@nestjs/jwt');
  const { MockGateway } = require(path.join(API_SRC, 'payments/payment-gateway.ts'));

  const prismaStub = {
    $queryRaw: async () => { throw new Error('offline'); },
    $executeRaw: async () => 0,
    user: { upsert: async () => null, findUnique: async () => null, update: async () => null },
    vendorProfile: { findUnique: async () => null, update: async () => null },
    authAuditLog: { create: async () => ({}) },
  };

  const redis = new RedisService();
  redis.clearMemory();
  const sms = { sendOtp: async (phone, code) => console.log(`[SMS] ${phone} → ${code}`) };
  const otp = new OtpService(redis, sms);
  const jwt = new JwtService({
    secret: process.env.JWT_ACCESS_SECRET,
    signOptions: { expiresIn: '15m' },
  });
  const tokens = new TokenService(jwt, redis);
  const reviews = new ReviewsService(prismaStub);
  const slots = new TimeSlotService(prismaStub);
  const orders = new OrdersService(prismaStub, slots, reviews);
  const map = new MapService(prismaStub);
  const feed = new FeedService(prismaStub, { upload: async () => ({}), get: () => null, listByOwner: () => [] });
  const wallet = new WalletService();
  const idem = new IdempotencyService(redis);
  const notif = new NotificationService();
  const payments = new PaymentsService(prismaStub, wallet, idem, notif, orders);
  const rfq = new RfqService(prismaStub, map, orders);
  payments.setGateway('mock', new MockGateway('dev_pay_secret'));

  // seed demo data
  const vendors = demoVendors();
  map.seedMemory(vendors);
  for (const v of vendors) {
    feed.seedProfile({
      id: v.vendorProfileId,
      businessName: v.businessName,
      vendorType: v.vendorType,
      categoryTags: v.categoryTags,
      description: v.description,
      verificationStatus: v.verificationStatus,
      isHomeBased: v.isHomeBased,
      address: v.address,
      displayLat: v.lat,
      displayLng: v.lng,
    });
  }
  feed.createPost({
    vendorProfileId: 'vp_food_1',
    caption: 'قورمه سبزی امروز آماده است.',
    productTags: [{ productId: 'p1', title: 'قورمه', priceToman: 185000 }],
  });

  // simple user store
  const users = new Map(); // phone -> user
  const ctxObj = { shared, otp, tokens, map, feed, reviews, slots, orders, rfq, wallet, payments, notifications: notif, notif, users };

  try {
    const { seedDemoExtras } = require('./seed-demo.cjs');
    const extra = seedDemoExtras(ctxObj);
    console.log('Demo seed extras ready', extra);
  } catch (e) {
    console.warn('seed-demo skipped:', e.message);
  }

  return ctxObj;
}

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': process.env.CORS_ORIGINS || 'http://localhost:3000',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Idempotency-Key',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function authUser(ctx, req) {
  const h = req.headers.authorization || '';
  const token = h.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  try {
    return ctx.tokens.verifyAccess(token);
  } catch {
    return null;
  }
}

function main() {
  const ctx = load();
  const rawPort = Number(process.env.PORT);
  const port = Number.isFinite(rawPort) && rawPort > 0 && rawPort < 65536 ? rawPort : 4000;

  /** @type {Array<{method:string, pattern:RegExp, handler:Function}>} */
  const routes = [];
  function match(method, pattern, handler) {
    // pattern like '/orders/:id/transitions'
    const rx = new RegExp(
      '^' +
        pattern.replace(/\//g, '\\/').replace(/:([A-Za-z0-9_]+)/g, '(?<$1>[^/]+)') +
        '$',
    );
    routes.push({ method, pattern: rx, handler });
  }

  try {
    const { attachVendorRoutes } = require('./vendor-routes.cjs');
    attachVendorRoutes(ctx, match, json, readBody, authUser);
  } catch (err) {
    console.warn('vendor-routes not attached:', (err && err.message) || err);
  }
  try {
    const { attachChatRoutes } = require('./chat-routes.cjs');
    attachChatRoutes(ctx, match, json, readBody, authUser);
  } catch (err) {
    console.warn('chat-routes not attached:', (err && err.message) || err);
  }
  try {
    const { attachGisRoutes } = require('./gis-routes.cjs');
    attachGisRoutes(ctx, match, json, readBody, authUser);
  } catch (err) {
    console.warn('gis-routes not attached:', (err && err.message) || err);
  }
  try {
    const { attachPhase7Routes } = require('./phase7-routes.cjs');
    attachPhase7Routes(ctx, match, json, readBody, authUser);
  } catch (err) {
    console.warn('phase7-routes not attached:', (err && err.message) || err);
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const p = url.pathname.replace(/^\/api\/v1/, '') || '/';
    const method = req.method || 'GET';

    if (method === 'OPTIONS') {
      return json(res, 204, {});
    }

    try {
      for (const r of routes) {
        if (r.method !== method) continue;
        const m = p.match(r.pattern);
        if (!m) continue;
        return await r.handler(req, res, m.groups || {});
      }

      if (p === '/health' || p === '/api/health') {
        return json(res, 200, {
          success: true,
          data: { status: 'ok', service: 'nazdik-api-mini', phase: '1-6', offline: true },
        });
      }

      if (p === '/auth/otp/request' && method === 'POST') {
        const body = await readBody(req);
        const data = await ctx.otp.requestOtp(body.phone, req.socket.remoteAddress || '127.0.0.1');
        return json(res, 200, { success: true, data });
      }

      if (p === '/auth/otp/verify' && method === 'POST') {
        const body = await readBody(req);
        const { phone } = await ctx.otp.verifyOtp(body.phone, body.code);
        const existing = ctx.users.get(phone) || {
          id: `u_${phone}`,
          phone,
          role: 'CONSUMER',
          firstName: null,
          lastName: null,
          isPhoneVerified: true,
          createdAt: new Date().toISOString(),
        };
        ctx.users.set(phone, existing);
        const issued = await ctx.tokens.issueTokens({
          id: existing.id,
          phone: existing.phone,
          role: existing.role,
        });
        return json(res, 200, {
          success: true,
          data: {
            user: existing,
            tokens: { accessToken: issued.accessToken, expiresIn: issued.expiresIn },
            vendorProfile: null,
            requiresProfileCompletion: false,
          },
        });
      }

      if (p === '/map/vendors' && method === 'GET') {
        const data = await ctx.map.queryVendors({
          lat: url.searchParams.get('lat') ? Number(url.searchParams.get('lat')) : undefined,
          lng: url.searchParams.get('lng') ? Number(url.searchParams.get('lng')) : undefined,
          radiusKm: url.searchParams.get('radiusKm')
            ? Number(url.searchParams.get('radiusKm'))
            : 5,
          bbox: url.searchParams.get('bbox') || undefined,
          vendorType: url.searchParams.get('vendorType') || undefined,
          zoom: url.searchParams.get('zoom') ? Number(url.searchParams.get('zoom')) : 13,
        });
        return json(res, 200, { success: true, data });
      }

      if (p === '/map/config' && method === 'GET') {
        return json(res, 200, {
          success: true,
          data: {
            radiusPresetsKm: ctx.shared.RADIUS_PRESETS_KM,
            fuzzyRadiusMeters: 200,
            defaultCenter: ctx.shared.DEFAULT_MAP_CENTER,
            vendorTypes: ctx.shared.VENDOR_TYPES,
          },
        });
      }

      if (p === '/feed' && method === 'GET') {
        return json(res, 200, { success: true, data: ctx.feed.listFeed(20) });
      }

      const vendorProfile = p.match(/^\/vendors\/([^/]+)\/profile$/);
      if (vendorProfile && method === 'GET') {
        const summary = ctx.reviews.summaryForVendor(vendorProfile[1]);
        return json(res, 200, {
          success: true,
          data: ctx.feed.getVendorProfile(vendorProfile[1], summary),
        });
      }

      const vendorReviews = p.match(/^\/vendors\/([^/]+)\/reviews$/);
      if (vendorReviews && method === 'GET') {
        return json(res, 200, {
          success: true,
          data: ctx.reviews.listForVendor(vendorReviews[1]),
          summary: ctx.reviews.summaryForVendor(vendorReviews[1]),
        });
      }

      const vendorSlots = p.match(/^\/vendors\/([^/]+)\/slots$/);
      if (vendorSlots && method === 'GET') {
        const day = url.searchParams.get('day') || new Date().toISOString().slice(0, 10);
        return json(res, 200, {
          success: true,
          data: { day, slots: ctx.slots.listSlots(vendorSlots[1], day) },
        });
      }

      if (p === '/orders/delivery' && method === 'POST') {
        const user = authUser(ctx, req);
        if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
        const body = await readBody(req);
        const data = await ctx.orders.createDeliveryOrder({
          consumerId: user.sub,
          vendorProfileId: body.vendorProfileId,
          lines: body.lines || [],
          deliveryAddress: body.deliveryAddress,
        });
        return json(res, 200, { success: true, data });
      }

      if (p === '/jobs' && method === 'POST') {
        const user = authUser(ctx, req);
        if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
        const body = await readBody(req);
        const data = ctx.rfq.createJobRequest({ ...body, consumerId: user.sub });
        return json(res, 200, { success: true, data });
      }

      const payOrder = p.match(/^\/orders\/([^/]+)\/pay$/);
      if (payOrder && method === 'POST') {
        const user = authUser(ctx, req);
        if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
        const data = await ctx.payments.createPaymentForOrder({
          orderId: payOrder[1],
          consumerId: user.sub,
          idempotencyKey: req.headers['idempotency-key'] || undefined,
        });
        return json(res, 200, { success: true, data });
      }

      if (p === '/payments/webhook' && method === 'POST') {
        const body = await readBody(req);
        const data = await ctx.payments.processWebhook({ ...body, rawPayload: body });
        return json(res, 200, { success: true, data });
      }

      if (p === '/wallet/me' && method === 'GET') {
        const user = authUser(ctx, req);
        if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
        return json(res, 200, {
          success: true,
          data: {
            balanceToman: ctx.wallet.getBalance(user.sub),
            entries: ctx.wallet.listEntries(user.sub).slice(0, 20),
          },
        });
      }

      return json(res, 404, {
        success: false,
        error: { code: 'NOT_FOUND', message: `No route ${method} ${p}` },
      });
    } catch (err) {
      const code = err?.response?.code || err?.code || 'INTERNAL_ERROR';
      return json(res, err?.status || 400, {
        success: false,
        error: {
          code,
          message: err?.response?.message || err?.message || 'error',
        },
      });
    }
  });

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.error(`\nPort ${port} is already in use.`);
      console.error('Fix options:');
      console.error(`  1) Stop the other process:  netstat -ano | findstr :${port}`);
      console.error(`     then:  taskkill /PID <pid> /F`);
      console.error(`  2) Start on another port:   set PORT=4001 && npm run dev`);
      process.exit(1);
    }
    console.error(err);
    process.exit(1);
  });

  server.listen(port, '0.0.0.0', () => {
    console.log('NazdikStore mini API (offline) on http://localhost:' + port);
    console.log('  GET  /api/v1/health');
    console.log('  POST /api/v1/auth/otp/request');
    console.log('  POST /api/v1/auth/otp/verify');
    console.log('  GET  /api/v1/map/vendors?lat=35.6892&lng=51.389&radiusKm=5');
    console.log('  GET  /api/v1/feed');
    console.log('  GET  /api/v1/vendors/vp_food_1/profile');
  });
}

main();
