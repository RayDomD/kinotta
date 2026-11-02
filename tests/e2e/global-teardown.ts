import { spawn } from 'node:child_process';

// Plain Node in a separate process: Playwright force-kills its webServers only
// after global teardown, so the reaper must outlive the runner and its workers.
const REAPER = String.raw`
const { existsSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { dirname, resolve, basename } = require('node:path');
const [rootArg, pidArg] = process.argv.slice(1);
const root = resolve(rootArg);
const pid = Number(pidArg);
if (!Number.isInteger(pid) || pid <= 0 || pid > 0xffffffff ||
    dirname(root) !== resolve(tmpdir()) ||
    !new RegExp('^kinotta-e2e-run-' + pid + '-[0-9]+$').test(basename(root))) process.exit(1);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function alive() {
  try { process.kill(pid, 0); return true; }
  catch (error) {
    if (error.code === 'ESRCH') return false;
    if (error.code === 'EPERM') return true;
    throw error;
  }
}
(async () => {
  while (alive()) await sleep(200);
  const deadline = Date.now() + 60_000;
  do {
    try {
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      if (!existsSync(root)) return;
    } catch (error) {
      if (error.code === 'ENOENT') return;
    }
    await sleep(200);
  } while (Date.now() < deadline);
})().catch(() => process.exitCode = 1);
`;

export default function teardown() {
  const root = process.env.KINOTTA_E2E_ROOT;
  const pid = process.env.KINOTTA_E2E_RUNNER_PID;
  if (!root || !pid) throw new Error('Playwright runner temp root and pid are required for cleanup');
  const reaper = spawn(process.execPath, ['-e', REAPER, root, pid], {
    detached: true,
    windowsHide: true,
    stdio: 'ignore',
  });
  return new Promise<void>((resolve, reject) => {
    reaper.once('error', reject);
    reaper.once('spawn', () => { reaper.unref(); resolve(); });
  });
}
