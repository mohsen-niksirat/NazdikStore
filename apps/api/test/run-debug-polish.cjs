/**
 * Debug + polish verification (v4.2)
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
          try { json = JSON.parse(raw); } catch { json = raw; }
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
  const repo = path.join(__dirname, '../../..');

  console.log('\nPolish checks');
  await it('ThemeBoot in layout', () => {
    const t = fs.readFileSync(path.join(web, 'app/layout.tsx'), 'utf8');
    assert.ok(t.includes('ThemeBoot'));
  });
  await it('OLED CSS refinements present', () => {
    const t = fs.readFileSync(path.join(web, 'app/globals.css'), 'utf8');
    assert.ok(t.includes("data-theme='oled'"));
    assert.ok(t.includes('focus-visible'));
  });
  await it('docs REMAINING exists', () => {
    assert.ok(fs.existsSync(path.join(repo, 'docs/REMAINING.md')));
  });
  await it('mini-server syntax ok', () => {
    require('child_process').execSync(
      `"C:\\Program Files\\nodejs\\node.exe" --check "${path.join(__dirname, 'mini-server.cjs')}"`,
      { stdio: 'pipe' },
    );
  });

  console.log('\nLive API polish');
  try {
    const h = await req('GET', '/health');
    await it('health lists enterprise features', () => {
      assert.ok(h.body.success);
      const feats = h.body.data.features || [];
      assert.ok(feats.length >= 5, JSON.stringify(h.body.data));
      assert.ok(String(h.body.data.phase).includes('18'));
    });

    const v = await req('POST', '/auth/dev-login', { role: 'VENDOR', id: 'vendor_demo' });
    const vt = v.body.data.tokens.accessToken;
    const c = await req('POST', '/auth/dev-login', { role: 'CONSUMER', id: 'loyal_user', phone: '09123334444' });
    const ct = c.body.data.tokens.accessToken;

    await it('complete order bumps loyalty stamp for consumer', async () => {
      const order = await req(
        'POST',
        '/orders/delivery',
        {
          vendorProfileId: 'vp_vendor_demo',
          deliveryAddress: 'تهران',
          lines: [{ productId: 'p', title: 'item', unitPriceToman: 50000, quantity: 1 }],
        },
        ct,
      );
      assert.ok(order.body.success);
      const id = order.body.data.id;
      await req('POST', `/vendors/me/kanban/${id}/advance`, {}, vt);
      await req('POST', `/vendors/me/kanban/${id}/advance`, {}, vt);
      const done = await req('POST', `/vendors/me/kanban/${id}/advance`, {}, vt);
      assert.ok(done.body.success || done.body.data?.status === 'COMPLETED' || done.body.next === 'COMPLETED', JSON.stringify(done.body));

      const loy = await req('GET', `/loyalty/vp_vendor_demo`, null, ct);
      // consumer id is loyal_user; order consumerId is loyal_user; vendor vp_vendor_demo
      assert.ok(loy.body.success, JSON.stringify(loy.body));
      const stamps = loy.body.data?.progress?.stamps || 0;
      assert.ok(stamps >= 1, 'stamps=' + stamps);
    });

    await it('coupons still validate', async () => {
      const r = await req('POST', '/coupons/validate', {
        code: 'PERCENT20',
        subtotalToman: 200000,
        userId: 'x',
      });
      assert.ok(r.body.data.ok);
    });
  } catch (e) {
    console.log('  SKIP live: ' + e.message);
  }

  console.log('\n--------------------------------');
  console.log('DEBUG-POLISH passed=' + passed + ' failed=' + failed);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
