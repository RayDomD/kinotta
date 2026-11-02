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
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { freemem, tmpdir } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIN_FREE_GB = 3;
const SHARDS = 2;
const WORKERS = 2;
const GB = 1024 ** 3;
const E2E_REAPER_GRACE_MS = 30_000;
const TEMP_POLL_MS = 250;
const MAX_LEAK_NAMES = 10;
// Length of an ISO timestamp up to the seconds, used as the log folder name.
const STAMP_CHARS = 19;

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage, from the lane\'s worktree:');
  console.log('  node scripts/verify-lane.mjs [--brief <path>] [--base origin/main] [--force] [--unit-only] [-- <vitest args>]');
  console.log('--force runs Playwright even when free memory is below the floor.');
  console.log('--unit-only skips Playwright. Arguments after -- go to vitest, for example a single test file.');
  console.log('Failing unit tests are matched by file and exact name against scripts/known-test-failures.txt.');
  process.exit(0);
}
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
const unitOnly = args.includes('--unit-only');
const dashDash = args.indexOf('--');
const extraTestArgs = dashDash !== -1 ? ' ' + args.slice(dashDash + 1).join(' ') : '';

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
function loadKnownFailures(file) {
  if (!existsSync(file)) return [];
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  const entries = [];
  for (const raw of lines) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const parts = line.split('|').map((part) => part.trim());
    if (parts.length >= 2) {
      entries.push({
        file: parts[0].replace(/^\.\//, '').split('\\').join('/'),
        name: parts[1],
        issue: parts[2] ?? '',
        raw,
      });
    }
  }
  return entries;
}

