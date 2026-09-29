import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

// These tests save comments, so they run against their own server and temp project (playwright.config.ts)
// and in order: each one builds on the pins the ones before it saved.
const PINS_SERVER = 'http://localhost:4398';
const PAGE_WIDTH = 1920;
const COMMENTS_API = `${PINS_SERVER}/api/reels/product-showreel/versions/2/comments`;

test.use({ baseURL: PINS_SERVER });
test.describe.configure({ mode: 'serial' });

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SavedComment {
  number: number;
  text: string;
  pin: { shot: string; time: number; x: number; y: number; element: string | null };
}

const intersects = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const inside = (inner: Box, outer: Box): boolean =>
  inner.x >= outer.x - 0.5 &&
  inner.y >= outer.y - 0.5 &&
  inner.x + inner.width <= outer.x + outer.width + 0.5 &&
  inner.y + inner.height <= outer.y + outer.height + 0.5;

const shotButton = (page: Page, name: string): Locator => page.locator('.grid').getByRole('button', { name: new RegExp(`^Shot ${name}, `) });
const dialog = (page: Page): Locator => page.getByRole('dialog');
const bigFrame = (page: Page): Locator => dialog(page).locator('.still');

async function openShot(page: Page, number: string): Promise<void> {
  await page.goto('/');
  await shotButton(page, number).click();
  await expect(dialog(page)).toBeVisible();
  await expect(bigFrame(page)).toHaveAttribute('data-state', 'ready');
  await settle(page);
}

/** The sheet scales in over 300ms; measure only once that has finished. */
async function settle(page: Page): Promise<void> {
  await page.waitForFunction(() => document.getAnimations().length === 0);
}

async function frameBox(page: Page): Promise<Box> {
  return (await bigFrame(page).boundingBox())!;
}

/** A named element's box as it appears on screen: the page box scaled and offset by the frame. */
async function elementBox(page: Page, name: string): Promise<Box> {
  const frame = await frameBox(page);
  const scale = frame.width / PAGE_WIDTH;
  const r = await page
    .frameLocator('.sheet iframe')
    .locator(`[data-el="${name}"]`)
    .first()
    .evaluate((el) => {
      const b = el.getBoundingClientRect();
      return { left: b.left, top: b.top, width: b.width, height: b.height };
    });
  return { x: frame.x + r.left * scale, y: frame.y + r.top * scale, width: r.width * scale, height: r.height * scale };
}

/** Every line of text inside a named element, as boxes on screen. */
async function textBoxes(page: Page, name: string): Promise<Box[]> {
  const frame = await frameBox(page);
  const scale = frame.width / PAGE_WIDTH;
  const rects = await page
    .frameLocator('.sheet iframe')
    .locator(`[data-el="${name}"]`)
    .first()
    .evaluate((root) => {
      const out: Array<{ left: number; top: number; width: number; height: number }> = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const b of range.getClientRects()) out.push({ left: b.left, top: b.top, width: b.width, height: b.height });
      }
      return out;
    });
  return rects.map((r) => ({ x: frame.x + r.left * scale, y: frame.y + r.top * scale, width: r.width * scale, height: r.height * scale }));
}

const centre = (b: Box): { x: number; y: number } => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

async function saved(page: Page): Promise<SavedComment[]> {
  return ((await (await page.request.get(COMMENTS_API)).json()) as { comments: SavedComment[] }).comments;
}

