import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

const SAVE_WAIT_MS = 30_000;
const PROJECT_FILE = join(tmpdir(), 'kinotta-e2e-code-only-project.txt');
const DRAG_PX = 40;

// The showreel sample: reels built from code, with no footage and no plan. Its own server (playwright.config.ts).
test.use({ baseURL: 'http://localhost:4383' });
test.describe.configure({ mode: 'serial' });

const review = (page: Page): Locator => page.getByRole('main', { name: 'Review' });

test('drag an element on a code-only reel, Save, and see it moved in the next version; timing tools are off', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: /Product showreel/ }).click();
  await page.getByRole('navigation', { name: 'Phase' }).getByRole('button', { name: 'Review' }).click();
  const tools = review(page).getByRole('toolbar', { name: 'Edit tools' });
  await expect(tools).toBeVisible();

  // Timing is the agent's: Blade and Snip are off, with the reason on show.
  await expect(tools.getByRole('button', { name: /^Blade/ })).toBeDisabled();
  await expect(tools.getByRole('button', { name: /^Snip/ })).toBeDisabled();
  await expect(tools).toContainText('Built from code');

  // The first scene is on show at the start: click its cube, drag it.
  const frame = page.frameLocator('iframe[title$=" page"]');
  const cube = frame.locator('[data-el="cube"]');
  await expect(cube).toBeVisible();
  const before = (await cube.boundingBox())!;
  const grab = { x: before.x + before.width / 2, y: before.y + before.height / 2 };
  await page.mouse.click(grab.x, grab.y);
  await expect(review(page).getByTestId('element-tag')).toContainText(/cube-lands · cube\s*\+0, \+0 · 100%/);
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x + DRAG_PX / 2, grab.y + DRAG_PX / 2, { steps: 4 });
  await page.mouse.move(grab.x + DRAG_PX, grab.y + DRAG_PX, { steps: 4 });
  await page.mouse.up();

  const edits = page.getByRole('list', { name: 'Edits' });
  await expect(edits.getByRole('listitem')).toHaveCount(1);
  await expect(edits).toContainText(/Scene cube-lands/);
  await expect(edits).toContainText(/Moved cube by [1-9]\d*, [1-9]\d* at 100%/);
  // A timing key does nothing here.
  await page.keyboard.press('s');
  await expect(tools.getByRole('button', { name: /^Select/ })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: /^Save as v3/ }).click();
  const versions = page.getByRole('navigation', { name: 'Versions' });
  await expect(versions.getByRole('button', { name: /^v3/ })).toBeVisible({ timeout: SAVE_WAIT_MS });
  await expect(versions.getByRole('button', { name: /^v3/ })).toContainText('Saved by you');

  // v3 is v2 plus the stylesheet, and the cube sits at its offset in the new version's page.
  const reelDir = join(readFileSync(PROJECT_FILE, 'utf8'), 'reels', 'product-showreel');
  expect(readFileSync(join(reelDir, 'v3', 'kinotta-edits.css'), 'utf8')).toMatch(/\[data-scene="cube-lands"\] \[data-el="cube"\] \{ translate: [1-9]\d*px [1-9]\d*px; \}/);
  expect(existsSync(join(reelDir, 'v2', 'kinotta-edits.css'))).toBe(false);
  await expect(review(page).locator('.meta').first()).toContainText('v3');
  const cubeV3 = frame.locator('[data-el="cube"]');
  await expect(cubeV3).toBeVisible();
  await expect(cubeV3).toHaveCSS('translate', /^[1-9]\d*px [1-9]\d*px$/);
  const after = (await cubeV3.boundingBox())!;
  expect(after.x).toBeGreaterThan(before.x + DRAG_PX / 2);
  expect(after.y).toBeGreaterThan(before.y + DRAG_PX / 2);
});
