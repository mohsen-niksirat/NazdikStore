/**
 * Ensure TCP port is free before starting mini-server (Windows-friendly).
 * Usage: node scripts/free-port.cjs 4000
 */
const { execSync } = require('child_process');

const port = process.argv[2] || '4000';
try {
  const out = execSync(`netstat -ano | findstr ":${port}" | findstr LISTENING`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const pids = new Set();
  for (const line of out.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    const pid = Number(parts[parts.length - 1]);
    if (Number.isFinite(pid) && pid > 0) pids.add(pid);
  }
  for (const pid of pids) {
    try {
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
      console.log(`freed port ${port} (killed pid ${pid})`);
    } catch {
      /* ignore */
    }
  }
  if (!pids.size) console.log(`port ${port} already free`);
} catch {
  console.log(`port ${port} already free`);
}
