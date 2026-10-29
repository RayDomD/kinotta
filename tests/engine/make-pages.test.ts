import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

it('fails instead of writing review pages when a MOV preview cannot be converted', { timeout: 30_000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'kinotta pages '));
  try {
    const plan = join(dir, 'plan.json');
    writeFileSync(plan, JSON.stringify({ title: 'Test', video: 'video.mp4', clips: [
      { id: 'one', title: 'One', in: 0, out: 1, file: 'missing clip.mov' },
    ] }));
    const python = process.platform === 'win32' ? 'python' : 'python3';
    const result = spawnSync(python, [resolve('skill/kinotta/scripts/make_pages.py'), plan, join(dir, 'preview.mp4')], { encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('ffmpeg');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

it.skipIf(process.platform === 'win32')('reads a preview whose name contains shell expansion characters literally', { timeout: 30_000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'kinotta pages '));
  try {
    const preview = join(dir, 'preview $KINOTTA_MISSING.mp4');
    copyFileSync(resolve('tests/fixtures/projects/footage-project/media/talk.mp4'), preview);
    const plan = join(dir, 'plan.json');
    writeFileSync(plan, JSON.stringify({ title: 'Test', video: preview, clips: [] }));
    const result = spawnSync('python3', [resolve('skill/kinotta/scripts/make_pages.py'), plan, preview], { encoding: 'utf8', env: { ...process.env, KINOTTA_MISSING: 'wrong', PYTHONUTF8: '1' } });
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(join(dir, 'compare.html'), 'utf8')).toContain('preview $KINOTTA_MISSING.mp4');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