test('the enlarged shot fits the window and the frame is a pin cursor surface', async ({ page }) => {
  await openShot(page, '03');

  const sheet = (await dialog(page).boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(sheet.y).toBeGreaterThanOrEqual(52);
  expect(sheet.y + sheet.height).toBeLessThanOrEqual(viewport.height);
  await expect(dialog(page)).toHaveAttribute('aria-modal', 'true');
  await expect(dialog(page)).toHaveAccessibleName('03 Word slams');
  await expect(dialog(page).locator('.lbl .t')).toHaveText('03.60');
  await expect(dialog(page).locator('.hint')).toContainText('Four feature words slam in on the beat');

  await expect(dialog(page).locator('.hit')).toHaveCSS('cursor', /url\(.*\)/);
  await expect(page.locator('body')).toHaveCSS('cursor', /url\(.*\)/);
  await expect(bigFrame(page).locator('iframe')).toHaveCSS('pointer-events', 'none');
});

test('hovering a named element outlines it and puts its name beside it, never over content', async ({ page }) => {
  await openShot(page, '03');
  const frame = await frameBox(page);
  const tag = dialog(page).locator('.tag');
  await expect(tag).toHaveCount(0);

  // The inner element, which sits inside word-stack.
  const icons = await elementBox(page, 'icons-word');
  await page.mouse.move(centre(icons).x, centre(icons).y);
  await expect(tag).toHaveText('icons-word');
  const tagBox = (await tag.boundingBox())!;
  expect(intersects(tagBox, icons)).toBe(false);
  expect(inside(tagBox, frame)).toBe(true);
  for (const line of await textBoxes(page, 'word-stack')) {
    expect(intersects(tagBox, line), 'the tag covers a line of text').toBe(false);
  }

  const outline = (await dialog(page).locator('.hot').boundingBox())!;
  expect(outline.x).toBeCloseTo(icons.x, 0);
  expect(outline.y).toBeCloseTo(icons.y, 0);
  expect(outline.width).toBeCloseTo(icons.width, 0);
  expect(outline.height).toBeCloseTo(icons.height, 0);

  // The outer element, on the first line of text.
  const stack = await elementBox(page, 'word-stack');
  await page.mouse.move(stack.x + 6, stack.y + 6);
  await expect(tag).toHaveText('word-stack');
  const stackTag = (await tag.boundingBox())!;
  expect(intersects(stackTag, stack)).toBe(false);
  expect(inside(stackTag, frame)).toBe(true);

  // Empty frame: no outline, no tag.
  await page.mouse.move(frame.x + 4, frame.y + 4);
  await expect(tag).toHaveCount(0);
  await expect(dialog(page).locator('.hot')).toHaveCount(0);
});

test('clicking a named element pins a comment to it, and the number matches everywhere', async ({ page }) => {
  await openShot(page, '03');
  expect(await saved(page)).toEqual([]);
  const frame = await frameBox(page);
  const icons = await elementBox(page, 'icons-word');
  const at = centre(icons);

  await page.mouse.click(at.x, at.y);
  const input = dialog(page).getByRole('textbox', { name: 'Comment on icons-word, shot 03' });
  await expect(input).toBeFocused();
  await expect(dialog(page).locator('.hexpin.draft')).toBeVisible();

  // The input keeps off the pinned element and stays inside the frame.
  const inputBox = (await dialog(page).locator('.pop').boundingBox())!;
  expect(intersects(inputBox, icons)).toBe(false);
  expect(inside(inputBox, frame)).toBe(true);

  // A draft with no text is never saved.
  await page.keyboard.press('Enter');
  expect(await saved(page)).toEqual([]);
  await expect(input).toBeVisible();

  await input.fill('Hold ICONS a beat longer before the cut.');
  await page.keyboard.press('Enter');

  await expect(input).toHaveCount(0);
  const framePin = dialog(page).locator('.hexpin:not(.draft)');
  await expect(framePin).toHaveCount(1);
  await expect(framePin.locator('b')).toHaveText('1');

  const comments = await saved(page);
  expect(comments).toHaveLength(1);
  expect(comments[0]).toMatchObject({
    number: 1,
    text: 'Hold ICONS a beat longer before the cut.',
    pin: { shot: '03', time: 3.6, element: 'icons-word' },
  });
  expect(comments[0]!.pin.x).toBeCloseTo((at.x - frame.x) / frame.width, 2);
  expect(comments[0]!.pin.y).toBeCloseTo((at.y - frame.y) / frame.height, 2);

  // The pin on the frame sits where the click was.
  const pinBox = (await framePin.boundingBox())!;
  expect(Math.abs(centre(pinBox).x - at.x)).toBeLessThan(1.5); // positions are saved to 3 decimals
  expect(Math.abs(centre(pinBox).y - at.y)).toBeLessThan(1.5);

  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.locator('.grid .shot').nth(2).locator('.hexpin b')).toHaveText('1');
  await expect(page.locator('.grid .shot').nth(2).locator('.pins-badge')).toContainText('1');
  const card = page.locator('.clist .c');
  await expect(card).toHaveCount(1);
  await expect(card.locator('.dot')).toHaveText('1');
  await expect(card.locator('.where')).toContainText('Shot 03 · 03.60s');
  await expect(card.locator('.where .el')).toHaveText('icons-word');
  await expect(card.locator('p')).toHaveText('Hold ICONS a beat longer before the cut.');
  await expect(page.locator('.comments header .meta')).toHaveText('v2 · 1');
});

