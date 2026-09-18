/**
 * V8 D1–D3 smoke
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
  const web = path.join(__dirname, '../../../apps/web/src');

  console.log('\nSources');
  await it('FeedEngagement used in feed', () => {
    const t = fs.readFileSync(path.join(web, 'app/feed/page.tsx'), 'utf8');
    assert.ok(t.includes('FeedEngagement'));
  });
  await it('search has map deep-link', () => {
    const t = fs.readFileSync(path.join(web, 'app/search/page.tsx'), 'utf8');
    assert.ok(t.includes('/map?') && t.includes('روی نقشه'));
  });
  await it('shop has gallery', () => {
    const t = fs.readFileSync(path.join(web, 'app/shop/[id]/page.tsx'), 'utf8');
    assert.ok(t.includes('ShopGallery'));
  });

  console.log('\nLive');
  try {
    if ((await req('GET', '/health')).status === 200) {
      const login = await req('POST', '/auth/dev-login', { role: 'CONSUMER', id: 'd1_user' });
      const token = login.body.data.tokens.accessToken;
      const feed = await req('GET', '/feed');
      const postId = feed.body.data?.[0]?.id || 'post_demo';

      await it('like toggle increments count', async () => {
        const r = await req('POST', `/feed/${postId}/like`, {}, token);
        assert.ok(r.body.success);
        assert.strictEqual(r.body.data.liked, true);
        assert.ok(r.body.data.likeCount >= 1);
      });

      await it('save toggle works', async () => {
        const r = await req('POST', `/feed/${postId}/save`, {}, token);
        assert.ok(r.body.success);
        assert.strictEqual(r.body.data.saved, true);
      });

      await it('map-pin for food vendor', async () => {
        const r = await req('GET', '/search/map-pin/vp_food_1');
        assert.ok(r.body.success);
        assert.ok(String(r.body.data.mapHref).includes('/map?'));
      });
    } else {
      console.log('  SKIP live');
    }
  } catch (e) {
    console.log('  SKIP live: ' + e.message);
  }

  console.log('\n--------------------------------');
  console.log('V8 passed=' + passed + ' failed=' + failed);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
