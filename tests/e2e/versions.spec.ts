import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

// Adds a version folder to its temp project while the editor is open, so it has its own server (playwright.config.ts)
// and runs in order: the ready-notice test goes last, because v2 stops being the newest after it.
const VERSIONS_SERVER = 'http://localhost:4395';
const PROJECT_PATH_FILE = join(tmpdir(), 'kinotta-e2e-versions-project.txt');
const REEL = 'product-showreel';

test.use({ baseURL: VERSIONS_SERVER });
test.describe.configure({ mode: 'serial' });

const rail = (page: Page): Locator => page.getByRole('navigation', { name: 'Versions' });
const heading = (page: Page): Locator => page.getByRole('heading', { level: 1 });
const copyButton = (page: Page): Locator => page.locator('.copy .btn');

test('the rail lists v1 as the storyboard and v2 as now, with v2 open', async ({ page }) => {
  await page.goto('/');

  await expect(rail(page).getByRole('button')).toHaveText(['v1storyboard', 'v2now']);
  await expect(rail(page).getByRole('button', { name: /^v2/ })).toHaveAttribute('aria-current', 'true');
  await expect(heading(page)).toHaveText('Storyboard, v2');
  await expect(page.locator('.readonly-note')).toHaveCount(0);
});

test('an older version opens read-only: a line saying so, no pin control, no click-to-pin, copy disabled', async ({ page }) => {
  await page.goto('/');
  await rail(page).getByRole('button', { name: /^v1/ }).click();

  await expect(heading(page)).toHaveText('Storyboard, v1');
  await expect(rail(page).getByRole('button', { name: /^v1/ })).toHaveAttribute('aria-current', 'true');
  const note = 'v1 is read-only. Only the newest version, v2, takes comments.';
  await expect(page.locator('.main .readonly-note')).toHaveText(note);
  await expect(page.locator('.comments .readonly-note')).toHaveText(note);
  await expect(copyButton(page)).toBeDisabled();
  await expect(copyButton(page)).toHaveAccessibleName('Copy all comments, unavailable because v1 is read-only');

  await page.locator('.grid').getByRole('button', { name: /^Shot 03, / }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.still')).toHaveAttribute('data-state', 'ready');
  await expect(dialog).toHaveClass(/readonly/);
  await expect(dialog.getByText('Pin an element')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: /Frame centre/ })).toHaveCount(0);
  await expect(dialog).toContainText(note);
  const frame = (await dialog.locator('.still').boundingBox())!;
  await page.mouse.click(frame.x + frame.width / 2, frame.y + frame.height / 2);
  await expect(dialog.getByRole('textbox')).toHaveCount(0);
});

test('the server refuses a comment on v1 with 409 and still lists versions and reads v1', async ({ request }) => {
  const pin = { shot: '03', x: 0.5, y: 0.5, element: null };

  const refused = await request.post(`/api/reels/${REEL}/versions/1/comments`, { data: { pin, text: 'Too late.' } });
  expect(refused.status()).toBe(409);
  expect(await refused.json()).toEqual({ error: 'v1 is frozen. Only the newest version, v2, takes comments.' });

  expect((await request.post(`/api/reels/${REEL}/versions/1/batch`)).status()).toBe(409);
  expect((await request.get(`/api/reels/${REEL}/versions/1/comments`)).status()).toBe(200);
  expect(await (await request.get(`/api/reels/${REEL}/versions`)).json()).toEqual({
    versions: [
      { number: 1, isNewest: false, isStoryboard: true, approved: false, comments: expect.any(Number), issues: 0 },
      { number: 2, isNewest: true, isStoryboard: false, approved: false, comments: expect.any(Number), issues: 0 },
    ],
  });
});

test('the rail marks a version approved in the editor or on disk, on every tab, and drops the mark on withdraw', async ({ page, request }) => {
  await page.goto('/');
  await expect(heading(page)).toHaveText('Storyboard, v2');
  const v1 = rail(page).getByRole('button', { name: /^v1/ });
  const v2 = rail(page).getByRole('button', { name: /^v2/ });

  expect((await request.put(`/api/reels/${REEL}/versions/2/approval`)).status()).toBe(200);
  await expect(v2).toContainText('✓ approved');
  await expect(v1).not.toContainText('approved');

  const approvalFile = join(readFileSync(PROJECT_PATH_FILE, 'utf8'), 'reels', REEL, 'v1', 'approval.json');
  writeFileSync(approvalFile, JSON.stringify({ approvedBy: 'you', at: '2026-10-05T00:00:00.000Z' }));
  await expect(v1).toContainText('✓ approved');

  await page.getByRole('navigation', { name: 'Phase' }).getByRole('button', { name: 'Review' }).click();
  await expect(v1).toContainText('✓ approved');
  await expect(v2).toContainText('✓ approved');

  rmSync(approvalFile);
  expect((await request.delete(`/api/reels/${REEL}/versions/2/approval`)).status()).toBe(200);
  await expect(v1).not.toContainText('approved');
  await expect(v2).not.toContainText('approved');
  await page.getByRole('navigation', { name: 'Phase' }).getByRole('button', { name: 'Storyboard' }).click();
});

test('a new version on disk shows a ready notice without reload, and opens only on a click', async ({ page }) => {
  await page.goto('/');
  await expect(heading(page)).toHaveText('Storyboard, v2');
  await page.locator('.grid').getByRole('button', { name: /^Shot 03, / }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  const project = readFileSync(PROJECT_PATH_FILE, 'utf8');
  const v3 = join(project, 'reels', REEL, 'v3');
  mkdirSync(v3);
  cpSync(join(project, 'reels', REEL, 'v2', 'index.html'), join(v3, 'index.html'));
  cpSync(join(project, 'reels', REEL, 'v2', 'shots.json'), join(v3, 'shots.json'));

  const notice = page.locator('.notice');
  await expect(notice).toContainText('v3 is ready.');
  await expect(rail(page).getByRole('button', { name: /^v3/ })).toContainText('ready');
  await expect(rail(page).getByRole('button', { name: /^v3/ })).toContainText('now');

  // Nothing moved on its own: still v2 with the sheet open, and v2 now says it is read-only.
  await expect(heading(page)).toHaveText('Storyboard, v2');
  await expect(rail(page).getByRole('button', { name: /^v2/ })).toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.comments .readonly-note')).toHaveText('v2 is read-only. Only the newest version, v3, takes comments.');

  await page.keyboard.press('Escape');
  await notice.getByRole('button', { name: 'Open v3' }).click();

  await expect(heading(page)).toHaveText('Storyboard, v3');
  await expect(rail(page).getByRole('button', { name: /^v3/ })).toHaveAttribute('aria-current', 'true');
  await expect(notice).toHaveCount(0);
  await expect(rail(page).getByRole('button', { name: /^v3/ })).not.toContainText('ready');
  await expect(page.locator('.readonly-note')).toHaveCount(0);
  await expect(copyButton(page)).toHaveAccessibleName('Copy all comments, none yet');
});
