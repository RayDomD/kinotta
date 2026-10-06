import { expect, test } from '@playwright/test';

// Building v1 runs the real build, so the first wait after Start is longer than the default.
const BUILD_WAIT_MS = 30_000;
// The tool check starts Python and ffmpeg probes, which are slow under the full suite's load.
const TOOL_CHECK_WAIT_MS = 20_000;

// The footage-project sample with a fake transcriber (playwright.config.ts); a reel is started in it.
test.use({ baseURL: 'http://localhost:4389' });

test('the Needs row names what a start from video needs, and not the render browser', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New reel' }).click();

  const needs = page.getByText('Needs on this machine:');
  await expect(needs).toContainText('Python 3, ffmpeg, faster-whisper.', { timeout: TOOL_CHECK_WAIT_MS });
  await expect(needs).not.toContainText('Chromium');
});

test('a video picked on New reel becomes a reel that opens in Review', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New reel' }).click();

  const video = page.getByRole('list', { name: 'Videos in the project' }).getByRole('button', { name: /media\/talk\.mp4/ });
  await expect(video).toContainText('H.264');
  await expect(video).toContainText('00:12');
  await video.click();
  await expect(page.getByLabel('Reel name')).toHaveValue('talk');
  await page.getByLabel('Reel name').fill('Picked talk');
  await page.getByRole('button', { name: 'Start reel' }).click();

  await expect(page.getByRole('navigation', { name: 'Phase' }).getByRole('button', { name: 'Review' })).toHaveAttribute('aria-current', 'page', { timeout: BUILD_WAIT_MS });
  await expect(page.getByRole('main', { name: 'Review' }).getByRole('heading', { name: 'Picked talk' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Picked talk' })).toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('main', { name: 'Review' }).locator('video')).toBeVisible();

  // v1 follows the transcription in the background.
  await expect(page.getByRole('navigation', { name: 'Versions' }).getByRole('button', { name: /^v1/ })).toBeVisible({ timeout: BUILD_WAIT_MS });
  await page.getByRole('navigation', { name: 'Phase' }).getByRole('button', { name: 'Storyboard' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Storyboard, v1');
});
