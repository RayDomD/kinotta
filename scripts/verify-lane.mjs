// The verify gate for a lane's branch: everything in the herdr-dispatch verify
// step except reading the diff, which stays with the reviewer.
// Runs typecheck, unit tests and Playwright in two shards one after the other
// (all 19 e2e servers start for each shard, so splitting halves browser load,
// not server load), checks the diff for mojibake, and lists changed files
// outside the brief's Touch paths. Each step's log is kept. Exits 1 on any failure.
// Usage, from the lane's worktree:
//   node scripts/verify-lane.mjs [--brief <path>] [--base origin/main] [--force]
// --force runs Playwright even when free memory is below the floor.
import { spawnSync, execFileSync } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import { freemem } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIN_FREE_GB = 3;
const SHARDS = 2;
const WORKERS = 2;
const GB = 1024 ** 3;
// Length of an ISO timestamp up to the seconds, used as the log folder name.
const STAMP_CHARS = 19;

const args = process.argv.slice(2);
const option = (name) => {
  const at = args.indexOf(name);
  if (at === -1) return undefined;
  const value = args[at + 1];
  if (value === undefined || value.startsWith('--')) {
    console.error(`verify-lane: ${name} needs a value`);
    process.exit(1);
  }
  return value;
};
const brief = option('--brief');
const base = option('--base') ?? 'origin/main';
const force = args.includes('--force');

const root = process.cwd();
const git = (...gitArgs) => execFileSync('git', ['-c', 'core.quotepath=false', ...gitArgs], { encoding: 'utf8' }).trim();
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, STAMP_CHARS);
const logDir = join(root, 'tests/artifacts/verify-lane', stamp);
mkdirSync(logDir, { recursive: true });

const results = [];
function run(name, command) {
  const log = join(logDir, `${name}.log`);
  const fd = openSync(log, 'w');
  const started = Date.now();
  const { status } = spawnSync(command, { shell: true, stdio: ['ignore', fd, fd] });
  closeSync(fd);
  const ok = status === 0;
  results.push({ name, ok, note: `${Math.round((Date.now() - started) / 1000)}s, ${log}` });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} (${results.at(-1).note})`);
}

// Below the floor, a Playwright run risks being killed and losing its evidence.
function memoryOk(step) {
  const free = freemem() / GB;
  console.log(`free memory before ${step}: ${free.toFixed(1)} GB`);
  if (free >= MIN_FREE_GB) return true;
  if (force) {
    console.log(`warning: below ${MIN_FREE_GB} GB, running anyway (--force)`);
    return true;
  }
  results.push({ name: step, ok: false, note: `skipped: ${free.toFixed(1)} GB free, floor ${MIN_FREE_GB} GB; rerun with --force to run anyway` });
  console.log(`FAIL ${step} (${results.at(-1).note})`);
  return false;
}

// Diff from the merge base, so commits that landed on base since the branch started do not show up.
const mergeBase = git('merge-base', base, 'HEAD');

run('typecheck', 'npm run typecheck');
run('unit', 'npm test');
for (let shard = 1; shard <= SHARDS; shard++) {
  const step = `e2e-${shard}-of-${SHARDS}`;
  if (memoryOk(step)) run(step, `npx playwright test --shard=${shard}/${SHARDS} --workers=${WORKERS}`);
}

const checkMojibake = join(dirname(fileURLToPath(import.meta.url)), 'check-mojibake.mjs');
run('mojibake', `node "${checkMojibake}" ${mergeBase}`);

if (brief) {
  // The lane keeps its own brief's Status current, so the brief is always in scope.
  const paths = touchPaths(readFileSync(brief, 'utf8'));
  const touch = [...paths, relative(root, resolve(brief)).split(sep).join('/')];
  const changed = [
    ...git('diff', '--name-only', mergeBase).split('\n'),
    ...git('ls-files', '--others', '--exclude-standard').split('\n'),
  ].filter(Boolean);
  const outside = [...new Set(changed)].filter((file) => !touch.some((path) => covers(path, file)));
  // An unreadable Touch line would report every file as outside it, so say so instead.
  const note = !paths.length ? `no Touch paths found in ${brief}; expected a "- Touch:" line with paths in backticks`
    : outside.length ? `outside Touch: ${outside.join(', ')}` : `${changed.length} changed file(s), all inside Touch`;
  results.push({ name: 'scope', ok: paths.length > 0 && outside.length === 0, note });
  console.log(`${results.at(-1).ok ? 'ok  ' : 'FAIL'} scope (${note})`);
}

// The brief's "- Touch:" line and the sub-bullets under it, paths in backticks
// (or comma-separated when none are quoted).
function touchPaths(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /^\s*-\s*Touch:/i.test(line));
  if (start === -1) return [];
  const block = [lines[start]];
  for (const line of lines.slice(start + 1)) {
    if (!/^\s{2,}-\s/.test(line)) break;
    block.push(line);
  }
  return block.flatMap((line) => {
    const body = line.replace(/^\s*-\s*(Touch:)?/i, '');
    const quoted = [...body.matchAll(/`([^`]+)`/g)].map(([, path]) => path);
    return quoted.length ? quoted : body.split(',').map((part) => part.trim()).filter(Boolean);
  });
}

// A Touch path covers a file when it names it, a folder above it, or matches it as a glob.
function covers(path, file) {
  const clean = path.replace(/^\.\//, '').replace(/\/$/, '');
  if (clean.includes('*')) {
    const pattern = clean.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\0').replace(/\*/g, '[^/]*').replace(/\0/g, '.*');
    return new RegExp(`^${pattern}$`).test(file);
  }
  return file === clean || file.startsWith(`${clean}/`);
}

const failed = results.filter((result) => !result.ok);
console.log(`\nlogs: ${logDir}`);
if (failed.length) {
  console.error(`verify-lane: ${failed.length} failed: ${failed.map((result) => result.name).join(', ')}`);
  process.exit(1);
}
console.log('verify-lane ok');
