import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from '../helpers/editor-test.ts';
import type { Page } from '../helpers/editor-test.ts';
import { revealReelRail } from '../helpers/review-rail.ts';
import { serverUrl } from './ports.ts';

// Building v1 runs the real build, so the first wait after a drop is longer than the default.
const BUILD_WAIT_MS = 30_000;

// The footage sample's own video, dropped under another name. The server has a fake transcriber (playwright.config.ts).
const DROPPED_VIDEO = {
  name: 'dropped-clip.mp4',
  mimeType: 'video/mp4',
  buffer: readFileSync(resolve(import.meta.dirname, '../fixtures/projects/footage-project/media/talk.mp4')),
};

test.use({ baseURL: serverUrl('dropVideo') });

// These start-screen tests build the reel without spending an installed agent's plan.
test.beforeEach(async ({ request }) => {
  const response = await request.put('/api/agent/settings', { data: { provider: 'copy' } });
  await expect(response).toBeOK();
});

/** The project's videos, as the start screen lists them. */
const footage = async (page: Page): Promise<string[]> => ((await (await page.request.get('/api/videos')).json()) as { videos: { path: string }[] }).videos.map((video) => video.path);

async function openNewReel(page: Page): Promise<void> {
  await page.goto('/');
  await revealReelRail(page);
  await page.getByRole('button', { name: 'New reel' }).click();
}

test('a dropped video shows as a row with Remove, which deletes the copy; a copy a reel uses is kept', async ({ page }) => {
  const phases = page.getByRole('navigation', { name: 'Phase' });
  const name = page.getByLabel('Reel name');
  const remove = page.getByRole('button', { name: 'Remove dropped-clip.mp4' });
  await openNewReel(page);

  await page.getByLabel('Drop videos').setInputFiles(DROPPED_VIDEO);
  await expect(name).toHaveValue('dropped clip', { timeout: BUILD_WAIT_MS });
  await expect(page.getByLabel('Drop videos')).toHaveCount(0);
  expect(await footage(page)).toContain('footage/dropped-clip.mp4');

  await remove.click();
  await expect(page.getByRole('status').filter({ hasText: 'Removed dropped-clip.mp4 and Kinotta’s copy in footage/.' })).toBeVisible();
  await expect(page.getByLabel('Drop videos')).toBeAttached();
  expect(await footage(page)).not.toContain('footage/dropped-clip.mp4');

  await page.getByLabel('Drop videos').setInputFiles(DROPPED_VIDEO);
  await expect(name).toHaveValue('dropped clip', { timeout: BUILD_WAIT_MS });
  await name.fill('Launch clip');
  await page.getByRole('group', { name: 'How to make it' }).getByRole('button', { name: /^Auto/ }).click();
  await expect(phases.getByRole('button', { name: 'Edit', exact: true })).toHaveAttribute('aria-current', 'page', { timeout: BUILD_WAIT_MS });
  await expect(page.getByRole('main', { name: 'Review' }).getByRole('heading', { name: 'Launch clip' })).toBeVisible();

  // Dropped again, the same bytes reuse the copy, and Remove leaves it for the reel that uses it.
  await revealReelRail(page);
  await page.getByRole('button', { name: 'New reel' }).click();
  await page.getByLabel('Drop videos').setInputFiles(DROPPED_VIDEO);
  await expect(name).toHaveValue('dropped clip', { timeout: BUILD_WAIT_MS });
  await remove.click();
  await expect(page.getByLabel('Drop videos')).toBeAttached();
  expect((await footage(page)).filter((path) => path.startsWith('footage/dropped-clip'))).toEqual(['footage/dropped-clip.mp4']);
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
  await openNewReel(page);

  // The folder picker lives inside the drop zone, beside Choose files.
  await expect(page.locator('.rv-dropzone').getByRole('button', { name: 'Choose a folder…' })).toBeVisible();
  await page.getByLabel('Choose a folder of videos').setInputFiles(folder);

  await expect(page.locator('.rv-drop-status')).toHaveText('Found 2 videos in Resumevid');
  await expect(page.getByLabel('Reel name')).not.toHaveValue('', { timeout: BUILD_WAIT_MS });
  const found = await footage(page);
  expect(found.some((path) => path.startsWith('footage/folder-clip'))).toBe(true);
  expect(found.some((path) => path.startsWith('footage/nested-clip'))).toBe(true);
  expect(found.some((path) => path.includes('hidden-clip'))).toBe(false);
});

test('several videos chosen at once each get a row and the first is picked', async ({ page }) => {
  const rows = page.locator('.rv-drop-rows li');
  await openNewReel(page);

  await page.getByLabel('Drop videos').setInputFiles([{ ...DROPPED_VIDEO, name: 'first-pick.mp4', buffer: unique('first') }, { ...DROPPED_VIDEO, name: 'second-pick.mp4', buffer: unique('second') }]);

  await expect(rows).toHaveCount(2);
  await expect(page.getByLabel('Reel name')).toHaveValue('first pick', { timeout: BUILD_WAIT_MS });
  expect(await footage(page)).toEqual(expect.arrayContaining(['footage/first-pick.mp4', 'footage/second-pick.mp4']));
});
