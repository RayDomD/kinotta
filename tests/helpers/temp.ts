import { lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

export const RUN_ROOT_ENV = 'KINOTTA_TEST_RUN_ROOT';
const STALE_MS = 6 * 60 * 60 * 1000;
const REMOVE_OPTIONS = { recursive: true, force: true, maxRetries: 5, retryDelay: 200 };
let lastEpoch = 0;

export function createRunRoot(): string {
  lastEpoch = Math.max(Date.now(), lastEpoch + 1);
  const root = join(tmpdir(), `kinotta-test-run-${process.pid}-${lastEpoch}`);
  mkdirSync(root);
  return root;
}

// lstat never follows a link or junction; a link counts by its own mtime and is not entered.
function newestMtime(path: string): number {
  const stat = lstatSync(path);
  let newest = stat.mtimeMs;
  if (stat.isDirectory()) {
    for (const name of readdirSync(path)) newest = Math.max(newest, newestMtime(join(path, name)));
  }
  return newest;
}

// A failed Windows removal is left for the next stale sweep.
export function removeTempRoot(root: string): void {
  const absolute = resolve(root);
  if (resolve(join(absolute, '..')) !== resolve(tmpdir()) || !/^kinotta-(?:test-run-|e2e-)/.test(absolute.split(sep).at(-1)!)) {
    throw new Error(`Refusing to remove unexpected temp root: ${root}`);
  }
  try {
    // rmSync removes a link or junction itself and never follows it into its target.
    rmSync(absolute, REMOVE_OPTIONS);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn(`Could not remove temp root ${root}: ${(error as NodeJS.ErrnoException).code}`);
  }
}

function processIsAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0 || pid > 0xffffffff) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // Access denied is not evidence that another lane's process exited.
    if ((error as NodeJS.ErrnoException).code === 'EPERM') return true;
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
    throw error;
  }
}

export function sweepStaleTempRoots(): void {
  const cutoff = Date.now() - STALE_MS;
  for (const name of readdirSync(tmpdir())) {
    if (!name.startsWith('kinotta-test-run-') && !name.startsWith('kinotta-e2e-')) continue;
    const root = join(tmpdir(), name);
    try {
      const newest = newestMtime(root);
      const run = /^kinotta-(?:test|e2e)-run-(\d+)-(\d+)$/.exec(name);
      const deadRunner = run !== null && !processIsAlive(Number(run[1]));
      if (deadRunner || newest < cutoff) removeTempRoot(root);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn(`Could not inspect temp root ${root}: ${(error as NodeJS.ErrnoException).code}`);
    }
  }
}

let fallbackRoot: string | undefined;
export function tempDir(prefix: string): string {
  if (!prefix || prefix.includes('/') || prefix.includes('\\')) throw new Error(`Invalid temp prefix: ${prefix}`);
  let root = process.env[RUN_ROOT_ENV];
  if (!root) {
    if (!fallbackRoot) {
      fallbackRoot = createRunRoot();
      const ownedRoot = fallbackRoot;
      process.once('exit', () => removeTempRoot(ownedRoot));
    }
    root = fallbackRoot;
  }
  return mkdtempSync(join(root, prefix));
}
