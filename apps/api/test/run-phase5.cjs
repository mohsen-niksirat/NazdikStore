const path = require('path');
const fs = require('fs');
const assert = require('assert');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const SHARED_SRC = path.join(ROOT, '..', '..', 'packages', 'shared', 'src');
const API_SRC = path.join(ROOT, 'src');
const apiNM = path.join(ROOT, 'node_modules');
const rootNM = path.join(ROOT, '..', 'node_modules');
const ciNM = process.env.CI_NODE_MODULES || '';
const searchRoots = [apiNM, rootNM, ciNM].filter(Boolean);

process.env.JWT_ACCESS_SECRET = 'test_access_secret';
process.env.REDIS_URL = '';
process.env.NODE_ENV = 'test';
process.env.PAYMENT_PROVIDER = 'mock';
process.env.PLATFORM_COMMISSION_BPS = '1000';
process.env.PAYMENT_HMAC_SECRET = 'test_pay_secret';

const compileTs = (filePath) => {
  const source = fs.readFileSync(filePath, 'utf8');
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
    },
    fileName: filePath,
  }).outputText;
};
Module._extensions['.ts'] = function (module, filename) {
  module._compile(compileTs(filename), filename);
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === '@nazdik/shared') return path.join(SHARED_SRC, 'index.ts');
  try {
    return origResolve.call(this, request, parent, ...rest);
  } catch (e) {
    const candidate = path.join(base, request);
    if (fs.existsSync(candidate) || fs.existsSync(candidate + '.js')) {
      return origResolve.call(this, candidate, parent, ...rest);
    }
    throw e;
  }
};
const origPaths = Module._nodeModulePaths;
Module._nodeModulePaths = function (from) {
  const paths = origPaths.call(this, from);
  paths.unshift(...(typeof searchRoots !== 'undefined' ? searchRoots : [apiNM, rootNM]));
  return paths;
};

const results = { passed: 0, failed: 0, errors: [] };
const suites = [];
let currentSuite = null;
function describe(name, fn) {
  const suite = { name, tests: [] };
  suites.push(suite);
  currentSuite = suite;
  fn();
  currentSuite = null;
}
function it(name, fn) {
  currentSuite.tests.push({ name, fn });
}
async function run() {
  for (const suite of suites) {
    console.log('\n' + suite.name);
    for (const test of suite.tests) {
      try {
        await test.fn();
        results.passed++;
        console.log('  OK ' + test.name);
      } catch (err) {
        results.failed++;
        results.errors.push({ suite: suite.name, test: test.name, err });
        console.log('  FAIL ' + test.name);
        console.log('    ' + (err && err.message ? err.message : err));
      }
    }
  }
  console.log('\n--------------------------------');
  console.log('Passed: ' + results.passed);
  console.log('Failed: ' + results.failed);
  if (results.errors.length) {
    for (const e of results.errors) {
      console.log('- [' + e.suite + '] ' + e.test);
      console.log(e.err && e.err.stack ? e.err.stack : e.err);
    }
    process.exit(1);
  }
  process.exit(0);
}