test('arrow keys step shots, and a click on empty frame pins a position only', async ({ page }) => {
  await openShot(page, '03');

  await page.keyboard.press('ArrowRight');
  await expect(dialog(page).locator('.lbl .dot')).toHaveText('04');
  await page.keyboard.press('ArrowLeft');
  await expect(dialog(page).locator('.lbl .dot')).toHaveText('03');
  for (const expected of ['04', '05', '06']) {
    await page.keyboard.press('ArrowRight');
    await expect(dialog(page).locator('.lbl .dot')).toHaveText(expected);
  }
  await page.keyboard.press('ArrowRight');
  await expect(dialog(page).locator('.lbl .dot')).toHaveText('06');
  await expect(dialog(page).locator('.hint')).toContainText('The background floods orange');
  await expect(bigFrame(page)).toHaveAttribute('data-state', 'ready');
  await expect(page.frameLocator('.sheet iframe').locator('[data-scene="cta"]')).toHaveClass(/active/);
  await settle(page);

  // Free space in the call-to-action scene: outside its one named element.
  const frame = await frameBox(page);
  const cta = await elementBox(page, 'cta');
  const point = { x: frame.x + frame.width * 0.1, y: frame.y + frame.height * 0.12 };
  expect(intersects({ x: point.x, y: point.y, width: 1, height: 1 }, cta)).toBe(false);

  await page.mouse.move(point.x, point.y);
  await expect(dialog(page).locator('.tag')).toHaveCount(0);
  await page.mouse.click(point.x, point.y);
  const input = dialog(page).getByRole('textbox', { name: 'Comment on this position, shot 06' });
  await expect(input).toBeFocused();
  await input.fill('Too much empty orange up here.');
  await page.keyboard.press('Enter');
  await expect(input).toHaveCount(0);

  const comments = await saved(page);
  expect(comments.map((c) => [c.number, c.pin.shot, c.pin.element])).toEqual([
    [1, '03', 'icons-word'],
    [2, '06', null],
  ]);
  expect(comments[1]!.pin.x).toBeCloseTo(0.1, 2);
  expect(comments[1]!.pin.y).toBeCloseTo(0.12, 2);
  await expect(dialog(page).locator('.hexpin:not(.draft) b')).toHaveText('2');

  await page.keyboard.press('Escape');
  const cards = page.locator('.clist .c');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(1).locator('.dot')).toHaveText('2');
  await expect(cards.nth(1).locator('.where')).toContainText('Shot 06 · 12.20s');
  await expect(cards.nth(1).locator('.where')).toContainText('position');
  await expect(cards.nth(1).locator('.where .el')).toHaveCount(0);
  await expect(page.locator('.grid .shot').nth(5).locator('.hexpin b')).toHaveText('2');
});

test('pins are still there after a reload, with the same numbers', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.clist .c')).toHaveCount(2);
  await expect(page.locator('.clist .c .dot')).toHaveText(['1', '2']);
  await expect(page.locator('.comments header .meta')).toHaveText('v2 · 2');
  await expect(page.locator('.grid .shot').nth(2).locator('.hexpin b')).toHaveText('1');
  await expect(page.locator('.grid .shot').nth(5).locator('.hexpin b')).toHaveText('2');
  await expect(page.locator('.grid .shot').nth(0).locator('.hexpin')).toHaveCount(0);

  await shotButton(page, '03').click();
  await expect(dialog(page).locator('.hexpin:not(.draft) b')).toHaveText('1');
});

