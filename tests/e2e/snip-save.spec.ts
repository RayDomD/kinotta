import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

// Starting a reel runs the real build, and so does Save.
const BUILD_WAIT_MS = 30_000;
const PROJECT_FILE = join(tmpdir(), 'kinotta-e2e-snip-save-project.txt');
/** Pixels up from the bottom of the lane column: the axis row, which no button covers. */
const AXIS_INSET = 10;
/** The sample video is 12 s and the lanes open on all of it; a drag from a quarter to a half selects about 3 s. */
const DRAG_FROM = 0.25;
const DRAG_TO = 0.5;

// The footage sample with a fake transcriber, its own server (playwright.config.ts).
test.use({ baseURL: 'http://localhost:4385' });
test.describe.configure({ mode: 'serial' });

const review = (page: Page): Locator => page.getByRole('main', { name: 'Review' });
const timecode = (page: Page): Locator => review(page).getByLabel('Timecode');
const versions = (page: Page): Locator => page.getByRole('navigation', { name: 'Versions' });

async function startReel(page: Page, title: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'New reel' }).click();
  await page.getByRole('list', { name: 'Videos in the project' }).getByRole('button', { name: /media\/talk\.mp4/ }).click();
  await page.getByLabel('Reel name').fill(title);
  await page.getByRole('button', { name: 'Start reel' }).click();
  await expect(review(page).getByRole('heading', { name: title })).toBeVisible({ timeout: BUILD_WAIT_MS });
}

/** With the Snip tool on, drags along the lanes between two fractions of the reel's width and leaves a stretch selected. */
async function selectStretch(page: Page): Promise<void> {
  await review(page).getByRole('toolbar', { name: 'Edit tools' }).getByRole('button', { name: 'Snip S' }).click();
  await review(page).locator('.axis').scrollIntoViewIfNeeded();
  const plane = (await review(page).locator('.rv-plane').boundingBox())!;
  const y = plane.y + plane.height - AXIS_INSET;
  await page.mouse.move(plane.x + plane.width * DRAG_FROM, y);
  await page.mouse.down();
  await page.mouse.move(plane.x + plane.width * ((DRAG_FROM + DRAG_TO) / 2), y, { steps: 5 });
  await page.mouse.move(plane.x + plane.width * DRAG_TO, y, { steps: 5 });
  await page.mouse.up();
}

test('snip a stretch, see it in the Edits panel, and Save it as a new version', async ({ page }) => {
  await startReel(page, 'Snip talk');
  await expect(timecode(page)).toHaveText(/\/ 00:12\.0\d$/);
  await expect(versions(page)).toContainText('Saved by you');
  await expect(review(page).getByRole('toolbar', { name: 'Edit tools' })).toBeVisible();

  await selectStretch(page);
  await expect(review(page).getByRole('button', { name: /^Snip \d\.\ds$/ })).toBeVisible();
  await review(page).getByRole('button', { name: /^Snip \d\.\ds$/ }).click();

  // The operation is listed, the timeline closes over it and says how long it was, and the reel is shorter.
  const edits = page.getByRole('list', { name: 'Edits' });
  await expect(edits.getByRole('listitem')).toHaveCount(1);
  await expect(edits).toContainText(/Snipped 3\.\ds \(00:0[23]\.\d\d to 00:0[56]\.\d\d\)/);
  await expect(review(page).locator('.rv-joint span')).toHaveText(/^SNIP −3\.\ds$/);
  await expect(timecode(page)).toHaveText(/\/ 00:0[89]\.\d\d$/);
  await expect(review(page).locator('.meta').first()).toContainText('unsaved edits');
  // The playhead sits where the snip was, and the footage is already past the snipped stretch.
  await expect.poll(() => review(page).locator('video').evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(4.9);

  // The edit list is in the reel folder, outside every version, and no version exists yet.
  const project = readFileSync(PROJECT_FILE, 'utf8');
  const reelDir = join(project, 'reels', 'snip-talk');
  expect(JSON.parse(readFileSync(join(reelDir, 'edit-list.json'), 'utf8')).operations).toHaveLength(1);
  expect(existsSync(join(reelDir, 'v2'))).toBe(false);

  // Save builds v2 and opens it.
  await page.getByRole('button', { name: /^Save as v2/ }).click();
  await expect(versions(page).getByRole('button', { name: /^v2/ })).toBeVisible({ timeout: BUILD_WAIT_MS });
  await expect(versions(page).getByRole('button', { name: /^v2/ })).toContainText('Saved by you');
  await expect(review(page).locator('.meta').first()).toContainText('v2');
  await expect(review(page).locator('.meta').first()).not.toContainText('unsaved edits');
  await expect(timecode(page)).toHaveText(/\/ 00:0[89]\.\d\d$/);
  await expect(page.getByText('No edits yet')).toBeVisible();
  const shots = JSON.parse(readFileSync(join(reelDir, 'v2', 'shots.json'), 'utf8'));
  expect(shots.builtBy).toBe('you');
  expect(existsSync(join(reelDir, 'v2', 'edits.json'))).toBe(true);
  expect(existsSync(join(reelDir, 'edit-list.json'))).toBe(false);
});

test('Discard drops the edit list and the reel plays whole again', async ({ page }) => {
  await startReel(page, 'Discard talk');
  await selectStretch(page);
  await review(page).getByRole('button', { name: /^Snip \d\.\ds$/ }).click();
  await expect(page.getByRole('list', { name: 'Edits' }).getByRole('listitem')).toHaveCount(1);
  await expect(timecode(page)).toHaveText(/\/ 00:0[89]\.\d\d$/);

  await page.getByRole('button', { name: 'Discard', exact: true }).click();

  await expect(page.getByText('No edits yet')).toBeVisible();
  await expect(timecode(page)).toHaveText(/\/ 00:12\.0\d$/);
  const project = readFileSync(PROJECT_FILE, 'utf8');
  expect(existsSync(join(project, 'reels', 'discard-talk', 'edit-list.json'))).toBe(false);
  await expect(versions(page).getByRole('button', { name: /^v2/ })).toHaveCount(0);
});
