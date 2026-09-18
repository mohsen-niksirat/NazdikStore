/**
 * Debug suite — proves browser-path CORS + auth OTP + api base wiring.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

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

function raw(method, p, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(
      {
        hostname: '127.0.0.1',
        port: 4000,
        path: p,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let rawBody = '';
        res.on('data', (c) => (rawBody += c));
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: rawBody,
          }),
        );
      },
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function main() {
  console.log('Button/API debug');

  await it('health 200', async () => {
    const r = await raw('GET', '/api/v1/health');
    if (r.status !== 200) throw new Error('status ' + r.status);
  });

  await it('CORS ACAO allows browser origin 127.0.0.1:5000', async () => {
    const r = await raw('POST', '/api/v1/auth/otp/request', {
      headers: { Origin: 'http://127.0.0.1:5000' },
      body: { phone: '09123456789' },
    });
    const acao = r.headers['access-control-allow-origin'];
    if (!acao) throw new Error('missing ACAO header');
    if (acao !== '*' && acao !== 'http://127.0.0.1:5000') {
      throw new Error('ACAO=' + acao);
    }
  });

  await it('OPTIONS preflight for POST otp', async () => {
    const r = await raw('OPTIONS', '/api/v1/auth/otp/request', {
      headers: {
        Origin: 'http://127.0.0.1:5000',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    });
    if (r.status >= 400) throw new Error('preflight ' + r.status);
    const acao = r.headers['access-control-allow-origin'];
    if (!acao) throw new Error('preflight missing ACAO');
  });

  await it('OTP request from browser-like origin returns success', async () => {
    const r = await raw('POST', '/api/v1/auth/otp/request', {
      headers: { Origin: 'http://127.0.0.1:5000' },
      body: { phone: '09123456789' },
    });
    const j = JSON.parse(r.body);
    if (!j.success) throw new Error(r.body);
  });

  await it('web .env.local points at 127.0.0.1:4000', () => {
    const p = path.join(__dirname, '../../../apps/web/.env.local');
    const t = fs.readFileSync(p, 'utf8');
    if (!t.includes('127.0.0.1:4000') && !t.includes('localhost:4000')) {
      throw new Error(t);
    }
  });

  await it('auth page uses apiFetch (not raw API_URL)', () => {
    const t = fs.readFileSync(
      path.join(__dirname, '../../../apps/web/src/app/auth/page.tsx'),
      'utf8',
    );
    if (!t.includes("apiFetch")) throw new Error('auth not using apiFetch');
    if (t.includes('const API_URL')) throw new Error('still has API_URL');
  });

  await it('mini-server CORS star for dev', () => {
    const t = fs.readFileSync(path.join(__dirname, 'mini-server.cjs'), 'utf8');
    if (!t.includes("Access-Control-Allow-Origin")) throw new Error('no ACAO');
  });

  await it('api status chip exists in header', () => {
    const t = fs.readFileSync(
      path.join(__dirname, '../../../apps/web/src/app/layout.tsx'),
      'utf8',
    );
    if (!t.includes('ApiStatusChip')) throw new Error('missing ApiStatusChip');
  });

  console.log('\nDEBUG passed=' + passed + ' failed=' + failed);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
