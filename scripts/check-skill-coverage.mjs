// Compare non-blank line occurrences so repeated source text remains accountable.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const [source, skill] = process.argv.slice(2);
if (!source || !skill || process.argv.length !== 4) {
  console.error('Usage: node scripts/check-skill-coverage.mjs <old-SKILL.md> <skill-folder>');
  process.exit(1);
}
const files = [join(skill, 'SKILL.md'), ...readdirSync(join(skill, 'stages'))
  .filter((name) => name.endsWith('.md')).sort().map((name) => join(skill, 'stages', name))];
const occurrences = new Map();
for (const file of files) {
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const matches = occurrences.get(line) ?? [];
    matches.push(relative(skill, file));
    occurrences.set(line, matches);
  }
}
const original = new Map();
readFileSync(source, 'utf8').split(/\r?\n/).forEach((line, index) => {
  if (!line.trim()) return;
  const numbers = original.get(line) ?? [];
  numbers.push(index + 1);
  original.set(line, numbers);
});
const problems = [];
for (const [line, numbers] of original) {
  const matches = occurrences.get(line) ?? [];
  if (matches.length !== numbers.length) {
    problems.push(`${numbers.join(', ')}: expected ${numbers.length}, found ${matches.length}${matches.length ? ` in ${matches.join(', ')}` : ''}: ${line}`);
  }
}
if (problems.length) {
  console.log(problems.join('\n'));
  process.exitCode = 1;
}
