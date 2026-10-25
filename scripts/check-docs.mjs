// Fails when a plan or brief names a docs/ file that does not exist.
// Known misses are listed in scripts/check-docs-known.txt (one "file: path" per
// line, "#" starts a comment); anything not listed fails.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = process.cwd();
const DOC_PATH = /`(docs\/[A-Za-z0-9_./-]+\.(?:md|html|png|json))`/g;

function files(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return path.endsWith('.md') ? [path] : [];
  });
}

const knownFile = join(root, 'scripts/check-docs-known.txt');
const known = new Set(
  existsSync(knownFile)
    ? readFileSync(knownFile, 'utf8').split('\n').map((line) => line.replace(/#.*/, '').trim()).filter(Boolean)
    : [],
);
const problems = [];

for (const file of [...files(join(root, 'docs/plans')), ...files(join(root, 'docs/briefs'))]) {
  const name = relative(root, file).split(sep).join('/');
  for (const [, path] of readFileSync(file, 'utf8').matchAll(DOC_PATH)) {
    if (path.includes('*') || path.includes('<')) continue;
    if (!existsSync(join(root, path)) && !known.has(`${name}: ${path}`)) problems.push(`${name}: ${path}`);
  }
}

if (problems.length) {
  console.error(problems.map((line) => `missing  ${line}`).join('\n'));
  console.error(`\n${problems.length} missing doc path(s). Fix the reference, or list it in scripts/check-docs-known.txt with a reason.`);
  process.exit(1);
}
console.log('check:docs ok');
