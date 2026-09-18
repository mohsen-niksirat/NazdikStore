/**
 * NazdikStore — embedded Postgres + Nest bootstrap (no Docker).
 * Starts PG on 5433, applies migrations, launches Nest API on 4000.
 */
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const NESTPG = path.join(REPO, '.nestpg');
const PG_BIN = path.join(
  NESTPG,
  'node_modules',
  '@embedded-postgres',
  'windows-x64',
  'native',
  'bin',
);
const DATA = path.join(NESTPG, 'pgdata');
const LOG = path.join(NESTPG, 'nest-pg.log');
const PORT = process.env.PG_PORT || '5433';
const DB_URL = `postgresql://nazdik@127.0.0.1:${PORT}/nazdik?schema=public`;

function psql(args) {
  const psqlBin = path.join(PG_BIN, 'psql.exe');
  return execSync(`"${psqlBin}" -h 127.0.0.1 -p ${PORT} -U nazdik ${args}`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function ensureInit() {
  const initdb = path.join(PG_BIN, 'initdb.exe');
  if (!fs.existsSync(path.join(DATA, 'PG_VERSION'))) {
    console.log('initdb…');
    execSync(`"${initdb}" -D "${DATA}" -U nazdik --auth=trust -E UTF8`, { stdio: 'inherit' });
  }
}

function startPostgres() {
  const pgctl = path.join(PG_BIN, 'pg_ctl.exe');
  const opts = [
    '-p',
    PORT,
    '-c',
    'listen_addresses=127.0.0.1',
    '-c',
    'shared_buffers=16MB',
    '-c',
    'max_connections=20',
    '-c',
    'fsync=off',
    '-c',
    'autovacuum=off',
    '-c',
    'wal_level=minimal',
  ].join(' ');
  try {
    execSync(`"${pgctl}" -D "${DATA}" stop -m immediate`, { stdio: 'ignore' });
  } catch {
    /* not running */
  }
  console.log('starting postgres on', PORT);
  execSync(`"${pgctl}" -D "${DATA}" -l "${LOG}" -o "${opts}" start`, { stdio: 'inherit' });
}

function applyMigrations() {
  const migDir = path.join(REPO, 'apps', 'api', 'prisma', 'migrations');
  const folders = fs
    .readdirSync(migDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  try {
    psql('-d postgres -c "CREATE DATABASE nazdik;"');
  } catch {
    /* exists */
  }
  for (const folder of folders) {
    const file = path.join(migDir, folder, 'migration.sql');
    if (!fs.existsSync(file)) continue;
    console.log('apply', folder);
    try {
      execSync(`"${path.join(PG_BIN, 'psql.exe')}" -h 127.0.0.1 -p ${PORT} -U nazdik -d nazdik -v ON_ERROR_STOP=0 -f "${file}"`, {
        stdio: 'inherit',
      });
    } catch (e) {
      console.warn('migration warn', folder, e.message.slice(0, 200));
    }
  }
  try {
    console.log(psql('-d nazdik -t -c "\\dt"'));
  } catch {
    /* ignore */
  }
}

function writeEnv() {
  const envPath = path.join(REPO, 'apps', 'api', '.env');
  const lines = [
    `DATABASE_URL="${DB_URL}"`,
    'REDIS_URL=""',
    'JWT_ACCESS_SECRET="nest_pg_dev_secret"',
    'JWT_ACCESS_TTL="15m"',
    'SMS_PROVIDER="console"',
    'PAYMENT_PROVIDER="mock"',
    'PLATFORM_COMMISSION_BPS="1000"',
    'ALLOW_DEV_LOGIN="1"',
    'ALLOW_OFFLINE="1"',
    'PORT="4100"',
    'CORS_ORIGINS="http://127.0.0.1:3000,http://127.0.0.1:3300,http://127.0.0.1:5000,http://localhost:5000"',
  ];
  fs.writeFileSync(envPath, lines.join('\n') + '\n');
  console.log('wrote', envPath);
}

function startNest() {
  const api = path.join(REPO, 'apps', 'api');
  // Prefer compiled dist if present, else ts-node-less bootstrap via existing main
  const mainTs = path.join(api, 'src', 'main.ts');
  const tsNode = path.join(api, 'node_modules', 'ts-node', 'dist', 'bin.js');
  const nestCli = path.join(api, 'node_modules', '@nestjs', 'cli', 'bin', 'nest.js');

  const env = {
    ...process.env,
    DATABASE_URL: DB_URL,
    PORT: '4100',
    REDIS_URL: '',
    ALLOW_OFFLINE: '1',
    NODE_PATH: [path.join(api, 'node_modules'), path.join(REPO, 'node_modules')].join(';'),
  };

  if (fs.existsSync(nestCli)) {
    console.log('launch Nest CLI…');
    const child = spawn(process.execPath, [nestCli, 'start'], {
      cwd: api,
      env,
      stdio: 'inherit',
    });
    return child;
  }
  if (fs.existsSync(tsNode)) {
    console.log('launch ts-node main.ts…');
    return spawn(process.execPath, [tsNode, mainTs], { cwd: api, env, stdio: 'inherit' });
  }
  console.error('Nest CLI / ts-node missing — install @nestjs/cli or ts-node in apps/api');
  return null;
}

function main() {
  ensureInit();
  startPostgres();
  applyMigrations();
  writeEnv();
  const nest = startNest();
  console.log('\n=== Nazdik Nest+Postgres ===');
  console.log('Postgres:', DB_URL);
  console.log('Nest API: http://127.0.0.1:4100/api/v1/health');
  console.log('Docs:     http://127.0.0.1:4100/api/docs (if swagger enabled)');
  if (nest) {
    nest.on('exit', (code) => process.exit(code || 0));
  }
}

main();
