import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

// Opens versions that break the timing contract. Saves a comment and a batch, so it has its own server on the
// broken-project sample (playwright.config.ts) and runs in order.
const CONTRACT_SERVER = 'http://localhost:4393';
const PROJECT_PATH_FILE = join(tmpdir(), 'kinotta-e2e-contract-project.txt');
const BATCH_FILE = 'reels/launch-teaser/v1/comments.json';
const SEEK_MISSING = 'The page has no global seek(seconds) function.';
const LAUNCH_TEASER_ISSUES = [
  'shots.json: shot 05 is missing a title',
  'scene product-card: element name "card" is used twice',
  'shot 03: no named elements',
  'shot 04: starts at 9s but no scene covers that time',
];

test.use({ baseURL: CONTRACT_SERVER, permissions: ['clipboard-read', 'clipboard-write'] });
test.describe.configure({ mode: 'serial' });

const dialog = (page: Page): Locator => page.getByRole('dialog');
const issues = (page: Page): Locator => page.locator('.issues');
const shotCard = (page: Page, number: string): Locator =>
  page.locator('.grid .shot').filter({ has: page.getByRole('button', { name: new RegExp(`^Shot ${number}, `) }) });

async function openReel(page: Page, title: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: title }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Storyboard, v1');
}

test('a broken version opens and lists each issue in plain words', async ({ page }) => {
  await openReel(page, 'Launch teaser');

  await expect(issues(page).getByRole('heading')).toContainText('This version breaks the timing contract');
  await expect(issues(page).getByRole('heading')).toContainText('4 issues');
  await expect(issues(page).locator('li')).toHaveText(LAUNCH_TEASER_ISSUES);
  // Every shot is still in the grid.
  await expect(page.locator('.grid .shot')).toHaveCount(5);
  await expect(shotCard(page, '01').locator('.still')).toHaveAttribute('data-state', 'ready');
});

test('a shot no scene covers shows a labelled placeholder with the reason, in the grid and enlarged', async ({ page }) => {
  await openReel(page, 'Launch teaser');

  const still = shotCard(page, '04').locator('.still');
  await expect(still).toHaveAttribute('data-state', 'failed');
  await expect(still.getByRole('img', { name: 'Shot 04 still unavailable' })).toContainText('Starts at 9s but no scene covers that time');

  await page.locator('.grid').getByRole('button', { name: /^Shot 04, / }).click();
  await expect(dialog(page).getByRole('img', { name: 'Shot 04 unavailable' })).toContainText('Starts at 9s but no scene covers that time');
});

test('pinning an unnamed area records position only, and the batch can include the issues', async ({ page }) => {
  await openReel(page, 'Launch teaser');
  await page.locator('.grid').getByRole('button', { name: /^Shot 03, / }).click();
  await expect(dialog(page).locator('.still')).toHaveAttribute('data-state', 'ready');
  // The sheet scales in over 300ms; click only once that has finished.
  await page.waitForFunction(() => document.getAnimations().length === 0);

  const frame = (await dialog(page).locator('.still').boundingBox())!;
  await page.mouse.click(frame.x + frame.width * 0.5, frame.y + frame.height * 0.5);
  await dialog(page).getByRole('textbox').fill('Ticker is too fast.');
  await page.keyboard.press('Enter');
  await expect(dialog(page).getByRole('textbox')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);

  const copy = page.locator('.copy .btn');
  await copy.click();
  await expect(copy).toHaveText('Copied');
  const plain = await page.evaluate(() => navigator.clipboard.readText());
  expect(plain).toContain('1. Shot 03, 06.00s, position 50% 50%: Ticker is too fast.');
  expect(plain).not.toContain('Contract issues');

  await page.getByLabel('Include contract issues').check();
  await expect(copy).toContainText('Copy all comments');
  await copy.click();
  await expect(copy).toHaveText('Copied');
  const withIssues = (await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n');
  expect(withIssues).toContain('position 50% 50%: Ticker is too fast.');
  expect(withIssues).toContain(['Contract issues', ...LAUNCH_TEASER_ISSUES.map((i) => `- ${i}`)].join('\n'));

  const project = readFileSync(PROJECT_PATH_FILE, 'utf8');
  const batch = JSON.parse(readFileSync(join(project, BATCH_FILE), 'utf8')) as { issues: string[]; comments: Array<{ element: string | null }> };
  expect(batch.issues).toEqual(LAUNCH_TEASER_ISSUES);
  expect(batch.comments[0]?.element).toBeNull();
});

test('a version that keeps the contract shows no issue list and offers no issue checkbox', async ({ page }) => {
  // The read-only sample server (product-showreel v2 is good).
  await page.goto('http://localhost:4399/');
  await expect(page.locator('.grid .shot')).toHaveCount(6);
  await expect(page.locator('.issues')).toHaveCount(0);
  await expect(page.getByLabel('Include contract issues')).toHaveCount(0);
});

test('a page with no seek lists the runtime issue once and every still is a labelled placeholder', async ({ page }) => {
  await openReel(page, 'Explainer without seek');

  await expect(issues(page).locator('li')).toHaveText(['the page has no global seek(seconds) function']);
  await expect(issues(page).getByRole('heading')).toContainText('1 issue');
  await expect(page.locator('.grid .shot')).toHaveCount(3);
  for (const still of await page.locator('.grid .still').all()) {
    await expect(still).toHaveAttribute('data-state', 'failed');
    await expect(still.getByRole('img')).toContainText(SEEK_MISSING);
  }
  // The batch can carry it too.
  await expect(page.getByLabel('Include contract issues')).toBeVisible();
});
