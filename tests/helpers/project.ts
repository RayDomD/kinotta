import { cpSync, mkdtempSync, readdirSync, statSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const FIXTURES_DIR = resolve(import.meta.dirname, '../fixtures/projects');

/** Copies a sample project into a fresh temp dir and returns the copy's path. */
export function copyFixture(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'kinotta-test-'));
  cpSync(join(FIXTURES_DIR, name), dir, { recursive: true });
  return dir;
}

/** Creates an empty temp project dir (no reels folder). */
export function emptyProject(): string {
  return mkdtempSync(join(tmpdir(), 'kinotta-test-'));
}

/** Sets every file and folder inside a reel to one mtime, so "last change" is deterministic. */
export function setReelMtime(projectDir: string, slug: string, when: Date): void {
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      utimesSync(path, when, when);
    }
    utimesSync(dir, when, when);
  };
  walk(join(projectDir, 'reels', slug));
}
