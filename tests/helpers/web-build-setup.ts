// Vitest globalSetup for the render project: render tests serve dist/web as built, so rebuild it
// first when it is missing or older than any source the web bundle includes.
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const BUILT_PAGE = join(ROOT, 'dist/web/index.html');
// The web bundle imports from server/core as well as web/.
const SOURCES = ['web', 'server/core', 'vite.config.ts'].map((path) => join(ROOT, path));

function newestMtime(path: string): number {
  const stat = statSync(path);
  if (!stat.isDirectory()) return stat.mtimeMs;
  return readdirSync(path).reduce((newest, entry) => Math.max(newest, newestMtime(join(path, entry))), stat.mtimeMs);
}

export default function setup() {
  const builtAt = existsSync(BUILT_PAGE) ? statSync(BUILT_PAGE).mtimeMs : 0;
  if (Math.max(...SOURCES.map(newestMtime)) <= builtAt) return;
  console.log('dist/web is missing or older than its sources; running npm run build');
  execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });
}