test('Esc, Close and the scrim return to the grid, and focus goes back to the shot button', async ({ page }) => {
  await page.goto('/');

  const button = shotButton(page, '02');
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(dialog(page).locator('.lbl .dot')).toHaveText('03');
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  await expect(shotButton(page, '03')).toBeFocused();

  await shotButton(page, '01').click();
  await expect(dialog(page)).toBeVisible();
  await dialog(page).getByRole('button', { name: /^Close/ }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(shotButton(page, '01')).toBeFocused();

  await shotButton(page, '04').click();
  await expect(dialog(page)).toBeVisible();
  await page.mouse.click(4, 400);
  await expect(dialog(page)).toHaveCount(0);
  await expect(shotButton(page, '04')).toBeFocused();
});

test('Tab stays inside the open sheet', async ({ page }) => {
  await openShot(page, '05');
  await expect(dialog(page).getByRole('button', { name: 'agent-grid' })).toBeVisible();

  const inSheet = () => page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null);
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    expect(await inSheet(), `Tab ${i + 1} left the sheet`).toBe(true);
  }
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await inSheet(), `Shift+Tab ${i + 1} left the sheet`).toBe(true);
  }
});

test('the whole pinning path works from the keyboard alone', async ({ page }) => {
  await page.goto('/');
  const before = await saved(page);

  await shotButton(page, '05').focus();
  await page.keyboard.press('Enter');
  await expect(dialog(page)).toBeVisible();
  const chip = dialog(page).getByRole('button', { name: 'agent-grid' });
  await expect(chip).toBeVisible();

  await page.keyboard.press('Tab');
  await expect(dialog(page).getByRole('button', { name: /^Close/ })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(chip).toBeFocused();
  await page.keyboard.press('Enter');

  const input = dialog(page).getByRole('textbox', { name: 'Comment on agent-grid, shot 05' });
  await expect(input).toBeFocused();
  await page.keyboard.type('First agent should be orange from the start.');
  await page.keyboard.press('Enter');
  await expect(input).toHaveCount(0);

  const after = await saved(page);
  expect(after).toHaveLength(before.length + 1);
  const added = after.find((c) => c.text === 'First agent should be orange from the start.')!;
  expect(added.pin).toMatchObject({ shot: '05', time: 8.4, element: 'agent-grid' });
  expect(added.pin.x).toBeGreaterThan(0.2);
  expect(added.pin.x).toBeLessThan(0.8);
  await expect(dialog(page).locator('.hexpin:not(.draft) b')).toHaveText(String(added.number));

  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  await expect(shotButton(page, '05')).toBeFocused();
  await expect(page.locator('.grid .shot').nth(4).locator('.hexpin b')).toHaveText(String(added.number));
  await expect(page.locator('.clist .c .dot')).toHaveText(after.map((c) => String(c.number)));
});

test('the comments API refuses bad requests with clear statuses', async ({ request }) => {
  const pin = { shot: '02', x: 0.5, y: 0.5, element: null };
  const count = async () => ((await (await request.get(COMMENTS_API)).json()) as { comments: unknown[] }).comments.length;
  const before = await count();

  const badJson = await request.post(COMMENTS_API, { headers: { 'content-type': 'application/json' }, data: Buffer.from('{ nope') });
  expect(badJson.status()).toBe(400);
  expect((await request.post(COMMENTS_API, { data: { pin, text: '   ' } })).status()).toBe(422);
  expect((await request.post(COMMENTS_API, { data: { pin: { ...pin, shot: '99' }, text: 'x' } })).status()).toBe(422);
  expect((await request.post(COMMENTS_API, { data: { pin, text: 'x'.repeat(40_000) } })).status()).toBe(413);
  expect((await request.post(`${PINS_SERVER}/api/reels/nope/versions/2/comments`, { data: { pin, text: 'x' } })).status()).toBe(404);
  expect((await request.put(COMMENTS_API, { data: {} })).status()).toBe(405);

  expect(await count()).toBe(before);
});

test('the keyboard control can also pin the frame centre as a position only', async ({ page }) => {
  await openShot(page, '01');
  const before = await saved(page);

  await dialog(page).getByRole('button', { name: 'Frame centre (position only)' }).click();
  const input = dialog(page).getByRole('textbox', { name: 'Comment on this position, shot 01' });
  await expect(input).toBeFocused();
  await input.fill('Centre it more.');
  await page.keyboard.press('Enter');
  await expect(input).toHaveCount(0);

  const after = await saved(page);
  expect(after).toHaveLength(before.length + 1);
  const added = after.find((c) => c.text === 'Centre it more.')!;
  expect(added).toMatchObject({ number: 1, pin: { shot: '01', element: null, x: 0.5, y: 0.5 } });
  // Adding a pin on an earlier shot renumbers the later ones, on the frame and in the panel alike.
  expect(after.map((c) => c.number)).toEqual(after.map((_, i) => i + 1));
  await page.keyboard.press('Escape');
  await expect(page.locator('.clist .c .dot')).toHaveText(after.map((c) => String(c.number)));
  await expect(page.locator('.grid .shot').nth(2).locator('.hexpin b')).toHaveText('2');
});

test('two pins on one shot sit side by side in the Pins lane at that shot start, and open it', async ({ page }) => {
  await openShot(page, '02');
  const before = await saved(page);
  expect(before.filter((c) => c.pin.shot === '02')).toHaveLength(0);

  for (const text of ['Lane pin one.', 'Lane pin two.']) {
    await dialog(page).getByRole('button', { name: 'Frame centre (position only)' }).click();
    const input = dialog(page).getByRole('textbox', { name: 'Comment on this position, shot 02' });
    await expect(input).toBeFocused();
    await input.fill(text);
    await page.keyboard.press('Enter');
    await expect(input).toHaveCount(0);
  }
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);

  const after = await saved(page);
  expect(after).toHaveLength(before.length + 2);
  const onShot = after.filter((c) => c.pin.shot === '02');
  expect(onShot.map((c) => c.text)).toEqual(['Lane pin one.', 'Lane pin two.']);

  // One lane pin per comment, numbered like the comments panel.
  const lanePins = page.locator('.pins-lane .lpin');
  await expect(lanePins).toHaveCount(after.length);
  await expect(lanePins.locator('b')).toHaveText(after.map((c) => String(c.number)));
  await expect(page.locator('.clist .c .dot')).toHaveText(after.map((c) => String(c.number)));

  const first = page.getByRole('button', { name: `Pin ${onShot[0]!.number}, shot 02: Lane pin one.` });
  const second = page.getByRole('button', { name: `Pin ${onShot[1]!.number}, shot 02: Lane pin two.` });
  await expect(first.locator('b')).toHaveText(String(onShot[0]!.number));
  await expect(second.locator('b')).toHaveText(String(onShot[1]!.number));

  const lane = (await page.locator('.pins-lane').boundingBox())!;
  const a = (await first.boundingBox())!;
  const b = (await second.boundingBox())!;
  const shotStart = 1.8;
  const reelDuration = 15;
  expect(Math.abs(a.x - (lane.x + (shotStart / reelDuration) * lane.width + 4))).toBeLessThan(1.5);
  expect(Math.abs(b.x - a.x - 22)).toBeLessThan(0.5);
  expect(Math.abs(b.y - a.y)).toBeLessThan(0.5);

  // The segment is marked as holding pins, and a lane pin opens its shot.
  await expect(page.locator('.shots-lane .seg.has')).toHaveCount(new Set(after.map((c) => c.pin.shot)).size);
  await expect(page.getByRole('button', { name: /^Shot 02, .*01\.80 to 03\.60$/ })).toHaveClass(/has/);
  await second.click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toHaveAccessibleName('02 Logo lockup');
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  await expect(second).toBeFocused();
});
