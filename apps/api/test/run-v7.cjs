/**
 * V7 C1–C3 smoke
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

function req(method, p) {
  return new Promise((resolve, reject) => {
    const r = http.request(
      { hostname: '127.0.0.1', port: 4000, path: '/api/v1' + p, method },
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
  const web = path.join(__dirname, '../../../apps/web/src');

  console.log('\nSources');
  await it('shop storefront page exists', () => {
    assert.ok(fs.existsSync(path.join(web, 'app/shop/[id]/page.tsx')));
  });
  await it('bottom nav in layout', () => {
    const t = fs.readFileSync(path.join(web, 'app/layout.tsx'), 'utf8');
    assert.ok(t.includes('BottomNav'));
  });
  await it('feed has category pills + shop links', () => {
    const t = fs.readFileSync(path.join(web, 'app/feed/page.tsx'), 'utf8');
    assert.ok(t.includes('/shop/'));
    assert.ok(t.includes('pill'));
  });

  console.log('\nLive shop API');
  try {
    if ((await req('GET', '/health')).status === 200) {
      await it('GET /shop/vp_food_1', async () => {
        const r = await req('GET', '/shop/vp_food_1');
        assert.ok(r.body.success, JSON.stringify(r.body));
        assert.ok(r.body.data.businessName);
        assert.ok(r.body.data.cta.map);
      });
    } else {
      console.log('  SKIP live');
    }
  } catch (e) {
    console.log('  SKIP live: ' + e.message);
  }

  console.log('\n--------------------------------');
  console.log('V7-C1-C3 passed=' + passed + ' failed=' + failed);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
