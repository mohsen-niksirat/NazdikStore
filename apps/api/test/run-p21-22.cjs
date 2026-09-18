/**
 * P21–P22 catalog image + persistence tests
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

// 1x1 PNG
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function main() {
  console.log('\nP21–P22 source');
  await it('vendor board has ProductImageField', () => {
    const t = fs.readFileSync(
      path.join(__dirname, '../../../apps/web/src/app/vendor/board/page.tsx'),
      'utf8',
    );
    assert.ok(t.includes('ProductImageField'));
  });
  await it('verify.cjs exists', () => {
    assert.ok(fs.existsSync(path.join(__dirname, 'verify.cjs')));
  });

  console.log('\nLive');
  try {
    if ((await req('GET', '/health')).status === 200) {
      const v = await req('POST', '/auth/dev-login', { role: 'VENDOR', id: 'img_vendor' });
      const vt = v.body.data.tokens.accessToken;
      const prod = await req(
        'POST',
        '/vendors/me/products',
        { title: 'کباب با تصویر', priceToman: 200000, stock: 5 },
        vt,
      );
      const pid = prod.body.data.id;

      await it('upload product PNG image', async () => {
        const r = await req(
          'POST',
          `/vendors/me/products/${pid}/image`,
          { dataUrl: `data:image/png;base64,${PNG_B64}` },
          vt,
        );
        assert.ok(r.body.success, JSON.stringify(r.body));
        assert.strictEqual(r.body.data.mime, 'image/png');
        assert.ok(r.body.data.dataUrl.startsWith('data:image/png'));
      });

      await it('reject SVG/script polyglot dataUrl', async () => {
        const evil = Buffer.from('<svg onload=alert(1)></svg>').toString('base64');
        const r = await req(
          'POST',
          `/vendors/me/products/${pid}/image`,
          { dataUrl: `data:image/png;base64,${evil}` },
          vt,
        );
        assert.ok(!r.body.success);
      });

      await it('GET product image returns dataUrl', async () => {
        const r = await req('GET', `/media/product/${pid}`);
        assert.ok(r.body.success);
        assert.ok(r.body.data.dataUrl.includes('base64'));
      });

      await it('save state + state-info', async () => {
        const s = await req('POST', '/system/save-state', {});
        assert.ok(s.body.success, JSON.stringify(s.body));
        const info = await req('GET', '/system/state-info');
        assert.ok(info.body.success);
        assert.strictEqual(info.body.data.exists, true);
        assert.ok(info.body.data.size > 0);
      });
    } else {
      console.log('  SKIP live');
    }
  } catch (e) {
    console.log('  SKIP live: ' + e.message);
  }

  console.log('\n--------------------------------');
  console.log('P21-22 passed=' + passed + ' failed=' + failed);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
