import type { Locator, Page } from '@playwright/test';
import { revealReelRail } from '../helpers/review-rail.ts';
import { expect, test } from '../helpers/editor-test.ts';
import { serverUrl } from './ports.ts';

// Building v1 runs the real build, so the first wait after Auto is longer than the default.
const BUILD_WAIT_MS = 30_000;
// The tool check starts Python and ffmpeg probes, which are slow under the full suite's load.
const TOOL_CHECK_WAIT_MS = 20_000;

// The footage-project sample with a fake transcriber (playwright.config.ts); a reel is started in it.
test.use({ baseURL: serverUrl('newReel') });

// These start-screen tests build the reel without spending an installed agent's plan.
test.beforeEach(async ({ request }) => {
  const response = await request.put('/api/agent/settings', { data: { provider: 'copy' } });
  await expect(response).toBeOK();
});

const phaseTab = (page: Page, name: string): Locator => page.getByRole('navigation', { name: 'Phase' }).getByRole('button', { name, exact: true });
const projectVideos = (page: Page): Locator => page.getByLabel('Or use a video in this project');

async function openNewReel(page: Page): Promise<void> {
  await page.goto('/');
  await revealReelRail(page);
  await page.getByRole('button', { name: 'New reel' }).click();
}

test('the editor\'s New reel opens the one start screen, whose top bar has only the name and the reel menu', async ({ page }) => {
  await openNewReel(page);

  await expect(page.getByRole('heading', { name: /Drop a video/ })).toBeVisible();
  await expect(page.getByLabel('Drop videos')).toBeAttached();
  const top = page.locator('header.sm-top');
  await expect(top).toContainText('KINOTTA');
  await expect(top.getByRole('combobox', { name: 'Choose reel' })).toHaveValue('');
  await expect(page.getByLabel('Agent provider')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open in editor' })).toHaveCount(0);
  await expect(top).not.toContainText('Simple mode');

  const needs = page.getByText('Needs on this machine:');
  await expect(needs).toContainText('Python 3, ffmpeg, faster-whisper.', { timeout: TOOL_CHECK_WAIT_MS });
  await expect(needs).not.toContainText('Chromium');
});

test('a project video picked on the start screen can be removed without touching it, then started back in the editor', async ({ page }) => {
  await openNewReel(page);

  await projectVideos(page).selectOption('media/talk.mp4');
  await expect(page.getByLabel('Reel name')).toHaveValue('talk');
  await expect(page.getByText(/talk\.mp4/)).toBeVisible();
  // Picked, the video replaces the drop zone and the list; Clear only unpicks a video that was not just copied.
  await expect(page.getByLabel('Drop videos')).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear talk.mp4' }).click();
  await expect(page.getByLabel('Drop videos')).toBeAttached();
  await expect(projectVideos(page).locator('option', { hasText: 'media/talk.mp4' })).toHaveCount(1);

  await projectVideos(page).selectOption('media/talk.mp4');
  await page.getByLabel('Reel name').fill('Picked talk');
  await page.getByRole('group', { name: 'How to make it' }).getByRole('button', { name: /^Auto/ }).click();

  // Started from the editor, the reel opens back in the editor's Review.
  await expect(phaseTab(page, 'Edit')).toHaveAttribute('aria-current', 'page', { timeout: BUILD_WAIT_MS });
  await expect(page.getByRole('main', { name: 'Review' }).getByRole('heading', { name: 'Picked talk' })).toBeVisible();
  await revealReelRail(page);
  await expect(page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Picked talk' })).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('[data-working-row][data-current-version="1"]')).toBeVisible({ timeout: BUILD_WAIT_MS });
});

test('keyboard only: New reel, a project video, its name and Auto', async ({ page }) => {
  await page.goto('/');
  await revealReelRail(page);
  await tabTo(page, page.getByRole('button', { name: 'New reel' }));
  await page.keyboard.press('Enter');
  await tabTo(page, projectVideos(page));
  await page.keyboard.press('ArrowDown');
  await expect(page.getByLabel('Reel name')).not.toHaveValue('');
  await tabTo(page, page.getByLabel('Reel name'));
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Keys start');
  await tabTo(page, page.getByRole('group', { name: 'How to make it' }).getByRole('button', { name: /^Auto/ }));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main', { name: 'Review' }).getByRole('heading', { name: 'Keys start' })).toBeVisible({ timeout: BUILD_WAIT_MS });
});

/** Tabs forward until `target` has focus. */
async function tabTo(page: Page, target: Locator): Promise<void> {
  const MAX_TABS = 80;
  for (let i = 0; i < MAX_TABS; i += 1) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('Tab never reached the control');
}
