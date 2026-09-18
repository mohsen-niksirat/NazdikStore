/**
 * Enterprise Phase 15–16 — assistant NLP + fraud + metrics tests.
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

  console.log('\nPhase 15 — Persian NLP');
  await it('parses تعمیرکار پکیج نزدیک من که الان باز باشه', () => {
    const intent = s.parsePersianIntent('تعمیرکار پکیج نزدیک من که الان باز باشه');
    assert.strictEqual(intent.category, 'FIELD_SERVICE');
    assert.ok(intent.tags.includes('پکیج') || intent.tags.includes('تعمیر'));
    assert.strictEqual(intent.status, 'OPEN');
    assert.ok(intent.maxDistanceKm != null);
  });

  await it('parses pizza intent', () => {
    const intent = s.parsePersianIntent('پیتزای خونگی نزدیک من');
    assert.strictEqual(intent.category, 'FOOD');
  });

  await it('assistantQuery degrades gracefully when external AI fails', async () => {
    const r = await s.assistantQuery('دکتر نزدیک', {
      externalParse: async () => {
        throw new Error('timeout');
      },
    });
    assert.strictEqual(r.source, 'local');
    assert.strictEqual(r.intent.category, 'MEDICAL');
  });

  await it('image RFQ classifier + vendor FAQ', () => {
    const img = s.classifyImageTags('boiler-repair.jpg');
    assert.strictEqual(img.suggestedCategory, 'FIELD_SERVICE');
    const faq = s.vendorAutoReply('هزینه ایاب و ذهاب چقدر است؟');
    assert.ok(faq && faq.includes('ایاب'));
  });

  console.log('\nLive API 15');
  try {
    if ((await req('GET', '/health')).status === 200) {
      await it('POST /assistant/query returns local intent', async () => {
        const r = await req('POST', '/assistant/query', {
          query: 'تعمیرکار پکیج نزدیک من که الان باز باشه',
        });
        assert.ok(r.body.success);
        assert.strictEqual(r.body.data.intent.category, 'FIELD_SERVICE');
        assert.strictEqual(r.body.data.source, 'local');
      });
      await it('POST /assistant/faq', async () => {
        const r = await req('POST', '/assistant/faq', { message: 'ساعت کاری؟' });
        assert.ok(r.body.data.reply);
      });
    }
  } catch (e) {
    console.log('  SKIP live15');
  }

  console.log('\nPhase 16 — fraud + metrics');
  await it('rapid cancellations → fraud badge', async () => {
    const phone = '09125550001';
    for (let i = 0; i < 5; i++) {
      await req('POST', '/fraud/cancel-event', { userId: 'fraud_user' });
    }
    const admin = await req('POST', '/auth/dev-login', { role: 'ADMIN', id: 'admin_demo' });
    const at = admin.body.data.tokens.accessToken;
    const list = await req('GET', '/admin/fraud', null, at);
    assert.ok(list.body.success);
    const hit = (list.body.data || []).find((x) => String(x.key).includes('cancel'));
    assert.ok(hit && hit.badge === 'RAPID_CANCELLATION', JSON.stringify(list.body.data));
  });

  await it('OTP abuse flags', async () => {
    for (let i = 0; i < 8; i++) {
      await req('POST', '/fraud/otp-event', { phone: '09120009999' });
    }
    const admin = await req('POST', '/auth/dev-login', { role: 'ADMIN', id: 'admin_demo' });
    const list = await req('GET', '/admin/fraud', null, admin.body.data.tokens.accessToken);
    const hit = (list.body.data || []).find((x) => String(x.key).includes('otp'));
    assert.ok(hit, JSON.stringify(list.body.data));
  });

  await it('admin metrics cached 60s', async () => {
    const admin = await req('POST', '/auth/dev-login', { role: 'ADMIN', id: 'admin_demo' });
    const at = admin.body.data.tokens.accessToken;
    const a = await req('GET', '/admin/metrics', null, at);
    assert.ok(a.body.success);
    assert.ok(typeof a.body.data.gmvToman === 'number');
    const b = await req('GET', '/admin/metrics', null, at);
    assert.strictEqual(b.body.cached, true);
  });

  console.log('\n--------------------------------');
  console.log('ENT Phase15-16 passed=' + passed + ' failed=' + failed);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
