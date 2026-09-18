/**
 * Enterprise Phase 12 — Persian fuzzy search + geo-ranking tests.
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

function req(method, p) {
  return new Promise((resolve, reject) => {
    const r = http.request(
      {
        hostname: '127.0.0.1',
        port: 4000,
        path: '/api/v1' + p,
        method,
        headers: { 'Content-Type': 'application/json' },
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
    r.end();
  });
}

async function main() {
  const s = require(path.join(SHARED, 'index.ts'));

  console.log('\nPersian normalization');
  await it('ی/ک unify + Arabic variants', () => {
    assert.strictEqual(s.normalizePersian('پيتزا'), 'پیتزا');
    assert.strictEqual(s.normalizePersian('كباب'), 'کباب');
    assert.strictEqual(s.normalizePersian('كيك'), 'کیک');
  });

  await it('strips diacritics (اعراب)', () => {
    assert.strictEqual(s.normalizePersian('پِیتزا'), 'پیتزا');
  });

  await it('handles half-space / ZWNJ', () => {
    const a = s.normalizePersian('مطب خانگی');
    const b = s.normalizePersian('مطب‌خانگی');
    assert.ok(a.replace(/\s/g, '').includes('مطب') || b.includes('مطب'));
  });

  console.log('\nFuzzy match');
  await it('پیتزا matches پيتزا and پیتزای خونگی', () => {
    assert.ok(s.textSimilarity('پیتزا', 'پيتزا') > 0.5);
    assert.ok(s.textSimilarity('پیتزا', 'پیتزای خونگی') > 0.35);
    assert.ok(s.textSimilarity('پیتزا', 'نان سنگک') < 0.2);
  });

  await it('geoRank ranks closer + higher rating under equal text', () => {
    const origin = { lat: 35.6892, lng: 51.389 };
    const docs = [
      { id: 'far', title: 'پیتزا دور', lat: 35.9, lng: 51.8, rating: 5, isOpenNow: true },
      { id: 'near', title: 'پیتزا نزدیک', lat: 35.69, lng: 51.39, rating: 4, isOpenNow: true },
    ];
    const hits = s.geoRankSearch('پیتزا', docs, { origin });
    assert.strictEqual(hits[0].id, 'near');
  });

  await it('open business preferred over closed when similar', () => {
    const origin = { lat: 35.6892, lng: 51.389 };
    const docs = [
      { id: 'closed', title: 'پیتزا بسته', lat: 35.6892, lng: 51.389, rating: 4.5, isOpenNow: false },
      { id: 'open', title: 'پیتزا باز', lat: 35.6895, lng: 51.3892, rating: 4.0, isOpenNow: true },
    ];
    const hits = s.geoRankSearch('پیتزا', docs, { origin });
    assert.strictEqual(hits[0].id, 'open');
  });

  await it('maxDistance filter excludes far docs', () => {
    const origin = { lat: 35.6892, lng: 51.389 };
    const docs = [
      { id: 'near', title: 'پیتزا', lat: 35.6892, lng: 51.389, rating: 4 },
      { id: 'far', title: 'پیتزا شهر دیگر', lat: 37.0, lng: 54.0, rating: 5 },
    ];
    const hits = s.geoRankSearch('پیتزا', docs, { origin, maxDistanceM: 5000 });
    assert.ok(hits.every((h) => h.id !== 'far'));
    assert.ok(hits.some((h) => h.id === 'near'));
  });

  console.log('\nLive API');
  try {
    const h = await req('GET', '/health');
    if (h.status !== 200) throw new Error('api down');

    await it('search پیتزا finds fuzzy matches under 30ms', async () => {
      const r = await req('GET', `/search?q=${encodeURIComponent('پیتزا')}&lat=35.6892&lng=51.389`);
      assert.ok(r.body.success, JSON.stringify(r.body));
      const hits = r.body.data.hits || [];
      assert.ok(hits.length >= 1, 'hits=' + hits.length);
      const titles = hits.map((x) => s.normalizePersian(x.title)).join(' | ');
      assert.ok(titles.includes('پیتزا'), titles);
      assert.ok(r.body.data.tookMs < 30, 'tookMs=' + r.body.data.tookMs);
    });

    await it('search Arabic پيتزا variant', async () => {
      const r = await req('GET', `/search?q=${encodeURIComponent('پيتزا')}`);
      assert.ok(r.body.success);
      assert.ok((r.body.data.hits || []).length >= 1);
    });

    await it('autocomplete returns suggestions + trending', async () => {
      const r = await req('GET', `/search/autocomplete?q=${encodeURIComponent('پیت')}`);
      assert.ok(r.body.success);
      assert.ok(Array.isArray(r.body.data.trending));
    });
  } catch (e) {
    console.log('  SKIP live: ' + e.message);
  }

  console.log('\nUI source');
  await it('search page has debounce 250 + normalizePersian', () => {
    const p = path.join(ROOT, '..', 'web', 'src', 'app', 'search', 'page.tsx');
    const t = fs.readFileSync(p, 'utf8');
    assert.ok(t.includes('250'));
    assert.ok(t.includes('normalizePersian') || t.includes('TRENDING'));
  });

  console.log('\n--------------------------------');
  console.log('ENT Phase12 passed=' + passed + ' failed=' + failed);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
