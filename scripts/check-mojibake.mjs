// Fails when added lines carry mojibake: UTF-8 text read as Windows-1252 and
// saved again, so a middle dot becomes U+00C2 U+00B7 and an em dash becomes
// U+00E2 U+20AC U+201D. Binary files are skipped (git prints no lines for them).
// Usage: node scripts/check-mojibake.mjs            staged changes (the pre-commit hook)
//        node scripts/check-mojibake.mjs origin/main changes since a base ref (verify-lane)
import { execFileSync } from 'node:child_process';

// Escapes, so this file does not match itself.
const MOJIBAKE = /\u00C2|\u00E2\u20AC/;
// Files that name the pattern on purpose.
const ALLOWED = new Set(['docs/plans/build-plans-index.ps1']);

const base = process.argv[2];
const range = base ? [base] : ['--cached'];
const diff = execFileSync('git', ['diff', ...range, '--no-color', '--no-ext-diff', '-U0', '--diff-filter=ACMR'], {
  encoding: 'utf8',
  maxBuffer: 256 * 1024 * 1024,
});

const problems = [];
let file = '';
let line = 0;
for (const text of diff.split('\n')) {
  if (text.startsWith('+++ ')) {
    file = text.replace(/^\+\+\+ (b\/)?/, '');
    continue;
  }
  const hunk = /^@@ -\S+ \+(\d+)/.exec(text);
  if (hunk) {
    line = Number(hunk[1]);
    continue;
  }
  if (!text.startsWith('+')) continue;
  if (MOJIBAKE.test(text) && !ALLOWED.has(file)) problems.push(`${file}:${line}  ${text.slice(1).trim().slice(0, 120)}`);
  line++;
}

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} line(s) with mojibake. Re-save the file as UTF-8 and replace the broken characters.`);
  process.exit(1);
}
console.log('check:mojibake ok');
