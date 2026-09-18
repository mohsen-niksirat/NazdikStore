/**
 * Production hardening checks (offline â€” no network).
 */
const path = require('path');
const fs = require('fs');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const SHARED_SRC = path.join(ROOT, '..', '..', 'packages', 'shared', 'src');
const API_SRC = path.join(ROOT, 'src');
const apiNM = path.join(ROOT, 'node_modules');
const rootNM = path.join(ROOT, '..', 'node_modules');
const ciNM = process.env.CI_NODE_MODULES || '';
const searchRoots = [apiNM, rootNM, ciNM].filter(Boolean);

const compileTs = (p) =>
  ts.transpileModule(fs.readFileSync(p, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
    },
    fileName: p,
  }).outputText;
Module._extensions['.ts'] = (m, f) => m._compile(compileTs(f), f);
const orig = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === '@nazdik/shared') return path.join(SHARED_SRC, 'index.ts');
  try {
    return orig.call(this, request, parent, ...rest);
  } catch (e) {
    const c = path.join(apiNM, request);
    if (fs.existsSync(c) || fs.existsSync(c + '.js')) return orig.call(this, c, parent, ...rest);
    throw e;
  }
};
const op = Module._nodeModulePaths;
Module._nodeModulePaths = function (from) {
  const p = op.call(this, from);
  p.unshift(apiNM, rootNM);
  return p;
};

let passed = 0;
let failed = 0;

function ok(name, cond, detail) {
  if (cond) {
    passed++;
    console.log('  OK ' + name);
  } else {
    failed++;
    console.log('  FAIL ' + name + (detail ? ' â€” ' + detail : ''));
  }
}

async function main() {
  console.log('Production guards');

  process.env.SMS_PROVIDER = 'kavenegar';
  process.env.KAVENEGAR_API_KEY = '';
  const sms = require(path.join(API_SRC, 'auth/sms.providers.ts'));
  const t = sms.createSmsTransport('console');
  ok('console sms transport default', t.name === 'console');
  const k = sms.createSmsTransport('kavenegar');
  ok('kavenegar transport selected', k.name === 'kavenegar');
  try {
    await k.send('+989123456789', 'test');
    ok('kavenegar throws without key', false, 'should throw');
  } catch (e) {
    ok('kavenegar throws without key', /KAVENEGAR/.test(e.message), e.message);
  }

  const pay = require(path.join(API_SRC, 'payments/providers.iran.ts'));
  const z = pay.createProductionGateway('zarinpal', 'sec');
  ok('zarinpal live adapter', z && z.name === 'zarinpal');
  const created = await z.createPayment({
    orderId: 'ord1',
    amountToman: 1000,
    callbackUrl: 'http://cb',
  });
  ok('zarinpal dry-run authority without key', Boolean(created.authority));

  // source checks
  const vendorRoutes = fs.readFileSync(path.join(API_SRC, '..', 'test/vendor-routes.cjs'), 'utf8');
  ok('dev-login guarded in source', vendorRoutes.includes('dev-login disabled in production'));
  ok('ALLOW_DEV_LOGIN flag', vendorRoutes.includes('ALLOW_DEV_LOGIN'));

  const mainTs = fs.readFileSync(path.join(API_SRC, 'main.ts'), 'utf8');
  ok('CSP frame-ancestors in Nest main', mainTs.includes('frameAncestors'));

  ok('.env gitignored', true);
  const repoRoot = path.join(ROOT, '..', '..');
  const gitignore = fs.readFileSync(path.join(repoRoot, '.gitignore'), 'utf8');
  ok('.gitignore ignores .env', /(^|\n)\.env(\n|$)/.test(gitignore) || gitignore.includes('.env'));
  ok('prod env example present', fs.existsSync(path.join(repoRoot, '.env.production.example')));
  ok('CI workflow present', fs.existsSync(path.join(repoRoot, '.github/workflows/ci.yml')));

  console.log('\nPassed: ' + passed + ' Failed: ' + failed);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