async function main() {
  const { RedisService } = require(path.join(API_SRC, 'redis/redis.service.ts'));
  const { TimeSlotService } = require(path.join(API_SRC, 'orders/time-slot.service.ts'));
  const { OrdersService } = require(path.join(API_SRC, 'orders/orders.service.ts'));
  const { ReviewsService } = require(path.join(API_SRC, 'reviews/reviews.service.ts'));
  const walletMod = require(path.join(API_SRC, 'payments/wallet.service.ts'));
  const { IdempotencyService } = require(path.join(API_SRC, 'payments/idempotency.service.ts'));
  const gatewayMod = require(path.join(API_SRC, 'payments/payment-gateway.ts'));
  const { PaymentsService } = require(path.join(API_SRC, 'payments/payments.service.ts'));
  const { NotificationService } = require(path.join(API_SRC, 'notifications/notification.service.ts'));

  const prismaStub = { $executeRaw: async () => 1 };

  function makeStack() {
    const redis = new RedisService();
    redis.clearMemory();
    const reviews = new ReviewsService(prismaStub);
    const slots = new TimeSlotService(prismaStub);
    const orders = new OrdersService(prismaStub, slots, reviews);
    const wallet = new walletMod.WalletService();
    const idempotency = new IdempotencyService(redis);
    const notifications = new NotificationService();
    const payments = new PaymentsService(prismaStub, wallet, idempotency, notifications, orders);
    reviews.clearMemory();
    slots.clearMemory();
    orders.clearMemory();
    wallet.clearMemory();
    notifications.clearMemory();
    payments.clearMemory();
    payments.setGateway('mock', new gatewayMod.MockGateway('test_pay_secret'));
    payments.setGateway('zarinpal', new gatewayMod.ZarinpalGateway('test_pay_secret'));
    return { redis, reviews, slots, orders, wallet, idempotency, notifications, payments };
  }

  describe('Wallet settlement math', function () {
    it('computes 10% commission by default', function () {
      assert.strictEqual(walletMod.commissionRate(), 0.1);
      const s = walletMod.computeSettlement(100000);
      assert.strictEqual(s.commissionToman, 10000);
      assert.strictEqual(s.netToman, 90000);
    });
    it('commission + net equals gross', function () {
      const s = walletMod.computeSettlement(99999);
      assert.strictEqual(s.commissionToman + s.netToman, 99999);
    });
  });

  describe('Idempotency-Key layer', function () {
    it('replays completed response for same key', async function () {
      const redis = new RedisService();
      redis.clearMemory();
      const idem = new IdempotencyService(redis);
      const key = 'ord_1_pay';
      const first = await idem.begin(key);
      assert.strictEqual(first.proceed, true);
      await idem.complete(key, { paymentId: 'p1', redirectUrl: 'https://x' });
      const second = await idem.begin(key);
      assert.strictEqual(second.proceed, false);
      assert.strictEqual(second.record.response.paymentId, 'p1');
    });
  });

  describe('Payment gateway abstraction', function () {
    it('createGateway returns providers by name', function () {
      assert.strictEqual(gatewayMod.createGateway('mock').name, 'mock');
      assert.strictEqual(gatewayMod.createGateway('zarinpal').name, 'zarinpal');
      assert.strictEqual(gatewayMod.createGateway('saman').name, 'saman');
    });
    it('webhook signature verifies and rejects tampering', function () {
      const gw = new gatewayMod.MockGateway('secret');
      const payload = { authority: 'A1', refId: 'R1', status: 'PAID', amount: 1000 };
      const sig = gw.signWebhook(payload);
      assert.strictEqual(gw.verifyWebhookSignature(payload, sig), true);
      assert.strictEqual(gw.verifyWebhookSignature({ amount: 9999, authority: 'A1', refId: 'R1', status: 'PAID' }, sig), false);
    });
  });

  describe('Payment creation', function () {
    it('creates PENDING payment with authority and redirectUrl', async function () {
      const st = makeStack();
      const order = await st.orders.createDeliveryOrder({
        consumerId: 'c1',
        vendorProfileId: 'vp_food',
        lines: [{ title: 'ghorme', unitPriceToman: 200000, quantity: 1 }],
      });
      const pay = await st.payments.createPaymentForOrder({
        orderId: order.id,
        consumerId: 'c1',
        idempotencyKey: 'pay_' + order.id + '_1',
      });
      assert.strictEqual(pay.status, 'PENDING');
      assert.ok(pay.authority);
      assert.strictEqual(pay.amountToman, 200000);
      assert.strictEqual(pay.commissionToman, 20000);
    });
    it('same Idempotency-Key returns the same payment', async function () {
      const st = makeStack();
      const order = await st.orders.createDeliveryOrder({
        consumerId: 'c1',
        vendorProfileId: 'vp_food',
        lines: [{ title: 'x', unitPriceToman: 10000, quantity: 1 }],
      });
      const key = 'idem_' + order.id;
      const a = await st.payments.createPaymentForOrder({ orderId: order.id, consumerId: 'c1', idempotencyKey: key });
      const b = await st.payments.createPaymentForOrder({ orderId: order.id, consumerId: 'c1', idempotencyKey: key });
      assert.strictEqual(a.id, b.id);
      assert.strictEqual(a.authority, b.authority);
    });
  });

  describe('Webhook replay - no double credit', function () {
    it('first webhook credits; replay does not double credit', async function () {
      const st = makeStack();
      const order = await st.orders.createDeliveryOrder({
        consumerId: 'c1',
        vendorProfileId: 'vp_seller',
        lines: [{ title: 'meal', unitPriceToman: 100000, quantity: 1 }],
      });
      const pay = await st.payments.createPaymentForOrder({
        orderId: order.id,
        consumerId: 'c1',
        idempotencyKey: 'k_' + order.id,
      });
      const first = await st.payments.simulateBankSuccess(pay.id);
      assert.strictEqual(first.status, 'PAID');
      assert.strictEqual(first.duplicate, false);
      assert.strictEqual(first.platformBalance, 10000);
      assert.strictEqual(first.vendorBalance, 90000);
      assert.strictEqual(first.credited, true);

      for (let i = 0; i < 3; i++) {
        const again = await st.payments.simulateBankSuccess(pay.id);
        assert.strictEqual(again.duplicate, true);
        assert.strictEqual(again.credited, false);
      }
      assert.strictEqual(st.wallet.getBalance('platform'), 10000);
      assert.strictEqual(st.wallet.getBalance('vp_seller'), 90000);
    });
    it('failed webhook does not credit', async function () {
      const st = makeStack();
      const order = await st.orders.createDeliveryOrder({
        consumerId: 'c3',
        vendorProfileId: 'vp3',
        lines: [{ title: 'x', unitPriceToman: 30000, quantity: 1 }],
      });
      const pay = await st.payments.createPaymentForOrder({ orderId: order.id, consumerId: 'c3' });
      st.payments.getGateway('mock').markFail(pay.authority);
      const r = await st.payments.processWebhook({
        paymentId: pay.id,
        authority: pay.authority,
        status: 'PAID',
        amount: pay.amountToman,
        rawPayload: { authority: pay.authority, status: 'PAID', amount: pay.amountToman },
      });
      assert.strictEqual(r.status, 'FAILED');
      assert.strictEqual(r.credited, false);
      assert.strictEqual(st.wallet.getBalance('vp3'), 0);
    });
  });

  describe('E2E order to payment to settlement to review', function () {
    it('appointment booking through bank payment to review rights', async function () {
      const st = makeStack();
      st.slots.setSchedule('vp_clinic', [
        { weekday: 4, startMinute: 540, endMinute: 720, slotMinutes: 30, breaks: [] },
      ]);
      const free = st.slots.ensureDaySlots('vp_clinic', '2026-09-24');
      assert.ok(free.length > 0);
      const order = await st.orders.createAppointmentOrder({
        consumerId: 'patient_1',
        vendorProfileId: 'vp_clinic',
        slotId: free[0].id,
        priceToman: 400000,
      });
      assert.strictEqual(order.status, 'SCHEDULED');
      const pay = await st.payments.createPaymentForOrder({
        orderId: order.id,
        consumerId: 'patient_1',
        idempotencyKey: 'e2e_' + order.id,
      });
      const webhook = await st.payments.simulateBankSuccess(pay.id);
      assert.strictEqual(webhook.status, 'PAID');
      assert.strictEqual(webhook.commissionToman, 40000);
      assert.strictEqual(webhook.vendorCredit, 360000);
      assert.strictEqual(st.wallet.getBalance('platform'), 40000);
      assert.strictEqual(st.wallet.getBalance('vp_clinic'), 360000);
      const settlements = st.wallet.listSettlements('vp_clinic');
      assert.strictEqual(settlements.length, 1);
      await st.orders.transition(order.id, 'IN_PROGRESS', { id: 'vp_clinic', role: 'VENDOR' });
      await st.orders.transition(order.id, 'COMPLETED', { id: 'vp_clinic', role: 'VENDOR' });
      assert.strictEqual(st.reviews.hasEngagement('vp_clinic', 'patient_1'), true);
      const review = await st.reviews.createReview({
        vendorProfileId: 'vp_clinic',
        consumerId: 'patient_1',
        rating: 5,
      });
      assert.strictEqual(review.rating, 5);
      assert.strictEqual(st.payments.getPayment(pay.id).status, 'PAID');
    });
    it('refund returns funds to consumer and marks REFUNDED', async function () {
      const st = makeStack();
      const order = await st.orders.createDeliveryOrder({
        consumerId: 'c_ref',
        vendorProfileId: 'vp_ref',
        lines: [{ title: 'item', unitPriceToman: 80000, quantity: 1 }],
      });
      const pay = await st.payments.createPaymentForOrder({ orderId: order.id, consumerId: 'c_ref' });
      await st.payments.simulateBankSuccess(pay.id);
      assert.strictEqual(st.wallet.getBalance('vp_ref'), 72000);
      const result = st.payments.refundPayment({ paymentId: pay.id, reason: 'late' });
      assert.strictEqual(result.payment.status, 'REFUNDED');
      assert.strictEqual(result.refund.applied, true);
      assert.strictEqual(st.wallet.getBalance('c_ref'), 80000);
      const again = st.payments.refundPayment({ paymentId: pay.id });
      assert.strictEqual(again.refund.applied, false);
    });
  });

  describe('Real-time notifications', function () {
    it('delivers websocket events to subscribed user only', function () {
      const n = new NotificationService();
      const received = [];
      const unsub = n.subscribe('user_1', function (m) { received.push(m); });
      n.notify({ userId: 'user_1', channel: 'websocket', topic: 'order.paid', payload: {} });
      n.notify({ userId: 'other', channel: 'websocket', topic: 'order.paid', payload: {} });
      assert.strictEqual(received.length, 1);
      unsub();
      n.notify({ userId: 'user_1', channel: 'websocket', topic: 'again', payload: {} });
      assert.strictEqual(received.length, 1);
    });
    it('payment webhook emits payment.paid and order.paid', async function () {
      const st = makeStack();
      const events = [];
      st.notifications.subscribe('c_evt', function (m) { events.push(m); });
      st.notifications.subscribe('vp_evt', function (m) { events.push(m); });
      const order = await st.orders.createDeliveryOrder({
        consumerId: 'c_evt',
        vendorProfileId: 'vp_evt',
        lines: [{ title: 'x', unitPriceToman: 10000, quantity: 1 }],
      });
      const pay = await st.payments.createPaymentForOrder({ orderId: order.id, consumerId: 'c_evt' });
      await st.payments.simulateBankSuccess(pay.id);
      const topics = events.map(function (e) { return e.topic; });
      assert.ok(topics.includes('payment.paid'));
      assert.ok(topics.includes('order.paid'));
    });
  });

  describe('Security hardening', function () {
    it('main.ts configures CSP, helmet, Idempotency-Key', function () {
      const src = fs.readFileSync(path.join(API_SRC, 'main.ts'), 'utf8');
      assert.ok(src.includes('helmet'));
      assert.ok(src.includes('frameAncestors'));
      assert.ok(src.includes("Idempotency-Key"));
    });
  });

  await run();
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});

