/**
 * Phase 4 test runner â€” time-slots (concurrency), cart/delivery, RFQ, state machine.
 */
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
    if (fs.existsSync(candidate) || fs.existsSync(`${candidate}.js`)) {
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
let currentSuite = null;
const suites = [];
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
    console.log(`\n${suite.name}`);
    for (const test of suite.tests) {
      try {
        await test.fn();
        results.passed++;
        console.log(`  âœ“ ${test.name}`);
      } catch (err) {
        results.failed++;
        results.errors.push({ suite: suite.name, test: test.name, err });
        console.log(`  âœ— ${test.name}`);
        console.log(`    ${err?.message || err}`);
      }
    }
  }
  console.log('\nâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€');
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);
  if (results.errors.length) {
    for (const e of results.errors) {
      console.log(`- [${e.suite}] ${e.test}`);
      console.log(e.err?.stack || e.err);
    }
    process.exit(1);
  }
  process.exit(0);
}

async function main() {
  const state = require(path.join(API_SRC, 'orders/order-state.ts'));
  const { TimeSlotService, expandDaySlots } = require(path.join(API_SRC, 'orders/time-slot.service.ts'));
  const { OrdersService } = require(path.join(API_SRC, 'orders/orders.service.ts'));
  const { RfqService } = require(path.join(API_SRC, 'orders/rfq.service.ts'));
  const { ReviewsService } = require(path.join(API_SRC, 'reviews/reviews.service.ts'));
  const { MapService } = require(path.join(API_SRC, 'map/map.service.ts'));

  const prismaStub = {
    $executeRaw: async () => 1,
    vendorProfile: { findUnique: async () => null },
    completedEngagement: { findFirst: async () => null },
  };

  function makeStack() {
    const reviews = new ReviewsService(prismaStub);
    const slots = new TimeSlotService(prismaStub);
    const map = new MapService(prismaStub);
    const orders = new OrdersService(prismaStub, slots, reviews);
    const rfq = new RfqService(prismaStub, map, orders);
    reviews.clearMemory();
    slots.clearMemory();
    orders.clearMemory();
    rfq.clearMemory();
    return { reviews, slots, orders, rfq, map };
  }

  // â”€â”€ State machine â”€â”€
  describe('Order state machine (Phase 4 criterion)', () => {
    it('allows happy-path delivery lifecycle', () => {
      assert.ok(state.canTransition('PENDING_ACCEPTANCE', 'PREPARING'));
      assert.ok(state.canTransition('PREPARING', 'IN_PROGRESS'));
      assert.ok(state.canTransition('IN_PROGRESS', 'COMPLETED'));
    });

    it('allows appointment SCHEDULED â†’ IN_PROGRESS â†’ COMPLETED', () => {
      assert.ok(state.canTransition('SCHEDULED', 'IN_PROGRESS'));
      assert.ok(state.canTransition('IN_PROGRESS', 'COMPLETED'));
    });

    it('forbids CANCELLED â†’ COMPLETED (explicit brief requirement)', () => {
      assert.strictEqual(state.canTransition('CANCELLED', 'COMPLETED'), false);
      assert.throws(() => state.assertTransition('CANCELLED', 'COMPLETED'));
    });

    it('forbids COMPLETED â†’ anything', () => {
      for (const to of state.ORDER_STATUSES) {
        if (to === 'COMPLETED') continue;
        assert.strictEqual(state.canTransition('COMPLETED', to), false);
      }
    });

    it('forbids skipping PENDING_ACCEPTANCE â†’ COMPLETED', () => {
      assert.strictEqual(state.canTransition('PENDING_ACCEPTANCE', 'COMPLETED'), false);
    });

    it('forbids PREPARING â†’ COMPLETED without IN_PROGRESS', () => {
      assert.strictEqual(state.canTransition('PREPARING', 'COMPLETED'), false);
    });

    it('DISPUTED can resolve to COMPLETED or CANCELLED only', () => {
      assert.ok(state.canTransition('DISPUTED', 'COMPLETED'));
      assert.ok(state.canTransition('DISPUTED', 'CANCELLED'));
      assert.strictEqual(state.canTransition('DISPUTED', 'IN_PROGRESS'), false);
      assert.strictEqual(state.canTransition('DISPUTED', 'PREPARING'), false);
    });

    it('service rejects invalid transition with code INVALID_TRANSITION', async () => {
      const { orders } = makeStack();
      const o = await orders.createDeliveryOrder({
        consumerId: 'c1',
        vendorProfileId: 'vp_food_1',
        lines: [{ title: 'x', unitPriceToman: 1000, quantity: 1 }],
      });
      await orders.transition(o.id, 'CANCELLED', { id: 'c1', role: 'CONSUMER' });
      await assert.rejects(
        () => orders.transition(o.id, 'COMPLETED', { id: 'vp_food_1', role: 'VENDOR' }),
        (err) => {
          const body = err.getResponse?.() ?? err;
          assert.ok(JSON.stringify(body).includes('INVALID_TRANSITION'), JSON.stringify(body));
          return true;
        },
      );
    });

    it('COMPLETED grants Phase 3 review engagement', async () => {
      const { orders, reviews } = makeStack();
      const o = await orders.createDeliveryOrder({
        consumerId: 'c_rev',
        vendorProfileId: 'vp_rev',
        lines: [{ title: 'meal', unitPriceToman: 50000, quantity: 1 }],
      });
      assert.strictEqual(reviews.hasEngagement('vp_rev', 'c_rev'), false);
      await orders.transition(o.id, 'PREPARING', { id: 'vp_rev', role: 'VENDOR' });
      await orders.transition(o.id, 'IN_PROGRESS', { id: 'vp_rev', role: 'VENDOR' });
      await orders.transition(o.id, 'COMPLETED', { id: 'vp_rev', role: 'VENDOR' });
      assert.strictEqual(reviews.hasEngagement('vp_rev', 'c_rev'), true);
      const review = await reviews.createReview({
        vendorProfileId: 'vp_rev',
        consumerId: 'c_rev',
        rating: 5,
      });
      assert.strictEqual(review.rating, 5);
    });
  });

  // â”€â”€ Time slots â”€â”€
  describe('Time-slot engine & atomic booking (Phase 4 criterion)', () => {
    it('expands schedule into slots excluding breaks', () => {
      const rules = [
        {
          weekday: 1, // Monday â€” 2026-09-21 is a Monday
          startMinute: 9 * 60,
          endMinute: 12 * 60,
          slotMinutes: 30,
          breaks: [{ start: 10 * 60, end: 10 * 60 + 30 }],
        },
      ];
      // 2026-09-21 is Monday
      const day = '2026-09-21';
      const slots = expandDaySlots(rules, day);
      // 9:00, 9:30, [10:00 break skip], 10:30, 11:00, 11:30 â†’ 5 slots
      assert.strictEqual(slots.length, 5, JSON.stringify(slots));
      assert.ok(!slots.some((s) => s.startMinute === 10 * 60));
    });

    it('two simultaneous bookings â†’ exactly one success and one 409 (Phase 4 criterion)', async () => {
      const { slots, orders } = makeStack();
      slots.setSchedule('vp_doc', [
        {
          weekday: 3,
          startMinute: 9 * 60,
          endMinute: 11 * 60,
          slotMinutes: 30,
          breaks: [],
        },
      ]);
      // 2026-09-23 is Wednesday
      const day = '2026-09-23';
      const list = slots.ensureDaySlots('vp_doc', day);
      assert.ok(list.length >= 2);
      const target = list[0];

      const results = await Promise.allSettled([
        orders.createAppointmentOrder({
          consumerId: 'user_a',
          vendorProfileId: 'vp_doc',
          slotId: target.id,
        }),
        orders.createAppointmentOrder({
          consumerId: 'user_b',
          vendorProfileId: 'vp_doc',
          slotId: target.id,
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      assert.strictEqual(fulfilled.length, 1, `expected 1 success, got ${fulfilled.length}`);
      assert.strictEqual(rejected.length, 1, `expected 1 conflict, got ${rejected.length}`);

      const rej = rejected[0].reason;
      const payload = JSON.stringify(rej?.getResponse?.() ?? rej);
      assert.ok(
        payload.includes('CONFLICT') || payload.includes('already booked') || payload.includes('SLOT'),
        payload,
      );

      // Slot remains booked exactly once
      const slotNow = slots.getSlot(target.id);
      assert.ok(slotNow?.isBooked);
      assert.ok(slotNow?.orderId);
    });

    it('cancelled appointment releases the slot for rebooking', async () => {
      const { slots, orders } = makeStack();
      slots.setSchedule('vp_doc2', [
        { weekday: 3, startMinute: 14 * 60, endMinute: 16 * 60, slotMinutes: 30, breaks: [] },
      ]);
      const list = slots.ensureDaySlots('vp_doc2', '2026-09-23');
      const slot = list[0];
      const order = await orders.createAppointmentOrder({
        consumerId: 'c1',
        vendorProfileId: 'vp_doc2',
        slotId: slot.id,
      });
      assert.strictEqual(order.status, 'SCHEDULED');
      assert.ok(slots.getSlot(slot.id)?.isBooked);

      await orders.transition(order.id, 'CANCELLED', { id: 'c1', role: 'CONSUMER' });
      assert.strictEqual(slots.getSlot(slot.id)?.isBooked, false);

      const order2 = await orders.createAppointmentOrder({
        consumerId: 'c2',
        vendorProfileId: 'vp_doc2',
        slotId: slot.id,
      });
      assert.ok(order2.id);
      assert.strictEqual(order2.status, 'SCHEDULED');
    });
  });

  // â”€â”€ Cart & delivery â”€â”€
  describe('Cart & delivery engine', () => {
    it('creates order with total and lines', async () => {
      const { orders } = makeStack();
      orders.seedInventory({
        productId: 'prod_ghorme',
        vendorProfileId: 'vp_food_1',
        title: 'Ù‚ÙˆØ±Ù…Ù‡',
        priceToman: 185000,
        stock: 10,
        leadTimeMinutes: 60,
      });
      const o = await orders.createDeliveryOrder({
        consumerId: 'c1',
        vendorProfileId: 'vp_food_1',
        lines: [
          { productId: 'prod_ghorme', title: 'Ù‚ÙˆØ±Ù…Ù‡', unitPriceToman: 185000, quantity: 2 },
        ],
        deliveryAddress: 'ØªÙ‡Ø±Ø§Ù†',
      });
      assert.strictEqual(o.kind, 'DELIVERY');
      assert.strictEqual(o.status, 'PENDING_ACCEPTANCE');
      assert.strictEqual(o.totalToman, 370000);
      assert.strictEqual(o.lines.length, 1);
      assert.strictEqual(o.lines[0].quantity, 2);
    });

    it('rejects order when stock insufficient', async () => {
      const { orders } = makeStack();
      orders.seedInventory({
        productId: 'p1',
        vendorProfileId: 'vp_f',
        title: 'cake',
        priceToman: 10000,
        stock: 1,
      });
      await assert.rejects(() =>
        orders.createDeliveryOrder({
          consumerId: 'c',
          vendorProfileId: 'vp_f',
          lines: [{ productId: 'p1', title: 'cake', unitPriceToman: 10000, quantity: 5 }],
        }),
      );
    });

    it('decrements stock after successful order', async () => {
      const { orders } = makeStack();
      orders.seedInventory({
        productId: 'p2',
        vendorProfileId: 'vp_f',
        title: 'bread',
        priceToman: 25000,
        stock: 5,
      });
      await orders.createDeliveryOrder({
        consumerId: 'c',
        vendorProfileId: 'vp_f',
        lines: [{ productId: 'p2', title: 'bread', unitPriceToman: 25000, quantity: 2 }],
      });
      // access private inventory via seed behavior â€” create another order
      await orders.createDeliveryOrder({
        consumerId: 'c',
        vendorProfileId: 'vp_f',
        lines: [{ productId: 'p2', title: 'bread', unitPriceToman: 25000, quantity: 3 }],
      });
      await assert.rejects(() =>
        orders.createDeliveryOrder({
          consumerId: 'c',
          vendorProfileId: 'vp_f',
          lines: [{ productId: 'p2', title: 'bread', unitPriceToman: 25000, quantity: 1 }],
        }),
      );
    });

    it('rejects delivery outside vendor zone', async () => {
      const { orders } = makeStack();
      orders.setDeliveryZone('vp_zone', { maxRadiusKm: 3, lat: 35.69, lng: 51.39 });
      await assert.rejects(() =>
        orders.createDeliveryOrder({
          consumerId: 'c',
          vendorProfileId: 'vp_zone',
          lines: [{ title: 'x', unitPriceToman: 1000, quantity: 1 }],
          deliveryLat: 35.9,
          deliveryLng: 51.39,
        }),
      );
    });

    it('accepts variations with adjusted understanding (variation label stored)', async () => {
      const { orders } = makeStack();
      orders.seedInventory({
        productId: 'p_var',
        vendorProfileId: 'vp_f',
        title: 'kebab',
        priceToman: 200000,
        stock: 10,
        variations: [
          { id: 'small', label: 'Ú©ÙˆÚ†Ú©', priceToman: 150000 },
          { id: 'large', label: 'Ø¨Ø²Ø±Ú¯', priceToman: 250000 },
        ],
      });
      const o = await orders.createDeliveryOrder({
        consumerId: 'c',
        vendorProfileId: 'vp_f',
        lines: [
          {
            productId: 'p_var',
            title: 'kebab',
            unitPriceToman: 250000,
            quantity: 1,
            variation: 'large',
          },
        ],
      });
      assert.strictEqual(o.lines[0].variation, 'large');
      assert.strictEqual(o.totalToman, 250000);
    });
  });

  // â”€â”€ RFQ â”€â”€
  describe('RFQ / reverse bidding engine', () => {
    it('broadcasts job to nearby field-service vendors', () => {
      const { rfq, map } = makeStack();
      map.seedMemory([
        {
          id: 'loc1',
          vendorProfileId: 'vp_field_1',
          businessName: 'Repair',
          vendorType: 'FIELD_SERVICE',
          categoryTags: [],
          description: null,
          verificationStatus: 'VERIFIED',
          isHomeBased: false,
          lat: 35.69,
          lng: 51.39,
          address: null,
          serviceRadiusKm: 8,
        },
        {
          id: 'loc2',
          vendorProfileId: 'vp_far',
          businessName: 'Far',
          vendorType: 'FIELD_SERVICE',
          categoryTags: [],
          description: null,
          verificationStatus: 'VERIFIED',
          isHomeBased: false,
          lat: 36.5,
          lng: 52.5,
          address: null,
          serviceRadiusKm: 5,
        },
      ]);
      const { job, broadcastVendorIds } = rfq.createJobRequest({
        consumerId: 'c1',
        title: 'ØªØ¹Ù…ÛŒØ± Ù¾Ú©ÛŒØ¬',
        description: 'Ù¾Ú©ÛŒØ¬ Ø±ÙˆØ´Ù† Ù†Ù…ÛŒâ€ŒØ´ÙˆØ¯',
        lat: 35.69,
        lng: 51.39,
        radiusKm: 5,
      });
      assert.strictEqual(job.status, 'OPEN');
      assert.ok(broadcastVendorIds.includes('vp_field_1'));
      assert.ok(!broadcastVendorIds.includes('vp_far'));
    });

    it('vendor quotes, consumer locks one bid, others rejected, RFQ order created', async () => {
      const { rfq, orders } = makeStack();
      const { job } = rfq.createJobRequest({
        consumerId: 'c1',
        title: 'Ù„ÙˆÙ„Ù‡â€ŒÚ©Ø´ÛŒ',
        description: 'Ù†Ø´ØªÛŒ Ø²ÛŒØ± Ø³ÛŒÙ†Ú©',
        lat: 35.6892,
        lng: 51.389,
        radiusKm: 10,
      });
      const q1 = rfq.submitQuote({
        jobRequestId: job.id,
        vendorProfileId: 'vp_a',
        priceToman: 800000,
        etaHours: 3,
      });
      const q2 = rfq.submitQuote({
        jobRequestId: job.id,
        vendorProfileId: 'vp_b',
        priceToman: 650000,
        etaHours: 5,
      });

      const { job: locked, orderId } = rfq.acceptQuote({
        jobRequestId: job.id,
        quoteId: q2.id,
        consumerId: 'c1',
      });
      assert.strictEqual(locked.status, 'LOCKED');
      assert.strictEqual(locked.lockedQuoteId, q2.id);
      assert.strictEqual(locked.vendorProfileId, 'vp_b');

      const quotes = rfq.listQuotes(job.id, { id: 'c1', role: 'CONSUMER' });
      const accepted = quotes.find((q) => q.id === q2.id);
      const rejected = quotes.find((q) => q.id === q1.id);
      assert.strictEqual(accepted.status, 'ACCEPTED');
      assert.strictEqual(rejected.status, 'REJECTED');

      const order = orders.get(orderId);
      assert.strictEqual(order.kind, 'RFQ');
      assert.strictEqual(order.status, 'PREPARING');
      assert.strictEqual(order.totalToman, 650000);
      assert.strictEqual(order.vendorProfileId, 'vp_b');
    });

    it('second accept on same job â†’ 409 CONFLICT', () => {
      const { rfq } = makeStack();
      const { job } = rfq.createJobRequest({
        consumerId: 'c1',
        title: 'job',
        description: 'desc',
      });
      const q1 = rfq.submitQuote({
        jobRequestId: job.id,
        vendorProfileId: 'v1',
        priceToman: 1000,
        etaHours: 1,
      });
      const q2 = rfq.submitQuote({
        jobRequestId: job.id,
        vendorProfileId: 'v2',
        priceToman: 2000,
        etaHours: 2,
      });
      rfq.acceptQuote({ jobRequestId: job.id, quoteId: q1.id, consumerId: 'c1' });
      assert.throws(
        () => rfq.acceptQuote({ jobRequestId: job.id, quoteId: q2.id, consumerId: 'c1' }),
        (err) => {
          const body = JSON.stringify(err.getResponse?.() ?? err);
          return body.includes('LOCKED') || body.includes('CONFLICT') || body.includes('locked');
        },
      );
    });

    it('only job owner can accept quote', () => {
      const { rfq } = makeStack();
      const { job } = rfq.createJobRequest({
        consumerId: 'owner',
        title: 't',
        description: 'd',
      });
      const q = rfq.submitQuote({
        jobRequestId: job.id,
        vendorProfileId: 'v',
        priceToman: 1,
        etaHours: 1,
      });
      assert.throws(() =>
        rfq.acceptQuote({ jobRequestId: job.id, quoteId: q.id, consumerId: 'not_owner' }),
      );
    });
  });

  await run();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

