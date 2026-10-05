import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// Starts reels in the footage sample with a fake transcriber (playwright.config.ts), so this has its own server and runs in order.
const BUILD_WAIT_MS = 30_000;
const PROJECT_PATH_FILE = join(tmpdir(), 'kinotta-e2e-brief-reel-project.txt');
const BRIEF = 'A 20 second teaser for the spring launch.';

test.use({ baseURL: 'http://localhost:4387', permissions: ['clipboard-read', 'clipboard-write'] });
test.describe.configure({ mode: 'serial' });

const reelsRail = (page: Page) => page.getByRole('navigation', { name: 'Reels' });
const phaseTab = (page: Page, name: string) => page.getByRole('navigation', { name: 'Phase' }).getByRole('button', { name });
const readClipboard = (page: Page): Promise<string> => page.evaluate(() => navigator.clipboard.readText());

async function startVideoReel(page: Page, title: string): Promise<void> {
  await page.getByRole('button', { name: 'New reel' }).click();
  await page.getByRole('list', { name: 'Videos in the project' }).getByRole('button', { name: /media\/talk\.mp4/ }).click();
  await page.getByLabel('Reel name').fill(title);
  await page.getByRole('button', { name: 'Start reel' }).click();
  await expect(phaseTab(page, 'Review')).toHaveAttribute('aria-current', 'page', { timeout: BUILD_WAIT_MS });
}

test('a reel started from a brief waits in the rail, then opens in Storyboard once built', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New reel' }).click();
  await page.getByLabel('Brief title').fill('Spring teaser');
  await page.getByLabel('Brief', { exact: true }).fill(BRIEF);
  await page.getByRole('button', { name: 'Start from brief' }).click();

  const waiting = page.getByRole('main', { name: 'Waiting for the shot list' });
  await expect(waiting.getByRole('heading', { name: 'Spring teaser' })).toBeVisible();
  await expect(reelsRail(page).getByRole('button', { name: /Spring teaser/ })).toContainText('Waiting');
  await expect(reelsRail(page).getByRole('button', { name: /Spring teaser/ })).toHaveAttribute('aria-current', 'true');
  const request = await readClipboard(page);
  expect(request).toContain('Spring teaser');
  expect(request).toContain('reels/spring-teaser');
  expect(request).toContain(BRIEF);
  expect(request).not.toMatch(/claude|codex|gemini|agy/i);

  await waiting.getByRole('button', { name: 'Copy request' }).click();
  await expect(waiting.getByRole('button', { name: 'Copied' })).toBeVisible();

  // The agent writes the page, then shots.json last.
  const versionDir = join(readFileSync(PROJECT_PATH_FILE, 'utf8'), 'reels', 'spring-teaser', 'v1');
  mkdirSync(versionDir);
  writeFileSync(join(versionDir, 'index.html'), '<!doctype html><html><body></body></html>');
  writeFileSync(join(versionDir, 'shots.json'), JSON.stringify({ duration: 4, shots: [{ number: '01', start: 0, title: 'Open', description: 'The opener.' }] }));

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Storyboard, v1', { timeout: BUILD_WAIT_MS });
  await expect(phaseTab(page, 'Storyboard')).toHaveAttribute('aria-current', 'page');
  await expect(reelsRail(page).getByRole('button', { name: /Spring teaser/ })).not.toContainText('Waiting');
});

test('a reel with no clips shows the empty state, its lanes, and takes a word pin', async ({ page }) => {
  await page.goto('/');
  await startVideoReel(page, 'Bare talk');
  await phaseTab(page, 'Storyboard').click();

  await expect(page.getByText('No clips in this reel yet.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Timeline' })).toBeVisible();
  await page.getByRole('button', { name: 'Copy request for b-roll' }).click();
  const request = await readClipboard(page);
  expect(request).toContain('Bare talk');
  expect(request).toContain('reels/bare-talk/v2');
  expect(request).not.toMatch(/claude|codex|gemini|agy/i);

  await page.getByRole('button', { name: /^Word “hello”/ }).click();
  await page.getByRole('textbox', { name: 'Comment on word “hello”' }).fill('Hit this word.');
  await page.keyboard.press('Enter');

  await expect(page.getByText('Comment saved on word “hello”.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Timeline' }).getByRole('img', { name: /^Pin 1 on word “hello”/ })).toBeVisible();
  await expect(page.locator('.clist .c')).toContainText('Hit this word.');
  await expect(page.locator('.clist .c .where')).not.toContainText('Shot');
});

test('a reel reopens in the tab last used for it', async ({ page }) => {
  await page.goto('/');
  await reelsRail(page).getByRole('button', { name: 'Bare talk' }).click();
  await phaseTab(page, 'Review').click();
  await expect(phaseTab(page, 'Review')).toHaveAttribute('aria-current', 'page');

  // Another reel has no tab remembered, so it opens in Storyboard.
  await reelsRail(page).getByRole('button', { name: /^Founder talk/ }).click();
  await expect(phaseTab(page, 'Storyboard')).toHaveAttribute('aria-current', 'page');

  await reelsRail(page).getByRole('button', { name: 'Bare talk' }).click();
  await expect(phaseTab(page, 'Review')).toHaveAttribute('aria-current', 'page');

  // And after a reload, which opens the newest reel.
  await page.reload();
  await expect(reelsRail(page).getByRole('button', { name: 'Bare talk' })).toHaveAttribute('aria-current', 'true');
  await expect(phaseTab(page, 'Review')).toHaveAttribute('aria-current', 'page');
});
