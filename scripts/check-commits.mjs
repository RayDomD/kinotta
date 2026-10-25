// Fails when a commit between <base> and HEAD does not start with a
// Conventional Commit prefix, or carries AI attribution (a Claude author or
// committer, a Co-Authored-By trailer with Claude's email, or a Claude-Session
// trailer). The global commit-msg hook
// only runs locally; this catches commits made elsewhere, such as cloud sessions.
// Usage: node scripts/check-commits.mjs origin/main
import { execFileSync } from 'node:child_process';

const base = process.argv[2];
if (!base) {
  console.error('Usage: node scripts/check-commits.mjs <base-ref>');
  process.exit(2);
}

const PREFIX = /^(feat|fix|docs|chore|refactor|test)(\([^)]+\))?!?: \S/;
const AI_EMAIL = 'noreply@anthropic.com';
// Match the email, not the name, so a human co-author named Claude passes.
const AI_TRAILER = /^\s*co-authored-by:.*<noreply@anthropic\.com>/im;
const SESSION_TRAILER = /^\s*claude-session:/im;
// Unit and record separators keep multi-line bodies intact.
const log = execFileSync('git', ['log', '--no-merges', '--format=%h%x1f%s%x1f%ae%x1f%ce%x1f%b%x1e', `${base}..HEAD`], { encoding: 'utf8' });
const commits = log.split('\x1e').map((record) => record.trim()).filter(Boolean).map((record) => {
  const [hash, subject, author, committer, body] = record.split('\x1f');
  return { hash, subject, author, committer, body };
});

const problems = [];
for (const { hash, subject, author, committer, body } of commits) {
  if (!PREFIX.test(subject)) problems.push(`no prefix       ${hash}  ${subject}`);
  if ([author, committer].some((email) => email.toLowerCase() === AI_EMAIL)) problems.push(`AI author       ${hash}  ${subject}`);
  if (AI_TRAILER.test(body) || SESSION_TRAILER.test(body)) problems.push(`AI attribution  ${hash}  ${subject}`);
}

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} problem(s). Subjects need a feat:, fix:, docs:, chore:, refactor: or test: prefix; commits must not be authored by or credit Claude.`);
  process.exit(1);
}
console.log('check:commits ok');
