import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

// Edits, deletes and notes change what the server holds, so this has its own server and temp project
// (playwright.config.ts) and runs in order: each test builds on the comments the ones before it left.
const EDITING_SERVER = 'http://localhost:4394';
const PAGE_WIDTH = 1920;
const COMMENTS_API = `${EDITING_SERVER}/api/reels/product-showreel/versions/2/comments`;
const EMPTY_TEXT = 'No comments on v2 yet. Enlarge a shot and click the frame to pin one.';

test.use({ baseURL: EDITING_SERVER, permissions: ['clipboard-read', 'clipboard-write'] });
test.describe.configure({ mode: 'serial' });

/** The clipboard hands back the platform's line endings. */
const clipboardText = async (page: Page): Promise<string> =>
  (await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n');
const dialog = (page: Page): Locator => page.getByRole('dialog');
const cards = (page: Page): Locator => page.locator('.comments .c');
const pin = (scope: Locator, name: string): Locator => scope.getByRole('img', { name, exact: true });

async function openShot(page: Page, number: string): Promise<void> {
  await page.locator('.grid').getByRole('button', { name: new RegExp(`^Shot ${number}, `) }).click();
  await settleSheet(page);
}

async function settleSheet(page: Page): Promise<void> {
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

async function savedComments(page: Page): Promise<Array<{ number: number; text: string }>> {
  const res = await page.request.get(COMMENTS_API);
  return ((await res.json()) as { comments: Array<{ number: number; text: string }> }).comments;
}

test('an empty version says how to pin a comment', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.comments .empty')).toHaveText(EMPTY_TEXT);
  await expect(page.locator('.copy .btn')).toBeDisabled();
});

test('pin two comments, edit the first, and the edit survives a reload', async ({ page }) => {
  await page.goto('/');
  await openShot(page, '03');
  const at = await elementCentre(page, 'icons-word');
  await page.mouse.click(at.x, at.y);
  await dialog(page).getByRole('textbox').fill('First comment');
  await page.keyboard.press('Enter');
  await expect(dialog(page).getByRole('textbox')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);

  await openShot(page, '06');
  await dialog(page).getByRole('button', { name: /Frame centre/ }).click();
  await dialog(page).getByRole('textbox').fill('Second comment');
  await page.keyboard.press('Enter');
  await expect(dialog(page).getByRole('textbox')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(cards(page)).toHaveCount(2);

  await page.getByRole('button', { name: 'Edit comment 1' }).click();
  const field = page.getByRole('textbox', { name: 'Edit comment 1' });
  await expect(field).toBeFocused();
  await field.fill('First comment, edited');
  await field.press('Enter');

  await expect(cards(page).first().locator('p')).toHaveText('First comment, edited');
  await expect(page.getByRole('textbox', { name: 'Edit comment 1' })).toHaveCount(0);
  await page.reload();
  await expect(cards(page).first().locator('p')).toHaveText('First comment, edited');
  expect((await savedComments(page)).map((c) => c.text)).toEqual(['First comment, edited', 'Second comment']);
});

test('Escape while editing cancels the edit and keeps the text', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Edit comment 2' }).click();
  const field = page.getByRole('textbox', { name: 'Edit comment 2' });
  await field.fill('Never saved');
  await field.press('Escape');

  await expect(cards(page).nth(1).locator('p')).toHaveText('Second comment');
  await expect(page.getByRole('button', { name: 'Edit comment 2' })).toBeFocused();
});

test('delete renumbers everywhere, and Undo brings the comment back', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Delete comment 1' }).click();

  await expect(page.locator('.undo')).toContainText('Comment 1 deleted');
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first().locator('.dot')).toHaveText('1');
  await expect(cards(page).first().locator('p')).toHaveText('Second comment');
  await expect(pin(page.locator('.grid'), 'Comment 1')).toHaveCount(1);
  await expect(pin(page.locator('.grid'), 'Comment 2')).toHaveCount(0);
  await expect(page.locator('.pins-lane .lpin')).toHaveCount(1);
  await expect(page.locator('.pins-lane .lpin')).toHaveAccessibleName('Pin 1, shot 06: Second comment');
  await openShot(page, '06');
  await expect(pin(dialog(page), 'Comment 1')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);

  // Put the first comment back with a fresh pin on the earlier shot; the Undo test follows.
  await openShot(page, '03');
  const at = await elementCentre(page, 'icons-word');
  await page.mouse.click(at.x, at.y);
  await dialog(page).getByRole('textbox').fill('First comment, edited');
  await page.keyboard.press('Enter');
  await expect(dialog(page).getByRole('textbox')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(cards(page)).toHaveCount(2);
  await expect(cards(page).first().locator('.dot')).toHaveText('1');
  await expect(cards(page).nth(1).locator('.dot')).toHaveText('2');
});

