import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

// Starting a reel runs the real build, so the first wait after Start is longer than the default.
const BUILD_WAIT_MS = 30_000;
const PROJECT_FILE = join(tmpdir(), 'kinotta-e2e-review-project.txt');
const FRAME_SECONDS = 1 / 30;
/** Pixels up from the bottom of the lane column: the axis row, which no button covers. */
const AXIS_INSET = 10;

// The footage sample with a fake transcriber (words "hello there" at 0.5 s), its own server (playwright.config.ts).
test.use({ baseURL: 'http://localhost:4386' });
test.describe.configure({ mode: 'serial' });

const review = (page: Page): Locator => page.getByRole('main', { name: 'Review' });
const timecode = (page: Page): Locator => review(page).getByLabel('Timecode');
const video = (page: Page): Locator => review(page).locator('video');
const videoTime = (page: Page): Promise<number> => video(page).evaluate((el: HTMLVideoElement) => el.currentTime);

/** The timecode's current reading in seconds. */
async function seconds(page: Page): Promise<number> {
  const [minutes, rest] = ((await timecode(page).innerText()).split(' ')[0] ?? '').split(':');
  return Number(minutes) * 60 + Number(rest);
}

async function startReel(page: Page, title: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'New reel' }).click();
  await page.getByRole('list', { name: 'Videos in the project' }).getByRole('button', { name: /media\/talk\.mp4/ }).click();
  await page.getByLabel('Reel name').fill(title);
  await page.getByRole('button', { name: 'Start reel' }).click();
  await expect(review(page).getByRole('heading', { name: title })).toBeVisible({ timeout: BUILD_WAIT_MS });
  // The reel opens at once; v1 follows when the (fake) transcription and the build are done.
  await expect(page.getByRole('navigation', { name: 'Versions' }).getByRole('button', { name: /^v1/ })).toBeVisible({ timeout: BUILD_WAIT_MS });
}

/** A point on the lane column at a fraction of its width, on the axis row. */
async function onLanes(page: Page, fraction: number): Promise<{ x: number; y: number }> {
  await review(page).locator('.axis').scrollIntoViewIfNeeded();
  const plane = (await review(page).locator('.rv-plane').boundingBox())!;
  return { x: plane.x + plane.width * fraction, y: plane.y + plane.height - AXIS_INSET };
}

