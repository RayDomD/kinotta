import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

// Saves comments and batches, so it has its own server and temp project (playwright.config.ts), and runs in order.
const BATCH_SERVER = 'http://localhost:4397';
const PROJECT_PATH_FILE = join(tmpdir(), 'kinotta-e2e-batch-project.txt');
const PAGE_WIDTH = 1920;
const BATCH_FILE = 'reels/product-showreel/v2/comments.json';

test.use({ baseURL: BATCH_SERVER, permissions: ['clipboard-read', 'clipboard-write'] });
test.describe.configure({ mode: 'serial' });

const dialog = (page: Page): Locator => page.getByRole('dialog');
const copyButton = (page: Page): Locator => page.locator('.copy .btn');

interface BatchFile {
  reel: string;
  version: number;
  comments: Array<{ number: number; shot: string; time: number; element: string | null; text: string }>;
}

function batchOnDisk(): BatchFile {
  const project = readFileSync(PROJECT_PATH_FILE, 'utf8');
  return JSON.parse(readFileSync(join(project, BATCH_FILE), 'utf8')) as BatchFile;
}

async function openShot(page: Page, number: string): Promise<void> {
  await page.goto('/');
  await page.locator('.grid').getByRole('button', { name: new RegExp(`^Shot ${number}, `) }).click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).locator('.still')).toHaveAttribute('data-state', 'ready');
  // The sheet scales in over 300ms; click only once that has finished.
  await page.waitForFunction(() => document.getAnimations().length === 0);
}

/** Centre of a named element as it appears on screen: the page box scaled and offset by the frame. */
async function elementCentre(page: Page, name: string): Promise<{ x: number; y: number }> {
  const frame = (await dialog(page).locator('.still').boundingBox())!;
  const scale = frame.width / PAGE_WIDTH;
  const r = await page
    .frameLocator('.sheet iframe')
    .locator(`[data-el="${name}"]`)
    .first()
    .evaluate((el) => {
      const b = el.getBoundingClientRect();
      return { left: b.left, top: b.top, width: b.width, height: b.height };
    });
  return { x: frame.x + (r.left + r.width / 2) * scale, y: frame.y + (r.top + r.height / 2) * scale };
}

async function pinAndComment(page: Page, at: { x: number; y: number }, text: string): Promise<void> {
  await page.mouse.click(at.x, at.y);
  await dialog(page).getByRole('textbox').fill(text);
  await page.keyboard.press('Enter');
  await expect(dialog(page).getByRole('textbox')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
}

test('a version with no comments cannot be copied', async ({ page }) => {
  await page.goto('/');

  await expect(copyButton(page)).toBeDisabled();
  await expect(copyButton(page)).toHaveAccessibleName('Copy all comments, none yet');
});

test('pin a named element, comment, copy: the button confirms, the clipboard and the batch file agree', async ({ page }) => {
  const text = 'Hold ICONS a beat longer before the cut.';
  await openShot(page, '03');
  await pinAndComment(page, await elementCentre(page, 'icons-word'), text);

  await expect(copyButton(page)).toBeEnabled();
  await expect(copyButton(page).locator('.count')).toHaveText('1');
  await copyButton(page).click();

  await expect(copyButton(page)).toHaveText('Copied');
  await expect(page.locator('.copy [role="status"]')).toHaveText('Copied 1 comment for your agent');
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain('Kinotta comments: Product showreel, v2');
  expect(clipboard).toContain(`Saved as ${BATCH_FILE}`);
  expect(clipboard).toContain(`1. Shot 03, 03.60s, icons-word: ${text}`);

  const batch = batchOnDisk();
  expect(batch).toMatchObject({ reel: 'product-showreel', version: 2 });
  expect(batch.comments).toHaveLength(1);
  expect(batch.comments[0]).toMatchObject({ number: 1, shot: '03', time: 3.6, element: 'icons-word', text });

  // The confirmation is brief, then the button stays lit as sent and asks to copy again on hover. Focus never leaves the button.
  await expect(copyButton(page)).toHaveClass(/\bsent\b/);
  await expect(copyButton(page)).toHaveAccessibleName(/^Copy all comments again, sent at \d\d:\d\d, 1$/);
  await expect(copyButton(page).locator('.sent-ask')).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(copyButton(page).locator('.sent-rest')).toBeVisible();
  await expect(copyButton(page).locator('.sent-ask')).toBeHidden();
  await expect(copyButton(page)).toBeEnabled();
  await expect(copyButton(page)).toBeFocused();
});

test('copying again after a new comment overwrites the batch file', async ({ page }) => {
  await openShot(page, '03');
  const frame = (await dialog(page).locator('.still').boundingBox())!;
  await pinAndComment(page, { x: frame.x + frame.width * 0.04, y: frame.y + frame.height * 0.94 }, 'Too empty down here.');

  await expect(copyButton(page).locator('.count')).toHaveText('2');
  await copyButton(page).click();
  await expect(copyButton(page)).toHaveText('Copied');

  const batch = batchOnDisk();
  expect(batch.comments).toHaveLength(2);
  expect(batch.comments.map((c) => c.text)).toContain('Too empty down here.');
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain('2. Shot 03, 03.60s,');
  expect(clipboard).toContain('Too empty down here.');
});

test('C copies the batch from the keyboard, but not while typing or with a shot open', async ({ page }) => {
  await page.goto('/');
  await expect(copyButton(page).locator('.count')).toHaveText('2');
  await expect(copyButton(page)).toHaveAttribute('aria-keyshortcuts', 'C');

  await page.getByRole('textbox', { name: /note/i }).fill('c');
  await expect(copyButton(page)).not.toHaveText('Copied');

  await openShot(page, '03');
  await page.keyboard.press('c');
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  await expect(copyButton(page)).not.toHaveClass(/\bsent\b/);

  await page.locator('h1').click();
  await page.keyboard.press('c');
  await expect(copyButton(page)).toHaveText('Copied');
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain('Too empty down here.');
});