test('Undo restores a deleted comment with its pin and its natural number', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Delete comment 1' }).click();
  await expect(page.locator('.undo')).toContainText('Comment 1 deleted');
  await expect(cards(page)).toHaveCount(1);

  await page.getByRole('button', { name: 'Undo' }).click();

  await expect(cards(page)).toHaveCount(2);
  await expect(cards(page).first().locator('.dot')).toHaveText('1');
  await expect(cards(page).first().locator('p')).toHaveText('First comment, edited');
  await expect(cards(page).first()).toContainText('icons-word');
  await expect(page.locator('.pins-lane .lpin')).toHaveCount(2);
  await expect(page.locator('.undo')).toBeEmpty();
});

test('Escape drops a pin being placed and keeps the sheet; the next Escape closes it', async ({ page }) => {
  await page.goto('/');
  await openShot(page, '03');
  const before = await savedComments(page);

  const frame = (await dialog(page).locator('.still').boundingBox())!;
  await page.mouse.click(frame.x + frame.width * 0.04, frame.y + frame.height * 0.94);
  await expect(dialog(page).getByRole('textbox')).toBeVisible();
  await dialog(page).getByRole('textbox').fill('Half a thought');
  await page.keyboard.press('Escape');

  await expect(dialog(page).getByRole('textbox')).toHaveCount(0);
  await expect(dialog(page).locator('.hexpin.draft')).toHaveCount(0);
  await expect(dialog(page)).toBeVisible();
  expect(await savedComments(page)).toEqual(before);

  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
});

test('the Cancel control drops a pin being placed', async ({ page }) => {
  await page.goto('/');
  await openShot(page, '03');
  await dialog(page).getByRole('button', { name: /Frame centre/ }).click();
  await expect(dialog(page).getByRole('textbox')).toBeVisible();

  await dialog(page).getByRole('button', { name: 'Cancel' }).click();

  await expect(dialog(page).getByRole('textbox')).toHaveCount(0);
  await expect(dialog(page).locator('.hexpin.draft')).toHaveCount(0);
  await expect(dialog(page)).toBeVisible();
  expect(await savedComments(page)).toHaveLength(2);
});

test('clicking a comment opens its shot with its pin marked', async ({ page }) => {
  await page.goto('/');
  const open = page.getByRole('button', { name: 'Open comment 2 on shot 06, position' });
  await open.click();
  await settleSheet(page);

  await expect(dialog(page)).toContainText('06');
  await expect(pin(dialog(page), 'Comment 2, selected')).toBeVisible();
  await expect(dialog(page).locator('.hexpin.marked')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  await expect(open).toBeFocused();

  await page.getByRole('button', { name: /^Open comment 1 on shot 03/ }).click();
  await settleSheet(page);
  await expect(pin(dialog(page), 'Comment 1, selected')).toBeVisible();
  await expect(dialog(page).locator('.hexpin.marked')).toHaveCount(1);
});

test('a note on the whole reel saves, survives a reload, and is in the copied batch', async ({ page }) => {
  await page.goto('/');
  const note = page.getByRole('textbox', { name: 'Note on the whole reel' });
  await expect(note).toHaveAttribute('placeholder', 'Feedback that belongs to no single moment…');

  await note.fill('Overall: slow the whole reel down.');
  await expect(page.locator('.note-state')).toHaveText('Saved');
  await page.reload();
  await expect(note).toHaveValue('Overall: slow the whole reel down.');

  const copy = page.locator('.copy .btn');
  await expect(copy).toHaveAccessibleName('Copy all comments, 2, and the reel note');
  await copy.click();
  await expect(copy).toHaveText('Copied');
  const clipboard = await clipboardText(page);
  expect(clipboard).toContain('Notes\n- Overall: slow the whole reel down.');
  expect(clipboard).toContain('1. Shot 03, 03.60s, icons-word: First comment, edited');
});

test('a note typed and copied at once is saved before the batch is written', async ({ page }) => {
  await page.goto('/');
  const note = page.getByRole('textbox', { name: 'Note on the whole reel' });
  await note.fill('Typed and copied right away.');
  await page.locator('.copy .btn').click();

  await expect(page.locator('.copy .btn')).toHaveText('Copied');
  expect(await clipboardText(page)).toContain('Notes\n- Typed and copied right away.');
});