test('a picked video plays with its captions, and the keyboard and the lanes drive it', async ({ page }) => {
  await startReel(page, 'Play talk');
  await expect(timecode(page)).toHaveText(/^00:00\.00 \/ 00:12\.0\d$/);
  await expect(review(page).getByRole('region', { name: 'Timeline' })).toBeVisible();
  await expect(review(page).locator('.rv-phrase')).toHaveText('hello there');

  // Play moves the footage and the timecode; pause stops both.
  await review(page).getByRole('button', { name: 'Play' }).click();
  await expect.poll(() => videoTime(page)).toBeGreaterThan(0.6);
  await expect(review(page).getByRole('button', { name: 'Pause' })).toBeVisible();
  expect(await seconds(page)).toBeGreaterThan(0.4);
  await review(page).getByRole('button', { name: 'Pause' }).click();
  const stopped = await seconds(page);
  await page.waitForTimeout(400);
  expect(await seconds(page)).toBe(stopped);

  // Space plays and pauses from the keyboard.
  await page.mouse.click(2, 2);
  await page.keyboard.press('Space');
  await expect(review(page).getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect.poll(() => seconds(page)).toBeGreaterThan(stopped + 0.3);
  await page.keyboard.press('Space');
  await expect(review(page).getByRole('button', { name: 'Play' })).toBeVisible();

  // Arrow keys step a frame; Shift steps a second.
  await page.keyboard.press('Home');
  await expect(timecode(page)).toHaveText(/^00:00\.00 /);
  await page.keyboard.press('ArrowRight');
  await expect(timecode(page)).toHaveText(/^00:00\.03 /);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(timecode(page)).toHaveText(/^00:00\.10 /);
  await page.keyboard.press('ArrowLeft');
  expect(Math.abs((await seconds(page)) - 2 * FRAME_SECONDS)).toBeLessThan(0.01);
  await page.keyboard.press('Shift+ArrowRight');
  expect(Math.abs((await seconds(page)) - (2 * FRAME_SECONDS + 1))).toBeLessThan(0.01);

  // The caption is on the frame while "hello there" is spoken, and gone after.
  const caption = page.frameLocator('iframe[title="Play talk page"]').getByText('hello', { exact: false });
  await page.keyboard.press('Home');
  for (let i = 0; i < 20; i += 1) await page.keyboard.press('ArrowRight');
  await expect(caption).toBeVisible();
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await expect(caption).toBeHidden();

  // Dragging along the lanes scrubs: the middle of the lanes is half way through the reel.
  const from = await onLanes(page, 0.25);
  const to = await onLanes(page, 0.5);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
  expect(Math.abs((await seconds(page)) - 6)).toBeLessThan(0.3);
  await expect.poll(async () => Math.abs((await videoTime(page)) - 6)).toBeLessThan(0.3);
});

test('the zoomed lanes and the overview keep step with the playhead', async ({ page }) => {
  await startReel(page, 'Zoom talk');
  const showing = review(page).locator('.rv-zoom b');
  await expect(showing).toHaveText('00:00 to 00:12');

  await review(page).getByRole('button', { name: 'Zoom in' }).click();
  await expect(showing).toHaveText('00:00 to 00:06');
  const windowBox = review(page).locator('.rv-win');
  const whole = (await review(page).locator('.rv-over').boundingBox())!;
  expect((await windowBox.boundingBox())!.width).toBeCloseTo(whole.width / 2, -1);

  // Moving the playhead out of the window pages the window to it, and the overview's box moves with it.
  await page.keyboard.press('End');
  await expect(showing).toHaveText(/^00:0[5-6] to 00:12$/);
  const before = (await windowBox.boundingBox())!.x;
  expect(before).toBeGreaterThan(whole.x + whole.width / 4);
  await page.keyboard.press('Home');
  await expect(showing).toHaveText('00:00 to 00:06');
  expect((await windowBox.boundingBox())!.x).toBeLessThan(before);

  // Pressing in the overview moves the window without moving the playhead.
  await page.mouse.click(whole.x + whole.width * 0.9, whole.y + whole.height / 2);
  await expect(showing).toHaveText('00:06 to 00:12');
  await expect(timecode(page)).toHaveText(/^00:00\.00 /);
});

test('playback follows the pieces and skips a snipped stretch', async ({ page }) => {
  await startReel(page, 'Snip talk');
  const project = readFileSync(PROJECT_FILE, 'utf8');
  const reelDir = join(project, 'reels', 'snip-talk');

  // A version whose plan snips seconds 3 to 5 of the 12 s video.
  const v1 = join(reelDir, 'v1');
  const v2 = join(reelDir, 'v2');
  mkdirSync(v2);
  copyFileSync(join(v1, 'index.html'), join(v2, 'index.html'));
  writeFileSync(join(v2, 'plan.json'), JSON.stringify({ title: 'Snip talk', duration: 10, pieces: [{ in: 0, out: 3 }, { in: 5, out: 12 }] }));
  const shots = JSON.parse(readFileSync(join(v1, 'shots.json'), 'utf8')) as { duration: number; sections: { end: number }[] };
  writeFileSync(join(v2, 'shots.json'), JSON.stringify({ ...shots, duration: 10, sections: shots.sections.map((s) => ({ ...s, end: 10 })) }));

  const v2Row = page.getByRole('navigation', { name: 'Versions' }).getByRole('button', { name: /^v2/ });
  await expect(v2Row).toBeVisible();
  await v2Row.click();
  await expect(timecode(page)).toHaveText(/^00:00\.00 \/ 00:10\.00$/);
  await expect(review(page).locator('.rv-piece')).toHaveCount(2);
  await expect(review(page).locator('.rv-joint')).toContainText('SNIP');
  await expect(review(page).locator('.rv-joint')).toContainText('2.0s');

  // Scrub to 2.5 s and play through the join: past 3.3 s on the timeline the footage is past 5 s, not at 3.3 s.
  const early = await onLanes(page, 2.5 / 10);
  await page.mouse.click(early.x, early.y);
  expect(Math.abs((await seconds(page)) - 2.5)).toBeLessThan(0.3);
  await expect.poll(async () => Math.abs((await videoTime(page)) - 2.5)).toBeLessThan(0.3);
  await review(page).getByRole('button', { name: 'Play' }).click();
  await expect.poll(() => seconds(page), { timeout: 5000 }).toBeGreaterThan(3.3);
  expect(await videoTime(page)).toBeGreaterThan(5.2);
  await review(page).getByRole('button', { name: 'Pause' }).click();

  // Scrubbing into the second piece lands the footage after the snip.
  const middle = await onLanes(page, 0.5);
  await page.mouse.click(middle.x, middle.y);
  await expect.poll(async () => Math.abs((await videoTime(page)) - 7)).toBeLessThan(0.3);
});
