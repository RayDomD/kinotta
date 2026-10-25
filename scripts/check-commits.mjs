// Fails when a commit between <base> and HEAD does not start with a
// Conventional Commit prefix. Usage: node scripts/check-commits.mjs origin/main
import { execFileSync } from 'node:child_process';

const base = process.argv[2];
if (!base) {
  console.error('Usage: node scripts/check-commits.mjs <base-ref>');
  process.exit(2);
}

const PREFIX = /^(feat|fix|docs|chore|refactor|test)(\([^)]+\))?!?: \S/;
const log = execFileSync('git', ['log', '--no-merges', '--format=%h%x09%s', `${base}..HEAD`], { encoding: 'utf8' });
const bad = log.split('\n').filter(Boolean).filter((line) => !PREFIX.test(line.split('\t')[1] ?? ''));

if (bad.length) {
  console.error(bad.map((line) => `no prefix  ${line.replace('\t', '  ')}`).join('\n'));
  console.error(`\n${bad.length} commit(s) without a feat:, fix:, docs:, chore:, refactor: or test: prefix.`);
  process.exit(1);
}
console.log('check:commits ok');
