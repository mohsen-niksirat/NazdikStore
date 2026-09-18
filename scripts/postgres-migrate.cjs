/**
 * Start embedded Postgres + apply migrations via node-postgres (no psql binary).
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const NESTPG = path.join(REPO, '.nestpg');
const BIN = path.join(NESTPG, 'node_modules', '@embedded-postgres', 'windows-x64', 'native', 'bin');
const DATA = path.join(NESTPG, 'pgdata');
const LOG = path.join(NESTPG, 'nest-pg.log');
const PORT = Number(process.env.PG_PORT || 5433);
const { Client } = require(path.join(NESTPG, 'node_modules', 'pg'));

async function main() {
  if (!fs.existsSync(path.join(DATA, 'PG_VERSION'))) {
    console.log('initdb…');
    execSync(`"${path.join(BIN, 'initdb.exe')}" -D "${DATA}" -U nazdik --auth=trust -E UTF8`, {
      stdio: 'inherit',
    });
  }
  try {
    execSync(`"${path.join(BIN, 'pg_ctl.exe')}" -D "${DATA}" stop -m immediate`, { stdio: 'ignore' });
  } catch { /* ignore */ }

  const opts = `-p ${PORT} -c listen_addresses=127.0.0.1 -c shared_buffers=16MB -c max_connections=20 -c fsync=off -c autovacuum=off`;
  console.log('pg_ctl start…');
  execSync(`"${path.join(BIN, 'pg_ctl.exe')}" -D "${DATA}" -l "${LOG}" -o "${opts}" start`, {
    stdio: 'inherit',
  });
  await new Promise((r) => setTimeout(r, 2000));

  async function q(sql, database = 'postgres') {
    const client = new Client({
      host: '127.0.0.1',
      port: PORT,
      user: 'nazdik',
      database,
    });
    await client.connect();
    try {
      const res = await client.query(sql);
      return res;
    } finally {
      await client.end();
    }
  }

  try {
    await q('CREATE DATABASE nazdik');
  } catch (e) {
    console.log('db exists or', e.message.slice(0, 80));
  }

  const migDir = path.join(REPO, 'apps', 'api', 'prisma', 'migrations');
  const folders = fs
    .readdirSync(migDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  for (const folder of folders) {
    const file = path.join(migDir, folder, 'migration.sql');
    if (!fs.existsSync(file)) continue;
    const sql = fs.readFileSync(file, 'utf8');
    console.log('apply', folder, `(${sql.length} bytes)`);
    const client = new Client({ host: '127.0.0.1', port: PORT, user: 'nazdik', database: 'nazdik' });
    await client.connect();
    try {
      await client.query(sql);
      console.log('  ok');
    } catch (e) {
      console.log('  warn:', e.message.slice(0, 160));
    } finally {
      await client.end();
    }
  }

  const client = new Client({ host: '127.0.0.1', port: PORT, user: 'nazdik', database: 'nazdik' });
  await client.connect();
  const tables = await client.query(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1`,
  );
  console.log('\nTables:', tables.rows.map((r) => r.tablename).join(', '));
  const version = await client.query('SELECT version()');
  console.log(version.rows[0].version);
  await client.end();

  const dbUrl = `postgresql://nazdik@127.0.0.1:${PORT}/nazdik?schema=public`;
  const envPath = path.join(REPO, 'apps', 'api', '.env');
  fs.writeFileSync(
    envPath,
    [
      `DATABASE_URL="${dbUrl}"`,
      'REDIS_URL=""',
      'JWT_ACCESS_SECRET="nest_pg_dev_secret"',
      'JWT_ACCESS_TTL="15m"',
      'SMS_PROVIDER="console"',
      'PAYMENT_PROVIDER="mock"',
      'ALLOW_DEV_LOGIN="1"',
      'ALLOW_OFFLINE="1"',
      'PORT="4100"',
      'CORS_ORIGINS="http://127.0.0.1:5000,http://localhost:5000,http://127.0.0.1:3300"',
    ].join('\n') + '\n',
  );
  console.log('\nDATABASE_URL=' + dbUrl);
  console.log('Postgres ready on port', PORT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
