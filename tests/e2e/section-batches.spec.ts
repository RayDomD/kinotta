import { cpSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

// Copies section batches and adds a version folder to its temp project while the editor is open, so it has its own
// server on the footage sample (playwright.config.ts) and runs in order.
const BATCH_SERVER = 'http://localhost:4392';
const PROJECT_PATH_FILE = join(tmpdir(), 'kinotta-e2e-section-batches-project.txt');
const REEL = 'founder-talk';
const SECTION_FILE = `reels/${REEL}/v1/comments-cold-open.json`;

test.use({ baseURL: BATCH_SERVER, permissions: ['clipboard-read', 'clipboard-write'] });
test.describe.configure({ mode: 'serial' });

const dialog = (page: Page): Locator => page.getByRole('dialog');
const copyButton = (page: Page): Locator => page.locator('.copy .btn');
const sectionButtons = (page: Page): Locator => page.getByRole('navigation', { name: 'Sections' }).getByRole('button');
const versionButtons = (page: Page): Locator => page.getByRole('navigation', { name: 'Versions' }).getByRole('button');
const cards = (page: Page): Locator => page.locator('.clist .c');

const projectDir = (): string => readFileSync(PROJECT_PATH_FILE, 'utf8');

/** Opens a shot from whichever section holds it (01 and 02 are section 1, 03 and 04 section 2). */
async function openShot(page: Page, number: string, section: number): Promise<void> {
  await page.goto('/');
  await sectionButtons(page).nth(section - 1).click();
  await page.locator('.grid .shot').filter({ has: page.getByRole('button', { name: new RegExp(`^Shot ${number},`) }) }).locator('.open').click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).locator('.still')).toHaveAttribute('data-state', 'ready');
  await page.waitForFunction(() => document.getAnimations().length === 0);
}

async function pin(page: Page, number: string, section: number, at: { x: number; y: number }, text: string): Promise<void> {
  await openShot(page, number, section);
  const frame = (await dialog(page).locator('.still').boundingBox())!;
  await page.mouse.click(frame.x + frame.width * at.x, frame.y + frame.height * at.y);
  await dialog(page).getByRole('textbox').fill(text);
  await page.keyboard.press('Enter');
  await expect(dialog(page).getByRole('textbox')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
}

/** An agent writes v2: the page first, shots.json last, and the folder appears in one step. */
function writeVersionTwo(): void {
  const reel = join(projectDir(), 'reels', REEL);
  const building = join(reel, 'building-v2');
  rmSync(building, { recursive: true, force: true });
  cpSync(join(reel, 'v1'), building, { recursive: true });
  rmSync(join(building, 'comments-cold-open.json'), { force: true });
  const page = readFileSync(join(building, 'index.html'), 'utf8');
  writeFileSync(join(building, 'index.html'), page.replace('data-el="document"', 'data-el="document" title="the shared document"'));
  const shotsFile = join(building, 'shots.json');
  const shots = JSON.parse(readFileSync(shotsFile, 'utf8')) as { shots: Array<{ number: string; title: string }> };
  shots.shots.find((s) => s.number === '01')!.title = 'Two laptops, one file';
  writeFileSync(shotsFile, JSON.stringify(shots, null, 2));
  renameSync(building, join(reel, 'v2'));
}

test('copying a section hands off only that section, and marks it waiting', async ({ page }) => {
  await pin(page, '01', 1, { x: 0.3, y: 0.4 }, 'Slide the laptops in faster.');
  await pin(page, '03', 2, { x: 0.3, y: 0.4 }, 'Hold the grey-out longer.');
  await pin(page, '04', 2, { x: 0.7, y: 0.6 }, 'Merge box needs a beat.');
  await page.goto('/');

  await expect(copyButton(page)).toHaveAccessibleName('Copy section 01 comments, 1');
  await expect(copyButton(page)).toContainText('Copy section 01 comments');
  await expect(sectionButtons(page).nth(0).getByText('Waiting')).toHaveCount(0);
  await copyButton(page).click();

  await expect(copyButton(page)).toHaveText('Copied');
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain('Kinotta comments: Founder talk: going local-first, v1, section 01 Cold open');
  expect(clipboard).toContain('Slide the laptops in faster.');
  expect(clipboard).not.toContain('grey-out');
  expect(clipboard).not.toContain('Merge box');
  const saved = JSON.parse(readFileSync(join(projectDir(), SECTION_FILE), 'utf8')) as { section: string; comments: Array<{ text: string }> };
  expect(saved.section).toBe('cold-open');
  expect(saved.comments.map((c) => c.text)).toEqual(['Slide the laptops in faster.']);

  await expect(sectionButtons(page).nth(0).getByText('Waiting')).toBeVisible();
  await expect(sectionButtons(page).nth(1).getByText('Waiting')).toHaveCount(0);
  await expect(page.locator('.head .waiting')).toHaveText('Waiting');
});

test('a new version that changes section 01 takes the unsent comments of both sections', async ({ page }) => {
  // A second comment in section 01 that is never copied, so it moves with its moment even though the section changed.
  await pin(page, '02', 1, { x: 0.5, y: 0.5 }, 'Unsent in section one.');
  await page.goto('/');
  await expect(versionButtons(page)).toHaveText(['v1now']);

  writeVersionTwo();

  await expect(page.locator('.notice')).toContainText('v2 is ready.');
  await page.getByRole('button', { name: 'Open v2' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Cold open');
  await expect(versionButtons(page)).toHaveText(['v1storyboard', 'v2now · changed 01']);
  await expect(versionButtons(page).nth(1)).toHaveAttribute('aria-current', 'true');
  await expect(sectionButtons(page).nth(0).getByText('Waiting')).toHaveCount(0);
  await expect(page.locator('.comments header .meta')).toHaveText('v2 · section 01 · 1');
  await expect(cards(page).locator('p')).toHaveText(['Unsent in section one.']);

  await sectionButtons(page).nth(1).click();
  await expect(page.locator('.comments header .meta')).toHaveText('v2 · section 02 · 2');
  await expect(cards(page)).toHaveCount(2);
  await expect(cards(page).locator('p')).toHaveText(['Hold the grey-out longer.', 'Merge box needs a beat.']);
  await expect(copyButton(page)).toHaveAccessibleName('Copy section 02 comments, 2');
});

test('v1 stays as it was: sent and frozen, and the unsent ones say they moved', async ({ page }) => {
  await page.goto('/');
  await versionButtons(page).nth(0).click();

  await expect(versionButtons(page).nth(0)).toHaveAttribute('aria-current', 'true');
  await expect(copyButton(page)).toBeDisabled();
  await expect(sectionButtons(page).nth(0).getByText('Waiting')).toBeVisible();

  await expect(cards(page)).toHaveCount(2);
  await expect(cards(page).nth(0)).toContainText('Slide the laptops in faster.');
  await expect(cards(page).nth(0).locator('.carry-state')).toHaveText('Sent to your agent');
  await expect(cards(page).nth(1)).toContainText('Unsent in section one.');
  await expect(cards(page).nth(1).locator('.carry-state')).toHaveText('Moved to v2');
  await expect(cards(page).nth(1).getByRole('button', { name: /^Edit/ })).toHaveCount(0);

  await sectionButtons(page).nth(1).click();
  await expect(cards(page).locator('.carry-state')).toHaveText(['Moved to v2', 'Moved to v2']);

  // The batch file the copy wrote is untouched.
  const saved = JSON.parse(readFileSync(join(projectDir(), SECTION_FILE), 'utf8')) as { comments: unknown[] };
  expect(saved.comments).toHaveLength(1);
});
