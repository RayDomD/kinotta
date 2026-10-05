import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

// The build after the words arrive runs the real engine.
const BUILD_WAIT_MS = 30_000;
const PROJECT_FILE = join(tmpdir(), 'kinotta-e2e-transcription-project.txt');
/** Pixels up from the bottom of the lane column: the axis row, which no button covers. */
const AXIS_INSET = 10;
const DRAG_FROM = 0.25;
const DRAG_TO = 0.5;

// The footage sample with a transcriber that holds its words until this spec lets them go (playwright.config.ts).
test.use({ baseURL: 'http://localhost:4381' });

const review = (page: Page): Locator => page.getByRole('main', { name: 'Review' });
const timecode = (page: Page): Locator => review(page).getByLabel('Timecode');
const versions = (page: Page): Locator => page.getByRole('navigation', { name: 'Versions' });

test('a reel plays and is snipped while it transcribes, shows progress, and keeps the snip when v1 arrives', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New reel' }).click();
  await page.getByRole('list', { name: 'Videos in the project' }).getByRole('button', { name: /media\/talk\.mp4/ }).click();
  await page.getByLabel('Reel name').fill('Gated talk');
  await page.getByRole('button', { name: 'Start reel' }).click();

  // The reel opens at once: the footage plays and the lanes say where the transcription is, with an estimate.
  await expect(review(page).getByRole('heading', { name: 'Gated talk' })).toBeVisible();
  await expect(review(page).locator('video')).toBeVisible();
  const progress = review(page).getByRole('progressbar', { name: 'Transcription' });
  await expect(progress).toHaveAttribute('aria-valuenow', '33', { timeout: BUILD_WAIT_MS });
  await expect(progress).toContainText(/Transcribing with faster-whisper · about \d+ s left · you can cut and snip now/);
  await expect(versions(page)).toHaveCount(0);
  await expect(timecode(page)).toHaveText(/\/ 00:12\.0\d$/);

  // Snip a stretch of the footage while the words are still coming.
  await review(page).getByRole('toolbar', { name: 'Edit tools' }).getByRole('button', { name: 'Snip S' }).click();
  await review(page).locator('.axis').scrollIntoViewIfNeeded();
  const plane = (await review(page).locator('.rv-plane').boundingBox())!;
  const y = plane.y + plane.height - AXIS_INSET;
  await page.mouse.move(plane.x + plane.width * DRAG_FROM, y);
  await page.mouse.down();
  await page.mouse.move(plane.x + plane.width * ((DRAG_FROM + DRAG_TO) / 2), y, { steps: 5 });
  await page.mouse.move(plane.x + plane.width * DRAG_TO, y, { steps: 5 });
  await page.mouse.up();
  await review(page).getByRole('button', { name: /^Snip \d\.\ds$/ }).click();
  await expect(page.getByRole('list', { name: 'Edits' }).getByRole('listitem')).toHaveCount(1);
  await expect(timecode(page)).toHaveText(/\/ 00:0[89]\.\d\d$/);
  // Save waits for v1.
  await expect(page.getByRole('button', { name: /^Save(?! as)/ })).toBeDisabled();

  // The words arrive: v1 is built, the lane gives way to the words, and the snip is still in the list and on the timeline.
  writeFileSync(join(readFileSync(PROJECT_FILE, 'utf8'), '.release-transcript'), '');
  await expect(versions(page).getByRole('button', { name: /^v1/ })).toBeVisible({ timeout: BUILD_WAIT_MS });
  await expect(versions(page)).toContainText('Saved by you');
  await expect(review(page).getByRole('progressbar', { name: 'Transcription' })).toHaveCount(0);
  await expect(review(page).locator('.rv-phrase')).toHaveText('hello there');
  await expect(review(page).locator('.rv-words .rv-w')).toHaveCount(2);
  await expect(page.getByRole('list', { name: 'Edits' }).getByRole('listitem')).toHaveCount(1);
  await expect(page.getByRole('list', { name: 'Edits' })).not.toContainText('No longer applies');
  await expect(timecode(page)).toHaveText(/\/ 00:0[89]\.\d\d$/);
  await expect(review(page).locator('.meta').first()).toContainText('unsaved edits');

  // And it saves: v2 is v1 with the snip.
  await page.getByRole('button', { name: /^Save as v2/ }).click();
  await expect(versions(page).getByRole('button', { name: /^v2/ })).toBeVisible({ timeout: BUILD_WAIT_MS });
  await expect(timecode(page)).toHaveText(/\/ 00:0[89]\.\d\d$/);
});
