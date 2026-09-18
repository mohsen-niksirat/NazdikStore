/**
 * Production Brief — Phase 6 verification (GIS, ETA, alert perimeters).
 * Offline unit + live API smoke when :4000 is up.
 */
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const Module = require('module');
const http = require('http');
const { installResolveHook, installTsHook } = require('./dep-paths.cjs');

const ROOT = path.resolve(__dirname, '..');
const SHARED_SRC = path.join(ROOT, '..', '..', 'packages', 'shared', 'src');
const API_SRC = path.join(ROOT, 'src');
installResolveHook({ root: ROOT, sharedSrc: SHARED_SRC, apiSrc: API_SRC });
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
  const gis = require(path.join(SHARED_SRC, 'index.ts'));

  console.log('\nPhase 6 GIS — offline unit');
  await it('isInIran accepts Tehran, rejects Paris', () => {
    assert.strictEqual(gis.isInIran(35.6892, 51.389), true);
    assert.strictEqual(gis.isInIran(48.85, 2.35), false);
    assert.strictEqual(gis.isInIran(10, 50), false);
  });

  await it('estimateProximity Persian labels + walk/car minutes', () => {
    const from = { lat: 35.6892, lng: 51.389 };
    const to = { lat: 35.6892, lng: 51.392 };
    const p = gis.estimateProximity(from, to);
    assert.ok(p.distanceMeters > 100 && p.distanceMeters < 500, String(p.distanceMeters));
    assert.ok(p.faDistance.includes('متر') || p.faDistance.includes('کیلومتر'));
    assert.ok(p.faWalk.includes('پیاده'));
    assert.ok(p.faCar.includes('خودرو'));
  });

  await it('toFaDigits converts Latin digits', () => {
    assert.strictEqual(gis.toFaDigits(350), '۳۵۰');
  });

  await it('vendorsInPerimeter filters by 1500m and types', () => {
    const zone = { lat: 35.69, lng: 51.39, radiusM: 1500, vendorTypes: ['FOOD'] };
    const vendors = [
      { vendorProfileId: 'a', businessName: 'near food', vendorType: 'FOOD', lat: 35.692, lng: 51.392 },
      { vendorProfileId: 'b', businessName: 'near med', vendorType: 'MEDICAL', lat: 35.692, lng: 51.392 },
      { vendorProfileId: 'c', businessName: 'far food', vendorType: 'FOOD', lat: 36.0, lng: 52.0 },
    ];
    const hits = gis.vendorsInPerimeter(zone, vendors);
    assert.ok(hits.length === 1);
    assert.strictEqual(hits[0].vendorProfileId, 'a');
    assert.ok(hits[0].pin && hits[0].proximity.faDistance);
  });

  await it('pinMetaFor category icons', () => {
    assert.strictEqual(gis.pinMetaFor('MEDICAL').icon, 'stethoscope');
    assert.strictEqual(gis.pinMetaFor('FOOD').icon, 'chef-hat');
    assert.strictEqual(gis.pinMetaFor('FIELD_SERVICE').icon, 'wrench');
  });

  await it('resolveTileConfig offline + custom URL', () => {
    const off = gis.resolveTileConfig({ MAP_PROVIDER: 'offline' });
    assert.strictEqual(off.provider, 'offline');
    const custom = gis.resolveTileConfig({
      MAP_TILES_URL: 'https://tiles.example/{z}/{x}/{y}.png',
    });
    assert.strictEqual(custom.provider, 'custom');
    assert.ok(custom.tiles[0].includes('tiles.example'));
  });

  await it('dashedCirclePoints returns closed-ish ring', () => {
    const pts = gis.dashedCirclePoints({ lat: 35.7, lng: 51.4 }, 200, 16);
    assert.strictEqual(pts.length, 16);
    const d = gis.haversineMeters({ lat: 35.7, lng: 51.4 }, pts[0]);
    assert.ok(Math.abs(d - 200) < 15, String(d));
  });

  console.log('\nPhase 6 GIS — live API (port 4000)');
  let token = null;
  await it('health reachable', async () => {
    const r = await req('GET', '/health');
    assert.ok(r.status === 200, JSON.stringify(r.body));
  }).catch(async () => {
    console.log('  SKIP live — start API with npm run dev');
  });

  try {
    const h = await req('GET', '/health');
    if (h.status === 200) {
      await it('POST /gis/locate rejects Paris, accepts Tehran', async () => {
        const bad = await req('POST', '/gis/locate', { lat: 48.85, lng: 2.35 });
        assert.strictEqual(bad.body.data.ok, false);
        const ok = await req('POST', '/gis/locate', { lat: 35.6892, lng: 51.389 });
        assert.strictEqual(ok.body.data.ok, true);
      });

      await it('POST /gis/proximity returns Persian ETA', async () => {
        const r = await req('POST', '/gis/proximity', {
          fromLat: 35.6892,
          fromLng: 51.389,
          toLat: 35.692,
          toLng: 51.392,
        });
        assert.ok(r.body.data.faDistance);
      });

      await it('dev-login + alert zone 1.5km + nearby hits', async () => {
        const login = await req('POST', '/auth/dev-login', {
          role: 'CONSUMER',
          id: 'consumer_demo',
        });
        token = login.body.data.tokens.accessToken;
        const zone = await req(
          'POST',
          '/alert-zones',
          { label: 'home', lat: 35.6892, lng: 51.389, radiusM: 1500 },
          token,
        );
        assert.ok(zone.body.success && zone.body.data.id);
        const near = await req('GET', `/alert-zones/${zone.body.data.id}/nearby`, null, token);
        assert.ok(near.body.success);
        assert.ok(Array.isArray(near.body.data.hits));
        assert.ok(typeof near.body.data.alertCount === 'number');
        assert.ok(near.body.data.hits.every((x) => x.distanceMeters <= 1500));
      });

      await it('alert zone rejects out-of-Iran coords', async () => {
        const r = await req(
          'POST',
          '/alert-zones',
          { label: 'bad', lat: 48.85, lng: 2.35, radiusM: 1000 },
          token,
        );
        assert.strictEqual(r.body.error.code, 'OUT_OF_IRAN_BOUNDS');
      });

      await it('GET /gis/tiles returns provider config', async () => {
        const r = await req('GET', '/gis/tiles');
        assert.ok(r.body.data.provider);
      });
    } else {
      console.log('  SKIP live API smoke');
    }
  } catch (e) {
    console.log('  SKIP live API smoke: ' + e.message);
  }

  console.log('\nMap page source checks');
  await it('map page has dashed fuzzy + Iran locate + ETA', () => {
    const src = fs.readFileSync(
      path.join(ROOT, '..', 'web', 'src', 'app', 'map', 'page.tsx'),
      'utf8',
    );
    assert.ok(src.includes('setLineDash'));
    assert.ok(src.includes('isInIran') || src.includes('IRAN_BOUNDS'));
    assert.ok(src.includes('پیاده'));
    assert.ok(src.includes('alert-zones'));
  });

  console.log('\n--------------------------------');
  console.log('Phase6 PROD passed=' + passed + ' failed=' + failed);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
