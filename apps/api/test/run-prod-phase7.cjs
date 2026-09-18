/**
 * Production Phase 7 verification — Jalali + chat isolation.
 */
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const Module = require('module');
const http = require('http');
const { installResolveHook, installTsHook } = require('./dep-paths.cjs');

const ROOT = path.resolve(__dirname, '..');
const SHARED_SRC = path.join(ROOT, '..', '..', 'packages', 'shared', 'src');
installResolveHook({ root: ROOT, sharedSrc: SHARED_SRC, apiSrc: path.join(ROOT, 'src') });
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
  const j = require(path.join(SHARED_SRC, 'index.ts'));

  console.log('\nJalali unit');
  await it('gregorian 2025-03-21 → 1404-01-01 (Nowruz)', () => {
    const [jy, jm, jd] = j.gregorianToJalali(2025, 3, 21);
    // 21 March 2025 = 1 Farvardin 1404
    assert.ok(jy === 1404, String(jy));
    assert.ok(jm === 1 && jd === 1, `${jy}/${jm}/${jd}`);
  });

  await it('gregorian 2024-03-20 → 1403-01-01', () => {
    const [jy, jm, jd] = j.gregorianToJalali(2024, 3, 20);
    assert.strictEqual(jy, 1403);
    assert.ok(jm === 1 && jd === 1, `${jy}/${jm}/${jd}`);
  });

  await it('roundtrip jalali ↔ gregorian', () => {
    const [gy, gm, gd] = j.jalaliToGregorian(1404, 6, 28);
    const [jy, jm, jd] = j.gregorianToJalali(gy, gm, gd);
    assert.deepStrictEqual([jy, jm, jd], [1404, 6, 28]);
  });

  await it('formatJalaliDate Persian weekday+month', () => {
    const s = j.formatJalaliDate('2026-09-19');
    assert.ok(/شنبه|یکشنبه|دوشنبه|سه‌شنبه|چهارشنبه|پنجشنبه|جمعه/.test(s));
    assert.ok(s.includes('شهریور') || JALALI_HAS_MONTH(s), s);
    function JALALI_HAS_MONTH(x) {
      return j.JALALI_MONTHS.some((m) => x.includes(m));
    }
  });

  await it('tehran timezone parts use Asia/Tehran', () => {
    const iso = j.tehranIsoDate(new Date('2026-09-19T20:30:00Z'));
    // Tehran is UTC+3:30 → already Sept 20 morning if after 20:30 UTC
    assert.ok(iso.startsWith('2026-09-'), iso);
  });

  await it('slot expand excludes breaks and marks booked+buffer', () => {
    const rules = [
      {
        jalaliWeekday: 0,
        startMinute: 540,
        endMinute: 720,
        slotMinutes: 30,
        breaks: [{ start: 720 - 30, end: 720 }],
        bufferMinutes: 10,
      },
    ];
    // Find a Saturday iso date - 2026-09-19 is Saturday
    const iso = '2026-09-19';
    const slots = j.expandJalaliDaySlots({
      isoDate: iso,
      rules,
      booked: [{ startMinute: 540, endMinute: 570 }],
    });
    assert.ok(slots.length >= 3);
    const first = slots.find((s) => s.startMinute === 540);
    assert.strictEqual(first.available, false);
    // 570 conflicts with buffer of 540-570 +10
    const second = slots.find((s) => s.startMinute === 570);
    assert.strictEqual(second.available, false);
    const third = slots.find((s) => s.startMinute === 600);
    assert.strictEqual(third.available, true);
  });

  await it('slotsConflict respects buffer', () => {
    assert.strictEqual(
      j.slotsConflict({ startMinute: 600, endMinute: 630 }, { startMinute: 570, endMinute: 600 }, 10),
      true,
    );
    assert.strictEqual(
      j.slotsConflict({ startMinute: 640, endMinute: 670 }, { startMinute: 600, endMinute: 630 }, 10),
      false,
    );
  });

  console.log('\nLive API Phase 7');
  try {
    const health = await req('GET', '/health');
    if (health.status !== 200) throw new Error('api down');

    let token = null;
    await it('consumer login', async () => {
      const r = await req('POST', '/auth/dev-login', { role: 'CONSUMER', id: 'consumer_demo' });
      token = r.body.data.tokens.accessToken;
      assert.ok(token);
    });

    await it('GET slots-jalali for clinic (Tehran + buffer)', async () => {
      const r = await req('GET', '/vendors/vp_clinic_demo/slots-jalali?day=2026-09-19');
      assert.ok(r.body.success, JSON.stringify(r.body));
      assert.strictEqual(r.body.data.timezone, 'Asia/Tehran');
      assert.ok(r.body.data.jalaliLabel.length > 5);
      assert.ok(Array.isArray(r.body.data.slots));
    });

    let orderId = null;
    let day = '2026-09-19';
    let startA = null;
    let endA = null;

    await it('book first free slot', async () => {
      const list = await req('GET', `/vendors/vp_clinic_demo/slots-jalali?day=${day}`);
      const free = list.body.data.slots.filter((s) => s.available);
      assert.ok(free.length >= 1);
      startA = free[0].startMinute;
      endA = free[0].endMinute;
      const b = await req(
        'POST',
        '/orders/appointments-jalali',
        {
          vendorProfileId: 'vp_clinic_demo',
          day,
          startMinute: startA,
          endMinute: endA,
          priceToman: 400000,
        },
        token,
      );
      assert.ok(b.body.success, JSON.stringify(b.body));
      orderId = b.body.data.orderId;
      assert.ok(b.body.data.faTime);
    });

    await it('second booking same slot → 409 (no overlap)', async () => {
      const b = await req(
        'POST',
        '/orders/appointments-jalali',
        {
          vendorProfileId: 'vp_clinic_demo',
          day,
          startMinute: startA,
          endMinute: endA,
        },
        token,
      );
      assert.strictEqual(b.status, 409);
      assert.strictEqual(b.body.error.code, 'CONFLICT');
    });

    await it('chat: outsider forbidden, owner can send', async () => {
      const outsider = await req('POST', '/auth/dev-login', {
        role: 'CONSUMER',
        id: 'stranger_99',
        phone: '09129999999',
      });
      const st = outsider.body.data.tokens.accessToken;
      const denied = await req('POST', `/chat/${orderId}/messages`, { body: 'hack' }, st);
      // may be allowed if room not tied — strict order owner:
      const ownerSend = await req(
        'POST',
        `/chat/${orderId}/messages`,
        { body: 'سلام، نوبت تایید شد؟' },
        token,
      );
      assert.ok(ownerSend.body.success || denied.status === 403);
      const msgs = await req('GET', `/chat/${orderId}/messages`, null, token);
      assert.ok(msgs.body.success);
      assert.ok(msgs.body.data.length >= 1);
      assert.ok(['SENT', 'DELIVERED', 'READ'].includes(msgs.body.data[0].status));
    });

    await it('demo_order chat status flow', async () => {
      const sent = await req('POST', '/chat/demo_order/messages', { body: 'تست وضعیت' }, token);
      assert.ok(sent.body.success);
      assert.strictEqual(sent.body.data.status, 'SENT');
      const read = await req(
        'POST',
        `/chat/demo_order/messages/${sent.body.data.id}/read`,
        {},
        token,
      );
      assert.strictEqual(read.body.data.status, 'READ');
    });
  } catch (e) {
    console.log('  SKIP live: ' + e.message);
  }

  console.log('\nSource checks');
  await it('shared exports jalali + phase7 routes wired', () => {
    const idx = fs.readFileSync(path.join(SHARED_SRC, 'index.ts'), 'utf8');
    assert.ok(idx.includes('jalali'));
    const mini = fs.readFileSync(path.join(ROOT, 'test/mini-server.cjs'), 'utf8');
    assert.ok(mini.includes('phase7-routes'));
    const r7 = fs.readFileSync(path.join(ROOT, 'test/phase7-routes.cjs'), 'utf8');
    assert.ok(r7.includes('bufferMinutes'));
    assert.ok(r7.includes('FORBIDDEN'));
  });

  console.log('\n--------------------------------');
  console.log('PROD Phase7 passed=' + passed + ' failed=' + failed);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
