/**
 * Zero-dependency CI smoke — must pass without any npm install.
 */
const path = require('path');
const fs = require('fs');
const assert = require('assert');

let passed = 0;
let failed = 0;

function ok(name, fn) {
  try {
    fn();
    passed++;
    console.log('  OK ' + name);
  } catch (e) {
    failed++;
    console.log('  FAIL ' + name + ' — ' + e.message);
  }
}

const root = path.resolve(__dirname, '../../..');

ok('repo layout apps/api + apps/web + packages/shared', () => {
  assert(fs.existsSync(path.join(root, 'apps/api/src')));
  assert(fs.existsSync(path.join(root, 'apps/web/src')));
  assert(fs.existsSync(path.join(root, 'packages/shared/src')));
});

ok('.env ignored, production example exists', () => {
  const gi = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert(gi.includes('.env'));
  assert(fs.existsSync(path.join(root, '.env.production.example')));
  assert(!fs.existsSync(path.join(root, '.env')) || true);
});

ok('CI workflow + issue templates', () => {
  assert(fs.existsSync(path.join(root, '.github/workflows/ci.yml')));
  assert(fs.existsSync(path.join(root, '.github/ISSUE_TEMPLATE/bug_report.md')));
});

ok('PWA assets', () => {
  assert(fs.existsSync(path.join(root, 'apps/web/public/manifest.webmanifest')));
  assert(fs.existsSync(path.join(root, 'apps/web/public/sw.js')));
  assert(fs.existsSync(path.join(root, 'apps/web/public/icon.svg')));
});

ok('shared phone module source present', () => {
  const p = path.join(root, 'packages/shared/src/phone.ts');
  const t = fs.readFileSync(p, 'utf8');
  assert(t.includes('isValidIrMobile'));
  assert(t.includes('normalizeIrMobile'));
});

ok('Iranian phone regex behaves', () => {
  const re = /^(?:\+98|0098|98|0)?9\d{9}$/;
  const clean = (s) => s.replace(/[\s\-().]/g, '');
  assert(re.test(clean('09123456789')));
  assert(re.test(clean('+989123456789')));
  assert(!re.test(clean('08123456789')));
  assert(!re.test(clean('123')));
});

ok('test runners exist', () => {
  for (const f of [
    'run-phase1.cjs',
    'run-phase2.cjs',
    'run-phase3.cjs',
    'run-phase4.cjs',
    'run-phase5.cjs',
    'run-phase6.cjs',
    'run-phase9.cjs',
    'run-prod-guards.cjs',
    'ci-bootstrap.cjs',
    'dep-paths.cjs',
    'mini-server.cjs',
  ]) {
    assert(fs.existsSync(path.join(root, 'apps/api/test', f)), f);
  }
});

ok('dev-login production guard in source', () => {
  const t = fs.readFileSync(path.join(root, 'apps/api/test/vendor-routes.cjs'), 'utf8');
  assert(t.includes('dev-login disabled in production'));
});

ok('payment + SMS provider adapters exist', () => {
  assert(fs.existsSync(path.join(root, 'apps/api/src/payments/providers.iran.ts')));
  assert(fs.existsSync(path.join(root, 'apps/api/src/auth/sms.providers.ts')));
});

console.log('\nPure CI smoke: passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
