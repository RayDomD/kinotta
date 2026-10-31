// Plan: docs/plans/2026-10-31-import-preview.md. In the media library, a file whose name is taken asks first.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { expect, it } from 'vitest';
import { startServer } from '../../server/main.ts';
import { copyFixture } from '../helpers/project.ts';
import { openDetailedEditor, revealReelRail } from '../helpers/review-rail.ts';

it('shows the import sheet for a taken name in the media library; Cancel copies nothing, Import copies it renamed', { timeout: 90_000 }, async () => {
  const dir = copyFixture('footage-project');
  const file = join(dir, 'music.wav');
  const generated = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=660:duration=1', file], { encoding: 'utf8' });
  expect(generated.status, generated.stderr).toBe(0);
  // A different file already named music.wav in footage/.
  mkdirSync(join(dir, 'footage'), { recursive: true });
  writeFileSync(join(dir, 'footage', 'music.wav'), Buffer.alloc(10));
  const server = await startServer({ projectDir: dir, port: 0 });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await openDetailedEditor(page, server.url);
    await revealReelRail(page);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Founder talk: going local-first' }).click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('tab', { name: 'Media rail', exact: true }).click();

    const sheet = page.getByRole('dialog', { name: 'Import 1 file into footage/' });
    await page.getByLabel('Import media', { exact: true }).setInputFiles(file);
    await sheet.waitFor();
    expect(await sheet.textContent()).toContain('footage/music-2.wav');
    await sheet.getByRole('button', { name: 'Cancel' }).click();
    expect(await sheet.count()).toBe(0);
    expect(existsSync(join(dir, 'footage', 'music-2.wav'))).toBe(false);

    await page.getByLabel('Import media', { exact: true }).setInputFiles(file);
    await sheet.getByRole('button', { name: 'Import 1 file' }).click();
    await expect.poll(() => existsSync(join(dir, 'footage', 'music-2.wav')), { timeout: 15_000 }).toBe(true);
    expect(readFileSync(join(dir, 'footage', 'music-2.wav'))).toEqual(readFileSync(file));
  } finally {
    await browser.close();
    await server.close();
  }
});
