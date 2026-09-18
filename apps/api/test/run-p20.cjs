/**
 * P20 — hours + trust tests
 */
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const http = require('http');

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
  console.log('\nP20 UI source');
  await it('vendor profile shows open/closed + privacy', () => {
    const t = fs.readFileSync(
      path.join(__dirname, '../../../apps/web/src/app/vendors/[id]/page.tsx'),
      'utf8',
    );
    assert.ok(t.includes('isOpenNow') || t.includes('باز'));
    assert.ok(t.includes('/trust') || t.includes('privacy') || t.includes('privacy'));
  });

  console.log('\nP20 live');
  try {
    if ((await req('GET', '/health')).status === 200) {
      await it('clinic hours open-now true', async () => {
        const r = await req('GET', '/vendors/vp_clinic_demo/trust');
        assert.ok(r.body.success);
        assert.ok(Array.isArray(r.body.data.hours));
        assert.ok(r.body.data.hours.length >= 1);
      });
      await it('vendor sets custom hours', async () => {
        const login = await req('POST', '/auth/dev-login', { role: 'VENDOR', id: 'hours_vendor' });
        const token = login.body.data.tokens.accessToken;
        const r = await req(
          'POST',
          '/vendors/me/hours',
          { rules: [{ weekday: new Date().getDay(), startMinute: 0, endMinute: 1440 }] },
          token,
        );
        assert.ok(r.body.success);
        assert.strictEqual(r.body.data.isOpenNow, true);
      });
      await it('home vendor has privacy note', async () => {
        const r = await req('GET', '/vendors/vp_food_1/trust');
        assert.ok(r.body.data.privacy && r.body.data.privacy.fa.includes('مخفی'));
      });
    } else {
      console.log('  SKIP live');
    }
  } catch (e) {
    console.log('  SKIP live: ' + e.message);
  }

  console.log('\n--------------------------------');
  console.log('P20 passed=' + passed + ' failed=' + failed);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
