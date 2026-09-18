/**
 * P23–P26 smoke
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
  const repo = path.join(__dirname, '../../..');

  console.log('\nDocs/UI');
  await it('GO_LIVE.md exists', () => {
    assert.ok(fs.existsSync(path.join(repo, 'docs/GO_LIVE.md')));
  });
  await it('home has coupon banner', () => {
    const t = fs.readFileSync(path.join(repo, 'apps/web/src/app/page.tsx'), 'utf8');
    assert.ok(t.includes('PERCENT20'));
  });
  await it('profile has address book', () => {
    const t = fs.readFileSync(path.join(repo, 'apps/web/src/app/profile/page.tsx'), 'utf8');
    assert.ok(t.includes('دفترچه آدرس') || t.includes('/me/addresses'));
  });

  console.log('\nLive P23–P25');
  try {
    if ((await req('GET', '/health')).status === 200) {
      const login = await req('POST', '/auth/dev-login', {
        role: 'CONSUMER',
        id: 'p23_user',
        phone: '09125556666',
      });
      const token = login.body.data.tokens.accessToken;

      await it('save + list address', async () => {
        const add = await req(
          'POST',
          '/me/addresses',
          { label: 'خانه', line: 'تهران، خیابان آزادی، پلاک ۱', isDefault: true },
          token,
        );
        assert.ok(add.body.success, JSON.stringify(add.body));
        const list = await req('GET', '/me/addresses', null, token);
        assert.ok(list.body.success && list.body.data.length >= 1);
      });

      await it('growth home banner', async () => {
        const r = await req('GET', '/growth/home-banner');
        assert.ok(r.body.success);
        assert.ok(r.body.data.coupons.length >= 1);
      });

      await it('referral-me generates code', async () => {
        const r = await req('GET', '/growth/referral-me', null, token);
        assert.ok(r.body.success);
        assert.ok(String(r.body.data.code).startsWith('NZ') || r.body.data.code.length > 3);
      });

      await it('courier jobs list', async () => {
        const cl = await req('POST', '/auth/dev-login', { role: 'COURIER', id: 'p25_courier' });
        const ct = cl.body.data.tokens.accessToken;
        const r = await req('GET', '/courier/jobs', null, ct);
        assert.ok(r.body.success);
        assert.ok(Array.isArray(r.body.data));
      });

      await it('rfq open list', async () => {
        const r = await req('GET', '/rfq/open', null, token);
        assert.ok(r.body.success);
        assert.ok(Array.isArray(r.body.data));
      });
    } else {
      console.log('  SKIP live');
    }
  } catch (e) {
    console.log('  SKIP live: ' + e.message);
  }

  console.log('\n--------------------------------');
  console.log('P23-26 passed=' + passed + ' failed=' + failed);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
