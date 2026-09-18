/**
 * v3.7 — Enterprise UI wiring smoke (API + page sources).
 */
const http = require('http');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

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

function req(method, p, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
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
    if (data) r.write(data);
    r.end();
  });
}

async function main() {
  const web = path.join(__dirname, '../../../apps/web/src/app');

  console.log('\nUI pages');
  await it('assistant page exists', () => {
    assert.ok(fs.existsSync(path.join(web, 'assistant/page.tsx')));
  });
  await it('settings page has theme + data saver', () => {
    const t = fs.readFileSync(path.join(web, 'settings/page.tsx'), 'utf8');
    assert.ok(t.includes('applyTheme') || t.includes('oled'));
    assert.ok(t.includes('data') || t.includes('صرفه‌جویی'));
  });
  await it('cart has coupon field', () => {
    const t = fs.readFileSync(path.join(web, 'cart/page.tsx'), 'utf8');
    assert.ok(t.includes('coupon') || t.includes('تخفیف'));
  });
  await it('admin loads metrics + fraud', () => {
    const t = fs.readFileSync(path.join(web, 'admin/page.tsx'), 'utf8');
    assert.ok(t.includes('/admin/metrics'));
    assert.ok(t.includes('/admin/fraud'));
  });
  await it('home links assistant + settings + track', () => {
    const t = fs.readFileSync(path.join(web, 'page.tsx'), 'utf8');
    assert.ok(t.includes('/assistant'));
    assert.ok(t.includes('/settings'));
    assert.ok(t.includes('/track'));
  });

  console.log('\nLive API');
  try {
    if ((await req('GET', '/health')).status === 200) {
      await it('assistant query UI path', async () => {
        const r = await req('POST', '/assistant/query', { query: 'پیتزا نزدیک' });
        assert.ok(r.body.success);
        assert.ok(r.body.data.intent.category === 'FOOD');
      });
      await it('coupon validate for UI', async () => {
        const r = await req('POST', '/coupons/validate', {
          code: 'PERCENT20',
          subtotalToman: 100000,
          userId: 'ui',
        });
        assert.ok(r.body.data.ok);
        assert.ok(r.body.data.discount > 0);
      });
      await it('admin metrics for BI card', async () => {
        const login = await req('POST', '/auth/dev-login', { role: 'ADMIN', id: 'admin_demo' });
        const token = login.body.data.tokens.accessToken;
        const { request } = require('http');
        const metrics = await new Promise((resolve, reject) => {
          const rq = request(
            {
              hostname: '127.0.0.1',
              port: 4000,
              path: '/api/v1/admin/metrics',
              method: 'GET',
              headers: { Authorization: 'Bearer ' + token },
            },
            (rs) => {
              let raw = '';
              rs.on('data', (c) => (raw += c));
              rs.on('end', () => resolve(JSON.parse(raw)));
            },
          );
          rq.on('error', reject);
          rq.end();
        });
        assert.ok(metrics.success);
        assert.ok(typeof metrics.data.gmvToman === 'number');
      });
    } else {
      console.log('  SKIP live');
    }
  } catch (e) {
    console.log('  SKIP live: ' + e.message);
  }

  console.log('\n--------------------------------');
  console.log('UI v3.7 passed=' + passed + ' failed=' + failed);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
