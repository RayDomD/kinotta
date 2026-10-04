import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

// Save runs the real build.
const BUILD_WAIT_MS = 30_000;
const PROJECT_FILE = join(tmpdir(), 'kinotta-e2e-clips-project.txt');
/** Pixels inside a clip's edge where its grip is (the grip is 6 px wide). */
const GRIP_INSET = 3;
/** The sample video is 12 s and the lanes open on all of it. */
const SAMPLE_SECONDS = 12;
const SLIDE_SECONDS = 0.6;
const TRIM_SECONDS = 1;

// The footage sample as it is (its agent-built reel has four clips), its own server (playwright.config.ts).
test.use({ baseURL: 'http://localhost:4384' });
test.describe.configure({ mode: 'serial' });

const review = (page: Page): Locator => page.getByRole('main', { name: 'Review' });
const clip = (page: Page, id: string): Locator => review(page).locator(`.ov[data-clip="${id}"]`);

/** Drags from a point by `dx` pixels along the lane, in steps, as a pointer would. */
async function dragFrom(page: Page, x: number, y: number, dx: number): Promise<void> {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y, { steps: 4 });
  await page.mouse.move(x + dx, y, { steps: 4 });
  await page.mouse.up();
}

test('trim a clip by its edge, slide another by its body, see it flagged, and Save', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: /Founder talk/ }).click();
  await page.getByRole('navigation', { name: 'Phase' }).getByRole('button', { name: 'Review' }).click();
  await expect(review(page).getByLabel('Timecode')).toHaveText(/\/ 00:12\.0\d$/, { timeout: BUILD_WAIT_MS });
  await expect(review(page).locator('.ov')).toHaveCount(4);
  const edits = page.getByRole('list', { name: 'Edits' });
  const perSecond = ((await review(page).locator('.rv-plane').boundingBox())!.width) / SAMPLE_SECONDS;

  // The body slides: clip 03 moves later, its card says so and flags it, and the clip is marked.
  await clip(page, '03').scrollIntoViewIfNeeded();
  const body = (await clip(page, '03').boundingBox())!;
  await dragFrom(page, body.x + body.width / 2, body.y + body.height / 2, SLIDE_SECONDS * perSecond);
  await expect(edits.getByRole('listitem')).toHaveCount(1);
  await expect(edits).toContainText(/Clip 03/);
  await expect(edits).toContainText(/Slid \+0\.[56]s/);
  await expect(edits.locator('.c.flag .note')).toContainText('Off its words');
  await expect(clip(page, '03').locator('.rv-off')).toHaveText('off its words');
  const slid = (await clip(page, '03').boundingBox())!;
  expect(slid.x).toBeGreaterThan(body.x + perSecond * 0.4);
  await expect(clip(page, '01').locator('.rv-off')).toHaveCount(0);

  // An edge trims: clip 02's end moves earlier, and the clip gets shorter.
  const before = (await clip(page, '02').boundingBox())!;
  await dragFrom(page, before.x + before.width - GRIP_INSET, before.y + before.height / 2, -TRIM_SECONDS * perSecond);
  await expect(edits.getByRole('listitem')).toHaveCount(2);
  await expect(edits).toContainText(/Trimmed to 00:03\.20 to 00:0[45]\.\d\d/);
  const after = (await clip(page, '02').boundingBox())!;
  expect(after.width).toBeLessThan(before.width - perSecond * 0.7);
  expect(after.x).toBeCloseTo(before.x, 0);
  await expect(clip(page, '02').locator('.rv-off')).toHaveCount(0);

  // Undo takes the last edit back, and the clip is its old length again.
  await page.keyboard.press('Control+z');
  await expect(edits.getByRole('listitem')).toHaveCount(1);
  await expect.poll(async () => (await clip(page, '02').boundingBox())!.width).toBeCloseTo(before.width, 0);
  await page.keyboard.press('Control+y');
  await expect(edits.getByRole('listitem')).toHaveCount(2);

  await page.getByRole('button', { name: /^Save as v2/ }).click();
  await expect(page.getByRole('navigation', { name: 'Versions' }).getByRole('button', { name: /^v2/ })).toBeVisible({ timeout: BUILD_WAIT_MS });
  // The saved version keeps the flag, and the plan says which clip was slid.
  await expect(clip(page, '03').locator('.rv-off')).toHaveText('off its words');
  await expect(edits).toHaveCount(0);
  const project = readFileSync(PROJECT_FILE, 'utf8');
  const plan = JSON.parse(readFileSync(join(project, 'motion', 'plan.json'), 'utf8')) as { clips: { id: string; in: number; out: number; slid?: boolean }[] };
  const planClip = (id: string) => plan.clips.find((c) => c.id === id)!;
  expect(planClip('03').slid).toBe(true);
  expect(planClip('03').in).toBeGreaterThan(6.2);
  expect(planClip('02').slid).toBeUndefined();
  expect(planClip('02').out).toBeLessThan(6.2 - 0.5);
  expect(existsSync(join(project, 'reels', 'founder-talk', 'v2', 'edits.json'))).toBe(true);
});
