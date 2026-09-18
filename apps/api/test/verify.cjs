/**
 * One-shot verify: unit suites that need no API + print checklist.
 */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const node = process.execPath;
const testDir = __dirname;

const offline = [
  'ci-pure.cjs',
  'run-phase1.cjs',
  'run-phase2.cjs',
  'run-phase3.cjs',
  'run-phase4.cjs',
  'run-phase5.cjs',
  'run-prod-guards.cjs',
  'run-phase17-18.cjs',
];

const live = [
  'run-debug-buttons.cjs',
  'run-ui-v37.cjs',
  'run-p19.cjs',
  'run-p20.cjs',
  'run-p21-22.cjs',
  'run-phase11.cjs',
  'run-phase12.cjs',
  'run-phase13.cjs',
  'run-phase14.cjs',
  'run-phase15-16.cjs',
  'run-prod-phase6.cjs',
  'run-prod-phase7.cjs',
  'run-prod-phase8.cjs',
];

let failed = 0;
console.log('NazdikStore verify\n');

for (const f of offline) {
  const p = path.join(testDir, f);
  if (!fs.existsSync(p)) {
    console.log('SKIP missing', f);
    continue;
  }
  process.stdout.write(f + ' … ');
  const r = spawnSync(node, [p], { encoding: 'utf8', cwd: path.join(testDir, '..') });
  const ok = r.status === 0;
  console.log(ok ? 'OK' : 'FAIL');
  if (!ok) {
    failed += 1;
    console.log(r.stdout || '');
    console.log(r.stderr || '');
  }
}

console.log('\n— live suites (API :4000) —');
for (const f of live) {
  const p = path.join(testDir, f);
  if (!fs.existsSync(p)) {
    console.log('SKIP missing', f);
    continue;
  }
  process.stdout.write(f + ' … ');
  const r = spawnSync(node, [p], { encoding: 'utf8', cwd: path.join(testDir, '..') });
  const ok = r.status === 0;
  console.log(ok ? 'OK' : 'FAIL');
  if (!ok) {
    failed += 1;
    const tail = (r.stdout || '').split('\n').slice(-6).join('\n');
    console.log(tail);
  }
}

console.log('\n================================');
if (failed) {
  console.log('VERIFY FAILED:', failed);
  process.exit(1);
}
console.log('VERIFY PASSED');
console.log('Next: /orders · /vendors/:id · npm run dev (API 4000)');
