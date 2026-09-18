/**
 * Enterprise Phase 13 — loyalty/coupon/referral tests.
 */
const path = require('path');
const fs = require('fs');
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

  console.log('\nUnit — coupons');
  await it('flat + percent_capped math', () => {
    const flat = { code: 'F', type: 'flat', value: 50000, scope: 'global', maxRedemptions: 10, maxPerUser: 1, usedCount: 0, active: true };
    assert.strictEqual(s.couponDiscountToman(flat, 200000).discount, 50000);
    const pct = { ...flat, code: 'P', type: 'percent_capped', value: 20, capToman: 50000 };
    assert.strictEqual(s.couponDiscountToman(pct, 400000).discount, 50000);
    assert.strictEqual(s.couponDiscountToman(pct, 100000).discount, 20000);
  });

  await it('self-referral fraud blocked', () => {
    assert.ok(s.isSelfReferral({ inviterId: 'a', inviteeId: 'a' }));
    assert.ok(s.isSelfReferral({ inviterId: 'a', inviteeId: 'b', inviterPhoneHash: 'ph_1', inviteePhoneHash: 'ph_1' }));
    assert.ok(!s.isSelfReferral({ inviterId: 'a', inviteeId: 'b', inviterPhoneHash: 'ph_1', inviteePhoneHash: 'ph_2' }));
  });

  await it('loyalty 5+1 punch-card 50% off', () => {
    let card = { vendorProfileId: 'vp', consumerId: 'c', stamps: 0, threshold: 5, rewardPercent: 50 };
    for (let i = 0; i < 5; i++) card = s.bumpLoyaltyStamp(card);
    const prog = s.loyaltyProgress(card);
    assert.ok(prog.rewardReady);
    const applied = s.applyLoyaltyDiscount(card, 200000);
    assert.strictEqual(applied.discount, 100000);
    assert.strictEqual(applied.card.stamps, 0);
    assert.ok(applied.rewarded);
  });

  console.log('\nLive API Phase 13');
  try {
    const h = await req('GET', '/health');
    if (h.status !== 200) throw new Error('api down');

    let tok = null;
    await it('login', async () => {
      const r = await req('POST', '/auth/dev-login', { role: 'CONSUMER', id: 'user_a', phone: '09121112233' });
      tok = r.body.data.tokens.accessToken;
      assert.ok(tok);
    });

    await it('concurrent single-use coupon → one success + 409', async () => {
      // fresh single-use
      const res = await Promise.all([
        req('POST', '/coupons/redeem', { code: 'WELCOME50', subtotalToman: 200000, isFirstOrder: true, userId: 'race1' }, tok),
        req('POST', '/coupons/redeem', { code: 'WELCOME50', subtotalToman: 200000, isFirstOrder: true, userId: 'race1' }, tok),
        req('POST', '/coupons/redeem', { code: 'WELCOME50', subtotalToman: 200000, isFirstOrder: true, userId: 'race1' }, tok),
      ]);
      const ok = res.filter((r) => r.body.success);
      const fail = res.filter((r) => !r.body.success);
      assert.strictEqual(ok.length, 1, 'ok=' + ok.length);
      assert.ok(fail.every((r) => r.status === 409 || r.body.error?.code === 'USER_LIMIT' || r.body.error?.code === 'SOLD_OUT'));
    });

    await it('percent coupon validate', async () => {
      const r = await req('POST', '/coupons/validate', { code: 'PERCENT20', subtotalToman: 300000, userId: 'u9' }, tok);
      assert.ok(r.body.data.ok);
      assert.strictEqual(r.body.data.discount, 50000); // 20% cap 50k
    });

    await it('referral + self-referral blocked + reward on invitee order', async () => {
      const codeR = await req('POST', '/referrals/code', {}, tok);
      assert.ok(codeR.body.success);
      const code = codeR.body.data.code;
      const self = await req('POST', '/referrals/claim', { code, inviteeId: 'user_a', inviteePhone: '09121112233' }, tok);
      assert.strictEqual(self.body.error.code, 'SELF_REFERRAL');

      const other = await req('POST', '/auth/dev-login', { role: 'CONSUMER', id: 'user_b', phone: '09129998877' });
      const ot = other.body.data.tokens.accessToken;
      const claim = await req('POST', '/referrals/claim', { code, inviteePhone: '09129998877' }, ot);
      assert.ok(claim.body.success, JSON.stringify(claim.body));

      const done = await req('POST', '/referrals/complete-invitee-order', { inviteeId: 'user_b' });
      assert.ok(done.body.success);
      assert.strictEqual(done.body.data.creditedToman, 50000);
    });

    await it('loyalty stamps ×5 then 50% reward', async () => {
      const vp = 'vp_food_1';
      for (let i = 0; i < 5; i++) {
        await req('POST', `/loyalty/${vp}/stamp`, {}, tok);
      }
      const applied = await req('POST', `/loyalty/${vp}/apply`, { subtotalToman: 200000 }, tok);
      assert.ok(applied.body.success);
      assert.strictEqual(applied.body.data.discount, 100000);
      assert.strictEqual(applied.body.data.card.stamps, 0);
    });
  } catch (e) {
    console.log('  SKIP live: ' + e.message);
  }

  console.log('\n--------------------------------');
  console.log('ENT Phase13 passed=' + passed + ' failed=' + failed);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
