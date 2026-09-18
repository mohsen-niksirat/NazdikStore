const path = require('path');
const fs = require('fs');

const testDir = path.join(__dirname, '..', 'apps', 'api', 'test');
const boot = `const path = require('path');
const fs = require('fs');
const Module = require('module');
const { installResolveHook, installTsHook } = require('./dep-paths.cjs');

const ROOT = path.resolve(__dirname, '..');
const SHARED_SRC = path.join(ROOT, '..', '..', 'packages', 'shared', 'src');
const API_SRC = path.join(ROOT, 'src');
installResolveHook({ root: ROOT, sharedSrc: SHARED_SRC, apiSrc: API_SRC });
const ts = installTsHook();

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test_access_secret';
process.env.REDIS_URL = process.env.REDIS_URL || '';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

function compileTs(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
    },
    fileName: filePath,
  }).outputText;
}
Module._extensions['.ts'] = function (mod, filename) {
  mod._compile(compileTs(filename), filename);
};

`;

const files = ['run-phase2.cjs', 'run-phase3.cjs', 'run-phase4.cjs', 'run-phase5.cjs', 'run-prod-guards.cjs', 'run-phase6.cjs', 'run-phase9.cjs'];

for (const f of files) {
  const p = path.join(testDir, f);
  if (!fs.existsSync(p)) continue;
  let text = fs.readFileSync(p, 'utf8');
  // cut everything before first results = or describe/main
  const markers = [
    "const results =",
    "let passed = 0",
    "async function main",
    "const BASE",
    "/**\n * Phase",
  ];
  let idx = -1;
  for (const m of markers) {
    const i = text.indexOf(m);
    if (i > 0) {
      idx = i;
      break;
    }
  }
  if (idx < 0) {
    console.log('skip no marker', f);
    continue;
  }
  // keep original file header comment if present
  let headerComment = '';
  if (text.startsWith('/**')) {
    const end = text.indexOf('*/');
    if (end > 0) headerComment = text.slice(0, end + 2) + '\n\n';
  }
  const rest = text.slice(idx);
  // if rest still has broken Module._resolveFilename leftovers before results, ok
  const next = headerComment + boot + rest;
  fs.writeFileSync(p, next);
  console.log('rewrote header', f);
}

console.log('done');
