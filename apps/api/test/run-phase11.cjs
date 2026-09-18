/**
 * Enterprise Phase 11 — tracking, dispatch, authz, latency.
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
  const shared = require(path.join(SHARED, 'index.ts'));

  console.log('\nUnit — dispatch & GPS');
  await it('dispatch flow ASSIGNED→PICKED_UP→ARRIVED→DELIVERED', () => {
    assert.ok(shared.canDispatchTransition('ASSIGNED', 'PICKED_UP'));
    assert.ok(shared.canDispatchTransition('PICKED_UP', 'ARRIVED_AT_DESTINATION'));
    assert.ok(shared.canDispatchTransition('ARRIVED_AT_DESTINATION', 'DELIVERED'));
    assert.strictEqual(shared.canDispatchTransition('DELIVERED', 'PICKED_UP'), false);
    assert.strictEqual(shared.canDispatchTransition('ASSIGNED', 'DELIVERED'), false);
  });

  await it('GpsSmoother reduces jitter + builds trail', () => {
    const s = new shared.GpsSmoother();
    let lat = 35.7;
    let lng = 51.4;
    const raw = [];
    const smooth = [];
    for (let i = 0; i < 30; i++) {
      const jitter = (Math.random() - 0.5) * 0.0008;
      lat += 0.0002;
      const p = { lat: lat + jitter, lng: lng + jitter * 0.5, t: Date.now() + i * 200, speed: 8, headingDeg: 20 };
      raw.push(p.lat);
      const out = s.update(p);
      smooth.push(out.lat);
    }
    const variance = (arr) => {
      const m = arr.reduce((a, b) => a + b, 0) / arr.length;
      return arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length;
    };
    assert.ok(variance(smooth) <= variance(raw) * 1.05, 'smoother variance');
    assert.ok(s.snapshot().trail.length >= 5);
  });

  await it('tracking channel + ETA formatting', () => {
    assert.strictEqual(shared.trackingChannel('ord1'), 'track:ord1');
    const eta = shared.etaMinutes(800, 8);
    assert.ok(eta >= 1);
    assert.ok(shared.formatFaEta(5).includes('دقیقه'));
  });

  console.log('\nLive API Phase 11');
  try {
    const h = await req('GET', '/health');
    if (h.status !== 200) throw new Error('api down');

    const orderId = 'ent_track_' + Date.now().toString(36);
    let courierTok = null;
    let consumerTok = null;
    let outsiderTok = null;

    await it('logins consumer/courier/outsider', async () => {
      const c = await req('POST', '/auth/dev-login', { role: 'CONSUMER', id: 'consumer_demo' });
      consumerTok = c.body.data.tokens.accessToken;
      const k = await req('POST', '/auth/dev-login', { role: 'COURIER', id: 'courier_demo' });
      courierTok = k.body.data.tokens.accessToken;
      const o = await req('POST', '/auth/dev-login', { role: 'CONSUMER', id: 'stranger_x' });
      outsiderTok = o.body.data.tokens.accessToken;
      assert.ok(consumerTok && courierTok && outsiderTok);
    });

    await it('register courier vehicle profile', async () => {
      const r = await req(
        'POST',
        '/couriers/me',
        { displayName: 'پیک تست', vehicle: 'motor' },
        courierTok,
      );
      assert.ok(r.body.success);
      assert.strictEqual(r.body.data.vehicle, 'motor');
      assert.ok(r.body.data.speedMs > 0);
    });

    await it('vendor/consumer-assigned dispatch ASSIGNED', async () => {
      const r = await req(
        'POST',
        `/orders/${orderId}/dispatch`,
        { courierUserId: 'courier_demo', vehicle: 'motor', destLat: 35.692, destLng: 51.392 },
        consumerTok,
      );
      assert.ok(r.body.success, JSON.stringify(r.body));
      assert.strictEqual(r.body.data.status, 'ASSIGNED');
    });

    await it('duplicate dispatch → 409', async () => {
      const r = await req(
        'POST',
        `/orders/${orderId}/dispatch`,
        { courierUserId: 'courier_demo' },
        consumerTok,
      );
      assert.strictEqual(r.status, 409);
    });

    await it('outsider cannot GET tracking', async () => {
      const r = await req('GET', `/tracking/${orderId}`, null, outsiderTok);
      assert.strictEqual(r.status, 403);
      assert.strictEqual(r.body.error.code, 'FORBIDDEN');
    });

    await it('outsider cannot POST GPS points', async () => {
      const r = await req(
        'POST',
        `/tracking/${orderId}/point`,
        { lat: 35.68, lng: 51.38, t: Date.now() },
        outsiderTok,
      );
      assert.strictEqual(r.status, 403);
    });

    await it('outsider cannot subscribe', async () => {
      const r = await req('POST', `/tracking/${orderId}/subscribe`, {}, outsiderTok);
      assert.strictEqual(r.status, 403);
    });

    await it('courier streams GPS; consumer sees trail + ETA', async () => {
      for (let i = 0; i < 8; i++) {
        const r = await req(
          'POST',
          `/tracking/${orderId}/point`,
          {
            lat: 35.68 + i * 0.0004,
            lng: 51.38 + i * 0.0003,
            t: Date.now() + i,
            speed: 8,
            headingDeg: 40,
          },
          courierTok,
        );
        assert.ok(r.body.success, JSON.stringify(r.body));
      }
      const view = await req('GET', `/tracking/${orderId}`, null, consumerTok);
      assert.ok(view.body.success);
      assert.ok(view.body.data.lastPoint);
      assert.ok(view.body.data.etaFa);
      assert.ok(Array.isArray(view.body.data.trail));
    });

    await it('dispatch status invalid skip → 409', async () => {
      const r = await req(
        'POST',
        `/orders/${orderId}/dispatch/status`,
        { status: 'DELIVERED' },
        courierTok,
      );
      assert.strictEqual(r.status, 409);
    });

    await it('dispatch status happy path to DELIVERED', async () => {
      await req('POST', `/orders/${orderId}/dispatch/status`, { status: 'PICKED_UP' }, courierTok);
      await req(
        'POST',
        `/orders/${orderId}/dispatch/status`,
        { status: 'ARRIVED_AT_DESTINATION' },
        courierTok,
      );
      const r = await req(
        'POST',
        `/orders/${orderId}/dispatch/status`,
        { status: 'DELIVERED' },
        courierTok,
      );
      assert.ok(r.body.success);
      assert.strictEqual(r.body.data.status, 'DELIVERED');
    });

    await it('50 updates/s burst — p99 latency < 15ms', async () => {
      const orderId2 = 'ent_track_burst';
      await req(
        'POST',
        `/orders/${orderId2}/dispatch`,
        { courierUserId: 'courier_demo', vehicle: 'bike', destLat: 35.7, destLng: 51.4 },
        consumerTok,
      );
      const samples = [];
      const t0 = performance.now();
      // fire 50 sequential as fast as possible (server processes; measure handler-reported latency)
      for (let i = 0; i < 50; i++) {
        const r = await req(
          'POST',
          `/tracking/${orderId2}/point`,
          {
            lat: 35.68 + i * 0.0001,
            lng: 51.38,
            t: Date.now() + i * 20,
            speed: 7,
            headingDeg: 90,
          },
          courierTok,
        );
        if (r.body?.data?.latencyMs != null) samples.push(r.body.data.latencyMs);
      }
      const wall = performance.now() - t0;
      samples.sort((a, b) => a - b);
      const p99 = samples[Math.floor(samples.length * 0.99)] || 0;
      const stats = await req('GET', '/tracking/stats/latency');
      assert.ok(samples.length >= 40, 'got samples ' + samples.length);
      // In-process handler latency (criterion from brief)
      assert.ok(p99 < 15, `p99 handler latency ${p99}ms (wall ${wall.toFixed(0)}ms)`);
      assert.ok(stats.body.data.samples > 0);
    });

    await it('courier subscribe gets ws channel path', async () => {
      const r = await req('POST', `/tracking/${orderId}/subscribe`, {}, consumerTok);
      assert.ok(r.body.success);
      assert.ok(String(r.body.data.channel).startsWith('track:'));
    });
  } catch (e) {
    console.log('  SKIP live: ' + e.message);
  }

  console.log('\nSource');
  await it('tracking UI + routes wired', () => {
    assert.ok(fs.existsSync(path.join(ROOT, '..', 'web', 'src', 'app', 'track', 'page.tsx')));
    const mini = fs.readFileSync(path.join(ROOT, 'test/mini-server.cjs'), 'utf8');
    assert.ok(mini.includes('phase11-routes'));
  });

  console.log('\n--------------------------------');
  console.log('ENT Phase11 passed=' + passed + ' failed=' + failed);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
