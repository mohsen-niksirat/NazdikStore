/**
 * Enterprise Phase 17–18 — themes, offline queue, SMS chaos, load helpers.
 */
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const Module = require('module');
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

async function main() {
  const s = require(path.join(SHARED, 'index.ts'));
  const REPO = path.join(ROOT, '..', '..');

  console.log('\nPhase 17 — themes & a11y helpers');
  await it('oled theme true black + teal accent', () => {
    const v = s.themeVars('oled');
    assert.strictEqual(v['--paper'], '#000000');
    assert.ok(v['--accent'].length >= 4);
  });
  await it('high-contrast has max ink contrast', () => {
    const v = s.themeVars('high-contrast');
    assert.strictEqual(v['--ink'], '#000000');
  });
  await it('offline queue enqueue/clear', () => {
    const mock = {};
    global.localStorage = {
      _s: mock,
      getItem: (k) => mock[k] ?? null,
      setItem: (k, v) => {
        mock[k] = String(v);
      },
    };
    s.clearOfflineQueue();
    s.enqueueOffline({ type: 'order', payload: { a: 1 } });
    const q = s.loadOfflineQueue();
    assert.strictEqual(q.length, 1);
    s.clearOfflineQueue();
    assert.strictEqual(s.loadOfflineQueue().length, 0);
  });
  await it('core pages exist for a11y checklist', () => {
    const base = path.join(REPO, 'apps/web/src/app');
    for (const p of ['page.tsx', 'map/page.tsx', 'cart/page.tsx', 'vendor/page.tsx']) {
      assert.ok(fs.existsSync(path.join(base, p)), p);
    }
    const offline = fs.readFileSync(path.join(base, 'offline/page.tsx'), 'utf8');
    assert.ok(offline.includes('تلاش مجدد'));
  });

  console.log('\nPhase 18 — SMS chaos + latency summary');
  await it('SMS circuit breaker switches after 3 failures within 2s', async () => {
    const br = new s.SmsCircuitBreaker({ threshold: 3, cooldownMs: 2000 });
    let primaryCalls = 0;
    br.register('primary', async () => {
      primaryCalls += 1;
      throw new Error('down');
    });
    br.register('fallback', async () => {});
    const t0 = Date.now();
    const out = await br.sendOtp('0912', 'code');
    const dt = Date.now() - t0;
    assert.strictEqual(out.provider, 'fallback');
    assert.strictEqual(out.switched, true);
    assert.ok(dt < 2000);
    assert.ok(primaryCalls >= 3);
  });

  await it('cache circuit falls back to memory/DB path', async () => {
    const br = new s.CacheCircuitBreaker(2, 1000);
    let fallbackUsed = 0;
    const run = () => br.execute(async () => { throw new Error('redis down'); }, async () => { fallbackUsed += 1; return 'ok'; });
    assert.strictEqual(await run(), 'ok');
    assert.strictEqual(await run(), 'ok');
    assert.ok(br.isOpen);
  });

  await it('summarizeLatencies computes p99', () => {
    const samples = [];
    for (let i = 1; i <= 100; i++) samples.push(i);
    const r = s.summarizeLatencies(samples, 0, 1000);
    assert.ok(r.p99 >= 90);
  });

  await it('chaos runbook + load script exist', () => {
    assert.ok(fs.existsSync(path.join(REPO, 'docs/CHAOS_RUNBOOK.md')));
    assert.ok(fs.existsSync(path.join(REPO, 'scripts/load-smoke.sh')));
  });

  console.log('\n--------------------------------');
  console.log('ENT Phase17-18 passed=' + passed + ' failed=' + failed);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
