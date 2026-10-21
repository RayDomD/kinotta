import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from '../helpers/editor-test.ts';
import { revealReelRail } from '../helpers/review-rail.ts';

// Building v1 runs the real build, so the first wait after a drop is longer than the default.
const BUILD_WAIT_MS = 30_000;

// The footage sample's own video, dropped under another name. The server has a fake transcriber (playwright.config.ts).
const DROPPED_VIDEO = {
  name: 'dropped-clip.mp4',
  mimeType: 'video/mp4',
  buffer: readFileSync(resolve(import.meta.dirname, '../fixtures/projects/footage-project/media/talk.mp4')),
};

test.use({ baseURL: 'http://localhost:4388' });

test('a video dropped on New reel is copied to footage, named like a picked one, and starts a reel; dropping it again reuses the copy', async ({ page }) => {
  const phases = page.getByRole('navigation', { name: 'Phase' });
  const name = page.getByLabel('Reel name');
  const copies = page.getByRole('list', { name: 'Videos in the project' }).getByRole('button', { name: /footage\/dropped-clip/ });
  await page.goto('/');
  await revealReelRail(page);
  await page.getByRole('button', { name: 'New reel' }).click();

  await page.getByLabel('Drop videos').setInputFiles(DROPPED_VIDEO);
  await expect(name).toHaveValue('dropped clip', { timeout: BUILD_WAIT_MS });
  await expect(copies).toHaveAttribute('aria-pressed', 'true');
  await name.fill('Launch clip');
  await page.getByRole('button', { name: 'Start reel' }).click();
  await expect(phases.getByRole('button', { name: 'Review' })).toHaveAttribute('aria-current', 'page', { timeout: BUILD_WAIT_MS });
  await expect(page.getByRole('main', { name: 'Review' }).getByRole('heading', { name: 'Launch clip' })).toBeVisible();
  await expect(page.getByRole('main', { name: 'Review' }).locator('[data-verify-unit="PictureLayer"] video')).toBeVisible();

  await revealReelRail(page);
  await page.getByRole('button', { name: 'New reel' }).click();
  await expect(copies).toHaveCount(1);

  await page.getByLabel('Drop videos').setInputFiles(DROPPED_VIDEO);
  await expect(name).toHaveValue('dropped clip', { timeout: BUILD_WAIT_MS });
  await page.getByRole('button', { name: 'Start reel' }).click();
  await expect(page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'dropped clip' })).toHaveCount(1, { timeout: BUILD_WAIT_MS });

  await revealReelRail(page);
  await page.getByRole('button', { name: 'New reel' }).click();
  await expect(copies).toHaveCount(1);
});

/** The sample with bytes of its own appended, so the server does not reuse a copy another test made. */
const unique = (tag: string): Buffer => Buffer.concat([DROPPED_VIDEO.buffer, Buffer.from(`${tag}-${Date.now()}`)]);

test('a chosen folder brings in every video in it and its subfolders, skipping hidden and other files', async ({ page }) => {
  const folder = join(mkdtempSync(join(tmpdir(), 'kinotta-drop-')), 'Resumevid');
  mkdirSync(join(folder, 'more'), { recursive: true });
  writeFileSync(join(folder, 'folder-clip.mp4'), unique('folder'));
  writeFileSync(join(folder, 'more', 'nested-clip.mp4'), unique('nested'));
  writeFileSync(join(folder, '.hidden-clip.mp4'), DROPPED_VIDEO.buffer);
  writeFileSync(join(folder, 'notes.txt'), 'not a video');
  const rows = page.locator('.rv-drop-rows li');
  await page.goto('/');
  await revealReelRail(page);
  await page.getByRole('button', { name: 'New reel' }).click();

  await page.getByLabel('Choose a folder of videos').setInputFiles(folder);

  await expect(page.locator('.rv-drop-status')).toHaveText('Found 2 videos in Resumevid');
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: 'folder-clip.mp4' })).toContainText('footage/', { timeout: BUILD_WAIT_MS });
  await expect(rows.filter({ hasText: 'nested-clip.mp4' })).toContainText('footage/', { timeout: BUILD_WAIT_MS });
  await expect(page.getByLabel('Reel name')).not.toHaveValue('', { timeout: BUILD_WAIT_MS });
});

test('several videos chosen at once each get a row and the first is picked', async ({ page }) => {
  const rows = page.locator('.rv-drop-rows li');
  await page.goto('/');
  await revealReelRail(page);
  await page.getByRole('button', { name: 'New reel' }).click();

  await page.getByLabel('Drop videos').setInputFiles([{ ...DROPPED_VIDEO, name: 'first-pick.mp4', buffer: unique('first') }, { ...DROPPED_VIDEO, name: 'second-pick.mp4', buffer: unique('second') }]);

  await expect(rows).toHaveCount(2);
  await expect(rows.last()).toContainText('footage/', { timeout: BUILD_WAIT_MS });
  await expect(page.getByLabel('Reel name')).toHaveValue('first pick', { timeout: BUILD_WAIT_MS });
});
