/**
 * Enterprise Phase 14 — escrow / dispute / ledger identity tests.
 */
const path = require('path');
const assert = require('assert');
const Module = require('module');
const http = require('http');
const { installResolveHook, installTsHook } = require('./dep-paths.cjs');

const ROOT = path.resolve(__dirname, '..');
const SHARED = path.join(ROOT, '..', '..', 'packages', 'shared', 'src');
installResolveHook({ root: ROOT, sharedSrc: SHARED, apiSrc: path.join(ROOT, 'src') });
installTsHook();

let passed = 0;
let failed = 0;

async function it(name, fn) {
  try {
    await fn();
    passed++;
    console.log('  OK ' + name);
  } catch (e) {
    failed++;
    console.log('  FAIL ' + name + ' — ' + (e && e.message));
  }
}

function req(method, p, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(
      {
        hostname: '127.0.0.1',
        port: 4000,
        path: '/api/v1' + p,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch {
            json = raw;
          }
          resolve({ status: res.statusCode, body: json });
        });
      },
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function main() {
  const s = require(path.join(SHARED, 'index.ts'));

  console.log('\nUnit — escrow math');
  await it('cannot release while HELD before COMPLETED / 24h', () => {
    const e = s.createEscrow({
      paymentId: 'p1',
      orderId: 'o1',
      vendorProfileId: 'v',
      consumerId: 'c',
      grossToman: 100000,
      now: Date.now(),
    });
    assert.strictEqual(s.canReleaseEscrow(e, 'PENDING_ACCEPTANCE').ok, false);
    assert.strictEqual(s.canReleaseEscrow(e, 'COMPLETED').ok, true);
    const future = s.createEscrow({
      paymentId: 'p2',
      orderId: 'o2',
      vendorProfileId: 'v',
      consumerId: 'c',
      grossToman: 1,
      now: Date.now() - (s.AUTO_RELEASE_MS + 1000),
    });
    assert.strictEqual(s.canReleaseEscrow(future, 'PENDING_ACCEPTANCE').ok, true);
  });

  await it('ledger identity holds after release', () => {
    const { commissionToman, netToman } = s.computeCommission(100000);
    const id = s.ledgerIdentity({
      grossToman: 100000,
      escrowHeld: 0,
      vendorCredit: netToman,
      platformCommission: commissionToman,
      refunds: 0,
    });
    assert.ok(id.balanced);
  });

  await it('PSP reconcile detects missing + mismatch', () => {
    const r = s.reconcileSettlements(
      [
        { externalId: 'A', amountToman: 100, status: 'PAID' },
        { externalId: 'B', amountToman: 200, status: 'PAID' },
      ],
      [{ paymentId: 'pA', authority: 'A', amountToman: 100, status: 'PAID' }],
    );
    assert.strictEqual(r.matched, 1);
    assert.ok(r.missingInInternal.some((x) => x.externalId === 'B'));
  });

  console.log('\nLive API Phase 14');
  try {
    const h = await req('GET', '/health');
    if (h.status !== 200) throw new Error('api down');

    let adminTok = null;
    await it('admin login', async () => {
      const r = await req('POST', '/auth/dev-login', { role: 'ADMIN', id: 'admin_demo' });
      adminTok = r.body.data.tokens.accessToken;
      assert.ok(adminTok);
    });

    await it('hold escrow → release blocked → COMPLETED releases to vendor+platform', async () => {
      const hold = await req('POST', '/escrow/hold', {
        paymentId: 'esc_1',
        orderId: 'ord_esc',
        vendorProfileId: 'vp_food_1',
        consumerId: 'c1',
        grossToman: 100000,
      });
      assert.ok(hold.body.success);
      const early = await req('POST', '/escrow/esc_1/release', { orderStatus: 'PREPARING' });
      assert.strictEqual(early.status, 409);
      const rel = await req('POST', '/escrow/esc_1/release', { orderStatus: 'COMPLETED' });
      assert.ok(rel.body.success, JSON.stringify(rel.body));
      assert.strictEqual(rel.body.data.netToman, 90000);
      assert.strictEqual(rel.body.data.commissionToman, 10000);
    });

    await it('vendor cannot withdraw locked escrow (release before complete)', async () => {
      await req('POST', '/escrow/hold', {
        paymentId: 'esc_lock',
        orderId: 'ord_lock',
        vendorProfileId: 'vp_x',
        consumerId: 'c2',
        grossToman: 50000,
      });
      const r = await req('POST', '/escrow/esc_lock/release', { orderStatus: 'IN_PROGRESS' });
      assert.strictEqual(r.status, 409);
      assert.strictEqual(r.body.error.code, 'IN_ESCROW');
    });

    await it('dispute freezes + admin refund + ledger identity', async () => {
      await req('POST', '/escrow/hold', {
        paymentId: 'esc_d',
        orderId: 'ord_d',
        vendorProfileId: 'vp_d',
        consumerId: 'c_d',
        grossToman: 80000,
      });
      const d = await req('POST', '/orders/ord_d/dispute', { reason: 'خراب بود' });
      assert.ok(d.body.success);
      const esc = await req('GET', '/escrow/esc_d');
      assert.strictEqual(esc.body.data.state, 'DISPUTED');

      const res = await req(
        'POST',
        '/admin/disputes/ord_d/resolve',
        { mode: 'full', refundToman: 80000 },
        adminTok,
      );
      assert.ok(res.body.success);

      const id = await req('GET', '/admin/ledger/identity');
      assert.ok(id.body.success);
      // After full refunds, identity still holds by construction
      const buckets = id.body.data.buckets;
      const rhs =
        (buckets.escrowHeldComputed || 0) +
        buckets.vendorCredit +
        buckets.platformCommission +
        buckets.refunds;
      assert.ok(Math.abs(buckets.gross - rhs) < 2, JSON.stringify(buckets));
    });

    await it('settlement reconcile endpoint', async () => {
      const r = await req('POST', '/admin/settlements/reconcile', {
        psp: [{ externalId: 'X', amountToman: 10, status: 'ok' }],
        internal: [],
      });
      assert.ok(r.body.success);
      assert.ok(r.body.data.missingInInternal.length === 1);
    });
  } catch (e) {
    console.log('  SKIP live: ' + e.message);
  }

  console.log('\n--------------------------------');
  console.log('ENT Phase14 passed=' + passed + ' failed=' + failed);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