function matchesFailure(item, entry) {
  const normItemFile = item.file.replace(/^\.\//, '').split('\\').join('/');
  const normEntryFile = entry.file.replace(/^\.\//, '').split('\\').join('/');
  const fileMatch = normItemFile === normEntryFile || normItemFile.endsWith(`/${normEntryFile}`);
  const nameMatch = entry.name === item.name || entry.name === item.title || entry.name === item.fullName;
  return fileMatch && nameMatch;
}

function runUnit() {
  const name = 'unit';
  const log = join(logDir, `${name}.log`);
  const unitJson = join(logDir, `${name}.json`).split(sep).join('/');
  const fd = openSync(log, 'w');
  const started = Date.now();
  const command = `npm test --${extraTestArgs} --reporter=default --reporter=json --outputFile.json="${unitJson}"`;
  const { status } = spawnSync(command, { shell: true, stdio: ['ignore', fd, fd] });
  closeSync(fd);

  const knownFile = join(root, 'scripts/known-test-failures.txt');
  const knownEntries = loadKnownFailures(knownFile);

  const failingTests = [];
  const passingTests = [];
  // A file that failed without any failed test (it did not load, or crashed) is never explained by the allowlist.
  const brokenFiles = [];

  if (existsSync(unitJson)) {
    try {
      const report = JSON.parse(readFileSync(unitJson, 'utf8'));
      for (const testFile of report.testResults ?? []) {
        const relFile = relative(root, testFile.name).split(sep).join('/');
        if (testFile.status === 'failed' && !(testFile.assertionResults ?? []).some((assertion) => assertion.status === 'failed')) brokenFiles.push(relFile);
        for (const assertion of testFile.assertionResults ?? []) {
          const testName = assertion.fullName || assertion.title;
          const info = { file: relFile, name: testName, title: assertion.title, fullName: assertion.fullName };
          if (assertion.status === 'failed') {
            failingTests.push(info);
          } else if (assertion.status === 'passed') {
            passingTests.push(info);
          }
        }
      }
    } catch (err) {
      console.error(`warning: could not parse vitest JSON report: ${err.message}`);
    }
  }

  for (const entry of knownEntries) {
    const passed = passingTests.some((test) => matchesFailure(test, entry));
    if (passed) {
      console.log(`can be removed: ${entry.file} | ${entry.name}`);
    }
  }

  const unexpectedFailures = [];
  for (const failure of failingTests) {
    const isKnown = knownEntries.some((entry) => matchesFailure(failure, entry));
    if (!isKnown) {
      unexpectedFailures.push(failure);
      console.log(`failing test: ${failure.file} | ${failure.name}`);
    }
  }

  for (const file of brokenFiles) console.log(`failing file (no test result): ${file}`);
  const ok = status === 0 || (unexpectedFailures.length === 0 && failingTests.length > 0 && brokenFiles.length === 0);
  const duration = Math.round((Date.now() - started) / 1000);
  let note = `${duration}s, ${log}`;
  if (failingTests.length > 0 && unexpectedFailures.length === 0) {
    note += ` (${failingTests.length} known failure(s) allowlisted)`;
  } else if (unexpectedFailures.length > 0) {
    note += ` (${unexpectedFailures.length} unexpected failure(s))`;
  }

  results.push({ name, ok, note });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} (${results.at(-1).note})`);
}

function tempSnapshot(phase) {
  // A failed listing or evidence write must fail temp-leaks, never look empty.
  const entries = new Set(readdirSync(tmpdir()).filter((name) => name.startsWith('kinotta-')));
  writeFileSync(join(logDir, `temp-leaks-${phase}.json`), JSON.stringify([...entries].sort(), null, 2));
  return entries;
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0 || pid > 0xffffffff) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'EPERM') return true;
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}

// Another lane's concurrent run (unit or e2e) owns a root whose embedded pid is alive.
function liveRunRoot(name) {
  const match = /^kinotta-(?:test|e2e)-run-(\d+)-(\d+)$/.exec(name);
  return match !== null && processIsAlive(Number(match[1]));
}

function deadE2eRoot(name) {
  const match = /^kinotta-e2e-run-(\d+)-(\d+)$/.exec(name);
  return match !== null && !processIsAlive(Number(match[1]));
}

async function checkTempLeaks(before, beforeError) {
  let ok = false;
  let note;
  try {
    let after = tempSnapshot('after');
    if (beforeError) throw new Error(`before listing failed: ${beforeError.message}`);
    let added = [...after].filter((name) => !before.has(name) && !liveRunRoot(name));
    const deadline = Date.now() + E2E_REAPER_GRACE_MS;
    if (added.some(deadE2eRoot)) {
      console.log('temp-leaks: waiting up to 30s for dead-runner e2e roots to be reaped');
      do {
        await sleep(Math.min(TEMP_POLL_MS, Math.max(0, deadline - Date.now())));
        after = new Set(readdirSync(tmpdir()).filter((name) => name.startsWith('kinotta-')));
        added = [...after].filter((name) => !before.has(name) && !liveRunRoot(name));
      } while (added.some(deadE2eRoot) && Date.now() < deadline);
      writeFileSync(join(logDir, 'temp-leaks-after.json'), JSON.stringify([...after].sort(), null, 2));
    }
    added.sort();
    const counts = new Map();
    for (const name of added) {
      const prefix = name.match(/^kinotta-(?:test|e2e)-run-/)?.[0] ?? name.slice(0, name.lastIndexOf('-') + 1);
      counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
    }
    const prefixes = [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([prefix, count]) => `${prefix}: ${count}`).join(', ');
    ok = added.length === 0;
    note = ok ? `${before.size} before, ${after.size} after; no new temp entries`
      : `${added.length} new temp entries; prefixes: ${prefixes}; names: ${added.slice(0, MAX_LEAK_NAMES).join(', ')}`;
    writeFileSync(join(logDir, 'temp-leaks.log'), note + '\n');
  } catch (error) {
    ok = false;
    note = `cannot verify temp entries in ${tmpdir()}: ${error.message}`;
  }
  results.push({ name: 'temp-leaks', ok, note });
  console.log(`${ok ? 'ok  ' : 'FAIL'} temp-leaks (${note})`);
}

const mergeBase = git('merge-base', base, 'HEAD');
let tempBefore;
let tempBeforeError;
try { tempBefore = tempSnapshot('before'); }
catch (error) { tempBeforeError = error; }

run('typecheck', 'npm run typecheck');
runUnit();
if (!unitOnly) for (let shard = 1; shard <= SHARDS; shard++) {
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

await checkTempLeaks(tempBefore, tempBeforeError);

const failed = results.filter((result) => !result.ok);
console.log(`\nlogs: ${logDir}`);
if (failed.length) {
  console.error(`verify-lane: ${failed.length} failed: ${failed.map((result) => result.name).join(', ')}`);
  process.exit(1);
}
console.log('verify-lane ok');
