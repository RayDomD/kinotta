import { existsSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createRunRoot, removeTempRoot, sweepStaleTempRoots, tempDir } from '../helpers/temp';

const DEAD_PID = 4_000_000;

function rootWithJunction(root: string, target: string): void {
  mkdirSync(join(root, 'sub'));
  writeFileSync(join(root, 'sub', 'file.txt'), 'x');
  symlinkSync(target, join(root, 'link'), 'junction');
}

function outsideSentinel(): { target: string; sentinel: string } {
  const target = tempDir('temp-root-links-target');
  const sentinel = join(target, 'sentinel.txt');
  writeFileSync(sentinel, 'keep');
  return { target, sentinel };
}

it('removeTempRoot removes a root holding a junction without touching its target', () => {
  const { target, sentinel } = outsideSentinel();
  const root = createRunRoot();
  rootWithJunction(root, target);
  removeTempRoot(root);
  expect(existsSync(root)).toBe(false);
  expect(existsSync(sentinel)).toBe(true);
});

it('the stale sweep removes a dead runner root holding a junction without touching its target', () => {
  const { target, sentinel } = outsideSentinel();
  const root = join(tmpdir(), `kinotta-test-run-${DEAD_PID}-${Date.now()}`);
  mkdirSync(root);
  rootWithJunction(root, target);
  sweepStaleTempRoots();
  expect(existsSync(root)).toBe(false);
  expect(existsSync(sentinel)).toBe(true);
});
