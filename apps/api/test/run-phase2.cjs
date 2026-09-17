/**
 * Phase 2 test runner — PostGIS map engine, fuzzy locations, clustering.
 * Extends Phase 1 suite. No Docker/DB required (memory spatial engine).
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

process.env.JWT_ACCESS_SECRET = 'test_access_secret';
process.env.JWT_ACCESS_TTL = '15m';
process.env.REDIS_URL = '';
process.env.NODE_ENV = 'test';

const origJs = Module._extensions['.js'];
function compileTs(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      sourceMap: false,
    },
    fileName: filePath,
  });
  return outputText;
}
Module._extensions['.ts'] = function (module, filename) {
  module._compile(compileTs(filename), filename);
};

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === '@nazdik/shared') return path.join(SHARED_SRC, 'index.ts');
  try {
    return origResolve.call(this, request, parent, ...rest);
  } catch (e) {
    const candidate = path.join(apiNM, request);
    if (fs.existsSync(candidate) || fs.existsSync(`${candidate}.js`)) {
      return origResolve.call(this, candidate, parent, ...rest);
    }
    throw e;
  }
};
const origPaths = Module._nodeModulePaths;
Module._nodeModulePaths = function (from) {
  const paths = origPaths.call(this, from);
  paths.unshift(apiNM, rootNM);
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
  if (!currentSuite) throw new Error('it() outside describe');
  currentSuite.tests.push({ name, fn });
}
async function run() {
  for (const suite of suites) {
    console.log(`\n${suite.name}`);
    for (const test of suite.tests) {
      try {
        await test.fn();
        results.passed++;
        console.log(`  ✓ ${test.name}`);
      } catch (err) {
        results.failed++;
        results.errors.push({ suite: suite.name, test: test.name, err });
        console.log(`  ✗ ${test.name}`);
        console.log(`    ${err?.message || err}`);
      }
    }
  }
  console.log('\n────────────────────────────────');
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
  const shared = require(path.join(SHARED_SRC, 'index.ts'));
  const { MapService } = require(path.join(API_SRC, 'map/map.service.ts'));
  const { demoVendors } = require(path.join(API_SRC, 'seed/seed.service.ts'));
  const { RedisService } = require(path.join(API_SRC, 'redis/redis.service.ts'));
  const { OtpService } = require(path.join(API_SRC, 'auth/otp.service.ts'));

  // ---------- GEO UTILS ----------
  describe('Geo utilities', () => {
    it('haversine distance ~0 for same point', () => {
      const p = { lat: 35.6892, lng: 51.389 };
      assert.ok(shared.haversineMeters(p, p) < 1);
    });

    it('haversine ~1113m for 0.01° latitude', () => {
      const a = { lat: 35.0, lng: 51.0 };
      const b = { lat: 35.01, lng: 51.0 };
      const d = shared.haversineMeters(a, b);
      assert.ok(Math.abs(d - 1113) < 15, `got ${d}`);
    });

    it('bounding box expands around center', () => {
      const bb = shared.boundingBoxAround({ lat: 35.6892, lng: 51.389 }, 1000);
      assert.ok(bb.maxLat > 35.6892 && bb.minLat < 35.6892);
      assert.ok(bb.maxLng > 51.389 && bb.minLng < 51.389);
      // ~1km ≈ 0.009° lat
      assert.ok(Math.abs(bb.maxLat - 35.6892 - 0.009) < 0.002);
    });

    it('parseBbox supports both lng-first and lat-first', () => {
      const a = shared.parseBbox('51.3,35.6,51.5,35.8');
      assert.ok(a && a.minLng === 51.3 && a.minLat === 35.6);
      const b = shared.parseBbox('35.6,51.3,35.8,51.5');
      assert.ok(b && b.minLat === 35.6 && b.minLng === 51.3);
      assert.strictEqual(shared.parseBbox('bad'), null);
    });

    it('obfuscateCoordinate is deterministic for same seed', () => {
      const a = shared.obfuscateCoordinate(35.7, 51.4, 'vp_1');
      const b = shared.obfuscateCoordinate(35.7, 51.4, 'vp_1');
      assert.strictEqual(a.lat, b.lat);
      assert.strictEqual(a.lng, b.lng);
    });

    it('obfuscateCoordinate differs across seeds', () => {
      const a = shared.obfuscateCoordinate(35.7, 51.4, 'vp_1');
      const b = shared.obfuscateCoordinate(35.7, 51.4, 'vp_2');
      assert.ok(a.lat !== b.lat || a.lng !== b.lng);
    });

    it('obfuscateCoordinate stays within 200m of true point', () => {
      const trueP = { lat: 35.6892, lng: 51.389 };
      for (let i = 0; i < 20; i++) {
        const f = shared.obfuscateCoordinate(trueP.lat, trueP.lng, `seed_${i}`, 200);
        const d = shared.haversineMeters(trueP, f);
        assert.ok(d <= 200 + 1, `seed_${i} distance ${d}`);
        assert.ok(d >= 200 * 0.45 - 1, `seed_${i} too close ${d}`);
      }
    });

    it('circlePolygon closes and has 13+ points', () => {
      const poly = shared.circlePolygon({ lat: 35.7, lng: 51.4 }, 200, 12);
      assert.strictEqual(poly.type, 'Polygon');
      const ring = poly.coordinates[0];
      assert.ok(ring.length >= 13);
      assert.deepStrictEqual(ring[0], ring[ring.length - 1]);
    });
  });

  // ---------- FUZZY PRIVACY ----------
  describe('Fuzzy Location Mode (home-based privacy)', () => {
    it('home-based vendors never expose exact lat/lng', () => {
      const r = shared.applyLocationPrivacy({
        id: 'vp_home',
        lat: 35.7,
        lng: 51.4,
        isHomeBased: true,
      });
      assert.strictEqual(r.lat, null);
      assert.strictEqual(r.lng, null);
      assert.ok(r.fuzzyPolygon);
      assert.ok(Math.abs(r.displayLat - 35.7) > 0.0001 || Math.abs(r.displayLng - 51.4) > 0.0001);
    });

    it('shop vendors keep exact public pin', () => {
      const r = shared.applyLocationPrivacy({
        id: 'vp_shop',
        lat: 35.68,
        lng: 51.38,
        isHomeBased: false,
      });
      assert.strictEqual(r.lat, 35.68);
      assert.strictEqual(r.lng, 51.38);
      assert.strictEqual(r.fuzzyPolygon, null);
      assert.strictEqual(r.displayLat, 35.68);
    });

    it('map API response never contains true home coordinates', async () => {
      const prisma = { $queryRaw: async () => { throw new Error('offline'); } };
      const map = new MapService(prisma);
      map.seedMemory(demoVendors());

      const result = await map.queryVendors({
        lat: 35.6892,
        lng: 51.389,
        radiusKm: 10,
        zoom: 14,
        exact: true,
      });

      const home = result.features.filter((f) => f.type === 'vendor' && f.isHomeBased);
      assert.ok(home.length >= 1, 'expected home-based vendors in demo set');

      for (const f of home) {
        if (f.type !== 'vendor') continue;
        assert.strictEqual(f.lat, null, 'true lat must be null');
        assert.strictEqual(f.lng, null, 'true lng must be null');
        assert.ok(f.fuzzyPolygon, 'fuzzy polygon required');
        assert.ok(f.displayLat != null && f.displayLng != null);
      }

      // Ensure raw payload does not leak original home coords as display of exact
      const raw = JSON.stringify(result);
      const secret = demoVendors().filter((v) => v.isHomeBased);
      for (const s of secret) {
        // display coords must differ from secret exact coords
        const exactLat = s.lat;
        const displayHit = home.find((f) => f.type === 'vendor' && f.id === s.id);
        if (displayHit) {
          assert.notStrictEqual(displayHit.displayLat, exactLat);
          assert.notStrictEqual(displayHit.displayLng, s.lng);
        }
        assert.ok(!raw.includes(`"lat":${s.lat},`) || !raw.includes(`"lng":${s.lng}`), 'leak check');
      }
    });
  });

  // ---------- MAP SERVICE ----------
  describe('MapService radius / bbox / filter', () => {
    function makeMap() {
      const prisma = { $queryRaw: async () => { throw new Error('offline'); } };
      const map = new MapService(prisma);
      map.seedMemory(demoVendors());
      return map;
    }

    it('radius search returns only vendors within range', async () => {
      const map = makeMap();
      const near = await map.queryVendors({ lat: 35.6865, lng: 51.385, radiusKm: 1, zoom: 15, exact: true });
      const far = await map.queryVendors({ lat: 35.6865, lng: 51.385, radiusKm: 0.2, zoom: 15, exact: true });
      assert.ok(near.total >= far.total);
      for (const f of near.features) {
        if (f.type !== 'vendor' || f.distanceMeters == null) continue;
        assert.ok(f.distanceMeters <= 1000 + 1, `${f.businessName} at ${f.distanceMeters}`);
      }
    });

    it('filters by vendorType', async () => {
      const map = makeMap();
      const res = await map.queryVendors({
        lat: 35.6892,
        lng: 51.389,
        radiusKm: 20,
        vendorType: 'MEDICAL',
        zoom: 16,
        exact: true,
      });
      assert.ok(res.total >= 1);
      for (const f of res.features) {
        if (f.type === 'vendor') assert.strictEqual(f.vendorType, 'MEDICAL');
      }
    });

    it('bbox query returns vendors inside box', async () => {
      const map = makeMap();
      const res = await map.queryVendors({
        bbox: '51.35,35.65,51.42,35.73',
        zoom: 15,
        exact: true,
      });
      assert.ok(res.total >= 1);
      let sawPublicPin = false;
      for (const f of res.features) {
        if (f.type !== 'vendor') continue;
        if (!f.isHomeBased) {
          sawPublicPin = true;
          assert.ok(f.displayLat >= 35.65 && f.displayLat <= 35.73, `lat ${f.displayLat}`);
          assert.ok(f.displayLng >= 51.35 && f.displayLng <= 51.42, `lng ${f.displayLng}`);
          assert.strictEqual(f.lat, f.displayLat);
        } else {
          // Home-based: filtered on true coords, displayed fuzzy (may sit slightly outside bbox)
          assert.strictEqual(f.lat, null);
          assert.ok(f.fuzzyPolygon);
        }
      }
      assert.ok(sawPublicPin, 'expected at least one non-home vendor in bbox');
    });

    it('clustering activates at low zoom with many points', async () => {
      const map = makeMap();
      // densify
      const dense = [];
      for (let i = 0; i < 60; i++) {
        dense.push({
          id: `p${i}`,
          vendorProfileId: `vp${i}`,
          businessName: `V${i}`,
          vendorType: 'FOOD',
          categoryTags: [],
          description: null,
          verificationStatus: 'VERIFIED',
          isHomeBased: false,
          lat: 35.68 + (i % 10) * 0.0005,
          lng: 51.38 + Math.floor(i / 10) * 0.0005,
          address: null,
          serviceRadiusKm: 3,
        });
      }
      map.seedMemory(dense);
      const clustered = await map.queryVendors({
        lat: 35.68,
        lng: 51.38,
        radiusKm: 5,
        zoom: 10,
      });
      assert.strictEqual(clustered.clustered, true);
      const clusters = clustered.features.filter((f) => f.type === 'cluster');
      assert.ok(clusters.length >= 1, 'expected at least one cluster');
      for (const c of clusters) {
        if (c.type === 'cluster') assert.ok(c.count >= 2);
      }

      const exact = await map.queryVendors({
        lat: 35.68,
        lng: 51.38,
        radiusKm: 5,
        zoom: 16,
        exact: true,
      });
      assert.strictEqual(exact.clustered, false);
      assert.ok(exact.features.every((f) => f.type === 'vendor'));
    });

    it('radius presets 1/3/5/10 change result counts monotonically for scattered data', async () => {
      const map = makeMap();
      const c = { lat: 35.70, lng: 51.40 };
      let prev = -1;
      for (const km of [1, 3, 5, 10]) {
        const res = await map.queryVendors({ ...c, radiusKm: km, zoom: 16, exact: true });
        assert.ok(res.total >= prev, `radius ${km}: ${res.total} < ${prev}`);
        prev = res.total;
      }
    });
  });

  // ---------- PERF ----------
  describe('Spatial query performance (Phase 2 criterion)', () => {
    it('10,000-point radius scan completes under 50ms (AABB+haversine; GiST in prod)', () => {
      const prisma = { $queryRaw: async () => { throw new Error('offline'); } };
      const map = new MapService(prisma);
      const runs = [];
      let matched = 0;
      for (let i = 0; i < 5; i++) {
        const r = map.benchmarkRadiusSearch(10_000, { lat: 35.6892, lng: 51.389 }, 500);
        runs.push(r.ms);
        matched = r.matched;
      }
      const median = runs.sort((a, b) => a - b)[Math.floor(runs.length / 2)];
      assert.ok(matched > 0, `expected matches, got ${matched}`);
      assert.ok(median < 50, `median radius scan took ${median.toFixed(2)}ms (runs=${runs.map((x) => x.toFixed(1)).join(',')})`);
    });
  });

  // ---------- REGRESSION: Phase 1 still green ----------
  describe('Phase 1 regression (auth core)', () => {
    it('phone normalize + OTP rate limit still work', async () => {
      assert.strictEqual(shared.normalizeIrMobile('+989123456789'), '09123456789');
      const redis = new RedisService();
      redis.clearMemory();
      const sms = { sendOtp: async () => undefined };
      const otp = new OtpService(redis, sms);
      await otp.requestOtp('09123456789', '8.8.8.8');
      await otp.requestOtp('09123456789', '8.8.8.8');
      await otp.requestOtp('09123456789', '8.8.8.8');
      await assert.rejects(() => otp.requestOtp('09123456789', '8.8.8.8'));
    });

    it('error envelope includes Persian message', () => {
      const env = shared.buildErrorEnvelope('OTP_RATE_LIMITED');
      assert.ok(env.error.message.length > 5);
    });
  });

  await run();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
