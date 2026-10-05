import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

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
  await page.getByRole('button', { name: 'New reel' }).click();

  await page.getByLabel('Drop a video').setInputFiles(DROPPED_VIDEO);
  await expect(name).toHaveValue('dropped clip', { timeout: BUILD_WAIT_MS });
  await expect(copies).toHaveAttribute('aria-pressed', 'true');
  await name.fill('Launch clip');
  await page.getByRole('button', { name: 'Start reel' }).click();
  await expect(phases.getByRole('button', { name: 'Review' })).toHaveAttribute('aria-current', 'page', { timeout: BUILD_WAIT_MS });
  await expect(page.getByRole('main', { name: 'Review' }).getByRole('heading', { name: 'Launch clip' })).toBeVisible();
  await expect(page.getByRole('main', { name: 'Review' }).locator('video')).toBeVisible();

  await page.getByRole('button', { name: 'New reel' }).click();
  await expect(copies).toHaveCount(1);

  await page.getByLabel('Drop a video').setInputFiles(DROPPED_VIDEO);
  await expect(name).toHaveValue('dropped clip', { timeout: BUILD_WAIT_MS });
  await page.getByRole('button', { name: 'Start reel' }).click();
  await expect(page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'dropped clip' })).toHaveCount(1, { timeout: BUILD_WAIT_MS });

  await page.getByRole('button', { name: 'New reel' }).click();
  await expect(copies).toHaveCount(1);
});
