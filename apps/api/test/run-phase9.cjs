/**
 * Phase 9â€“10 smoke: chat + notifications + PWA assets present.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE = process.env.API_BASE || 'http://127.0.0.1:4000/api/v1';
const WEB = path.resolve(__dirname, '../../../apps/web/public');
const results = { passed: 0, failed: 0 };

function req(method, p, body, token) {
  const url = new URL(BASE + p);
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

async function it(name, fn) {
  try {
    await fn();
    results.passed++;
    console.log('  OK ' + name);
  } catch (e) {
    results.failed++;
    console.log('  FAIL ' + name + ' â€” ' + e.message);
  }
}

function assert(c, m) {
  if (!c) throw new Error(m || 'fail');
}

async function main() {
  console.log('Phase 9â€“10 smoke');

  console.log('\nPhase 9 â€” Chat & notifications');
  let token = null;
  await it('consumer login', async () => {
    const r = await req('POST', '/auth/dev-login', { role: 'CONSUMER', id: 'consumer_demo' });
    assert(r.body.success);
    token = r.body.data.tokens.accessToken;
  });

  await it('send chat message', async () => {
    const r = await req('POST', '/orders/demo_order/messages', { body: 'Ø³Ù„Ø§Ù… Ø§Ø² ØªØ³Øª ÙØ§Ø² Û¹' }, token);
    assert(r.body.success && r.body.data.body.includes('Ø³Ù„Ø§Ù…'));
  });

  await it('list chat messages', async () => {
    const r = await req('GET', '/orders/demo_order/messages', null, token);
    assert(r.body.success && r.body.data.length >= 1);
  });

  await it('list notifications', async () => {
    const r = await req('GET', '/notifications', null, token);
    assert(r.body.success && Array.isArray(r.body.data));
  });

  console.log('\nPhase 10 â€” PWA assets');
  await it('manifest.webmanifest exists', async () => {
    const p = path.join(WEB, 'manifest.webmanifest');
    assert(fs.existsSync(p), p);
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert(j.name && j.start_url === '/');
  });
  await it('sw.js + icon.svg exist', async () => {
    assert(fs.existsSync(path.join(WEB, 'sw.js')));
    assert(fs.existsSync(path.join(WEB, 'icon.svg')));
  });
  await it('layout registers service worker', async () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../../apps/web/src/app/layout.tsx'),
      'utf8',
    );
    assert(src.includes('SWRegister') || src.includes('sw.js'));
  });

  console.log('\n--------------------------------');
  console.log('Passed: ' + results.passed + '  Failed: ' + results.failed);
  if (results.failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

