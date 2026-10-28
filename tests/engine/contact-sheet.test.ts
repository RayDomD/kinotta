import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

it('writes a contact sheet in paths with spaces and removes its temporary stills on success and failure', { timeout: 30_000 }, () => {
  const root = mkdtempSync(join(tmpdir(), 'kinotta sheet '));
  try {
    const html = join(root, 'scene with spaces.html');
    const output = join(root, 'contact sheet.png');
    writeFileSync(html, '<!doctype html><script>window.seek = () => {};</script><p>Frame</p>');
    const run = (out: string) => spawnSync(process.execPath, [resolve('skill/kinotta/engine/beats.js'), html, out, '0'], {
      encoding: 'utf8', env: { ...process.env, TMP: root, TEMP: root, TMPDIR: root, NODE_PATH: resolve('node_modules') }, timeout: 25_000,
    });
    const success = run(output);
    expect(success.status, success.stderr).toBe(0);
    expect(existsSync(output)).toBe(true);
    expect(readdirSync(root).filter((name) => name.startsWith('bt'))).toEqual([]);
    const failure = run(join(root, 'missing directory', 'sheet.png'));
    expect(failure.status).not.toBe(0);
    expect(readdirSync(root).filter((name) => name.startsWith('bt'))).toEqual([]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
