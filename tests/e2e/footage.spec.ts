import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

// These tests save comments, so they run against their own server on the footage sample project
// (playwright.config.ts) and in order.
const FOOTAGE_SERVER = 'http://localhost:4396';
const COMMENTS_API = `${FOOTAGE_SERVER}/api/reels/founder-talk/versions/1/comments`;
const TIME_TOLERANCE = 0.1;

test.use({ baseURL: FOOTAGE_SERVER, permissions: ['clipboard-read', 'clipboard-write'] });
test.describe.configure({ mode: 'serial' });

const SHOTS = [
  { number: '01', type: 'Cutaway', line: '“picture two people editing the same doc on a plane”' },
  { number: '02', type: 'Panel', line: '“and every edit they make is a conflict waiting to happen”' },
  { number: '03', type: 'Panel', line: '“the lazy answer is last write wins, and you lose work”' },
  { number: '04', type: 'Cutaway', line: '“what you actually want is for both edits to survive”' },
];

/** The grid shows one section at a time (T12): shots 01 and 02 are section 1, 03 and 04 section 2. */
const SECTION_OF: Record<string, number> = { '01': 1, '02': 1, '03': 2, '04': 2 };

const card = (page: Page, number: string): Locator =>
  page.locator('.grid .shot').filter({ has: page.getByRole('button', { name: new RegExp(`^Shot ${number},`) }) });

/** Switches the grid, through the rail, to the section that holds this shot. */
async function showShot(page: Page, number: string): Promise<void> {
  const button = page.getByRole('navigation', { name: 'Sections' }).getByRole('button').nth(SECTION_OF[number]! - 1);
  await button.click();
  await expect(button).toHaveAttribute('aria-current', 'true');
}
const dialog = (page: Page): Locator => page.getByRole('dialog');

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function videoState(still: Locator): Promise<{ time: number; ready: number } | null> {
  return still.locator('video').evaluate((v: HTMLVideoElement) => ({ time: v.currentTime, ready: v.readyState }));
}

/** The colour of a small patch of a screenshot, given as fractions of the still, read back through a canvas. */
async function patchColour(page: Page, still: Locator, fx: number, fy: number): Promise<number[]> {
  const png = (await still.screenshot()).toString('base64');
  return page.evaluate(
    async ({ png, fx, fy }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${png}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const patch = 6;
      const data = ctx.getImageData(Math.round(img.width * fx), Math.round(img.height * fy), patch, patch).data;
      const sum = [0, 0, 0];
      for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) sum[c]! += data[i + c]!;
      return sum.map((s) => Math.round(s / (data.length / 4)));
    },
    { png, fx, fy },
  );
}

/** The footage video's own pixel at the same fraction, drawn through a canvas. */
async function footageColour(still: Locator, fx: number, fy: number): Promise<number[]> {
  return still.locator('video').evaluate(
    (v: HTMLVideoElement, { fx, fy }) => {
      const canvas = document.createElement('canvas');
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(v, 0, 0);
      const patch = 6;
      const data = ctx.getImageData(Math.round(v.videoWidth * fx), Math.round(v.videoHeight * fy), patch, patch).data;
      const sum = [0, 0, 0];
      for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) sum[c]! += data[i + c]!;
      return sum.map((s) => Math.round(s / (data.length / 4)));
    },
    { fx, fy },
  );
}

const distance = (a: number[], b: number[]): number => Math.max(...a.map((v, i) => Math.abs(v - b[i]!)));

async function openShot(page: Page, number: string): Promise<void> {
  await page.goto('/');
  await showShot(page, number);
  await card(page, number).locator('.open').click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).locator('.still')).toHaveAttribute('data-state', 'ready');
  await page.waitForFunction(() => document.getAnimations().length === 0);
}

test('each shot shows its type and the line it covers, between the title and the description', async ({ page }) => {
  await page.goto('/');

  for (const shot of SHOTS) {
    await showShot(page, shot.number);
    const el = card(page, shot.number);
    await expect(el.locator('.lbl .kind')).toHaveText(shot.type);
    await expect(el.locator('.line')).toHaveText(shot.line);
    const order = await el.evaluate((node) => [...node.children].map((c) => c.className.split(' ')[0]));
    expect(order.indexOf('lbl')).toBeLessThan(order.indexOf('line'));
    expect(order.indexOf('line')).toBeLessThan(order.indexOf('desc'));
  }
});

test('a panel still draws the clip over the footage frame at that second', async ({ page }) => {
  await page.goto('/');

  for (const [number, time] of [['02', 3.2], ['03', 6.2]] as const) {
    await showShot(page, number);
    const still = card(page, number).locator('.still');
    await expect(still).toHaveAttribute('data-state', 'ready');
    await expect(still.locator('video')).toHaveAttribute('data-footage', 'ready');
    const state = (await videoState(still))!;
    expect(Math.abs(state.time - time)).toBeLessThan(TIME_TOLERANCE);
    expect(state.ready).toBeGreaterThanOrEqual(2);

    const video = still.locator('video');
    await expect(video).toHaveAttribute('preload', 'auto');
    await expect(video).toHaveJSProperty('muted', true);
    await expect(video).not.toHaveAttribute('controls', /.*/);
    // The clip iframe is stacked above the footage.
    const order = await still.evaluate((el) => [...el.children].map((c) => c.tagName));
    expect(order.indexOf('VIDEO')).toBeLessThan(order.indexOf('IFRAME'));
    await expect(still.frameLocator('iframe').locator('[data-scene].active [data-el]').first()).toBeVisible();
  }
});

test('the footage shows through the transparent parts of a panel page', async ({ page }) => {
  await page.goto('/');
  const still = card(page, '02').locator('.still');
  await expect(still.locator('video')).toHaveAttribute('data-footage', 'ready');

  // The green colour bar left of centre, outside the panel (which sits at the right).
  const seen = await patchColour(page, still, 0.25, 0.5);
  const footage = await footageColour(still, 0.25, 0.5);
  expect(distance(seen, footage), `seen ${seen}, footage ${footage}`).toBeLessThan(80);
  // Not the opaque backdrop a differing color-scheme would paint behind the frame.
  const backdrops = [[255, 255, 255], [0, 0, 0]];
  for (const backdrop of backdrops) expect(distance(seen, backdrop)).toBeGreaterThan(20);

  // The panel itself is the page's own paint.
  const panel = await patchColour(page, still, 0.58, 0.2);
  expect(distance(panel, [0xf2, 0xed, 0xe4])).toBeLessThan(12);
});

test('a cutaway still is the clip alone, with no footage under it', async ({ page }) => {
  await page.goto('/');

  for (const number of ['01', '04']) {
    await showShot(page, number);
    const still = card(page, number).locator('.still');
    await expect(still).toHaveAttribute('data-state', 'ready');
    await expect(still.locator('video')).toHaveCount(0);
    await expect(still.locator('iframe')).toHaveCount(1);
  }
});

test('the enlarged panel shot shows the footage, its type and its line', async ({ page }) => {
  await openShot(page, '03');
  const still = dialog(page).locator('.still');

  await expect(still.locator('video')).toHaveAttribute('data-footage', 'ready');
  expect(Math.abs((await videoState(still))!.time - 6.2)).toBeLessThan(TIME_TOLERANCE);
  await expect(dialog(page).locator('.lbl .kind')).toHaveText('Panel');
  // The word row replaces the quoted line in the enlarged sheet (F10): one pinnable word per spoken word.
  await expect(dialog(page).locator('.line')).toHaveCount(0);
  await expect(dialog(page).locator('[data-word-row] .words [data-start]')).toHaveCount(SHOTS[2]!.line.split(' ').length);
  const seen = await patchColour(page, still, 0.25, 0.5);
  expect(distance(seen, await footageColour(still, 0.25, 0.5))).toBeLessThan(80);
});

test('the enlarged cutaway shot shows the clip alone', async ({ page }) => {
  await openShot(page, '04');

  await expect(dialog(page).locator('.still video')).toHaveCount(0);
  await expect(dialog(page).locator('.lbl .kind')).toHaveText('Cutaway');
  // The word row replaces the quoted line in the enlarged sheet (F10): one pinnable word per spoken word.
  await expect(dialog(page).locator('.line')).toHaveCount(0);
  await expect(dialog(page).locator('[data-word-row] .words [data-start]')).toHaveCount(SHOTS[3]!.line.split(' ').length);
});

interface SavedComment {
  pin: { shot: string; element: string | null; x: number; y: number };
  text: string;
}

async function saved(page: Page): Promise<SavedComment[]> {
  return ((await (await page.request.get(COMMENTS_API)).json()) as { comments: SavedComment[] }).comments;
}

async function pinAt(page: Page, at: { x: number; y: number }, text: string): Promise<void> {
  const frame = (await dialog(page).locator('.still').boundingBox()) as Box;
  await page.mouse.click(frame.x + frame.width * at.x, frame.y + frame.height * at.y);
  const input = dialog(page).getByRole('textbox');
  await input.fill(text);
  await page.keyboard.press('Enter');
  await expect(input).toHaveCount(0);
}

test('a click on the clip pins its element; a click on the footage pins a position only', async ({ page }) => {
  await openShot(page, '02');
  expect(await saved(page)).toEqual([]);

  // The panel occupies the right of the frame; its centre is well inside it.
  await pinAt(page, { x: 0.74, y: 0.45 }, 'Make the count bigger.');
  await pinAt(page, { x: 0.15, y: 0.5 }, 'Cut to the laptop sooner.');

  const comments = await saved(page);
  expect(comments).toHaveLength(2);
  expect(comments[0]!.pin).toMatchObject({ shot: '02', element: 'conflict-panel' });
  expect(comments[1]!.pin).toMatchObject({ shot: '02', element: null });
  expect(comments[1]!.pin.x).toBeCloseTo(0.15, 2);
});

test('a footage file that will not load gives a labelled placeholder, not black', async ({ page }) => {
  await page.route('**/footage/founder-talk', (route) => route.fulfill({ status: 404, body: 'gone' }));
  await page.goto('/');

  const still = card(page, '02').locator('.still');
  await expect(still.locator('.footage-failed')).toContainText('Footage unavailable');
  await expect(still.locator('video')).toHaveCount(0);
  await expect(still.locator('iframe')).toHaveCount(1);
});

// Word pins (T14). Shot 03 speaks "the lazy answer is last write wins, and you lose work" from 6.3s.
const wordButton = (page: Page, word: string): Locator => dialog(page).getByRole('button', { name: new RegExp(`^Word “${word}”`) });
const REEL_SECONDS = 12;
const LANE_PIN_OFFSET = 4;
const copyButton = (page: Page): Locator => page.locator('.copy .btn');

test('hovering a word outlines it and shows its tag below it', async ({ page }) => {
  await openShot(page, '03');
  const word = wordButton(page, 'lose');
  await word.hover();

  const tag = dialog(page).locator('.wtag:visible');
  await expect(tag).toHaveText('word “lose” · 08.65');
  await expect(word).toHaveCSS('outline-style', 'solid');
  const [wordBox, tagBox] = [(await word.boundingBox()) as Box, (await tag.boundingBox()) as Box];
  expect(tagBox.y).toBeGreaterThanOrEqual(wordBox.y + wordBox.height);
  // Context words from the neighbouring shots are muted text, not pin targets.
  await expect(dialog(page).locator('.w.ctx')).toHaveCount(2);
  await expect(dialog(page).locator('.words button')).toHaveCount(11);
});

test('clicking a word pins it: card, hex above the word and a lane pin at the word time', async ({ page }) => {
  await openShot(page, '03');
  const before = (await saved(page)).length;
  const text = 'Land this word harder.';

  await wordButton(page, 'lose').click();
  const input = dialog(page).getByRole('textbox');
  await expect(input).toBeFocused();
  // The input sits under the row, not over the words.
  const [rowBox, inputBox] = [(await dialog(page).locator('.words').boundingBox()) as Box, (await input.boundingBox()) as Box];
  expect(inputBox.y).toBeGreaterThanOrEqual(rowBox.y + rowBox.height);
  await input.fill(text);
  await page.keyboard.press('Enter');
  await expect(input).toHaveCount(0);

  expect(await saved(page)).toHaveLength(before + 1);
  const card = page.locator('.clist .c', { hasText: text });
  await expect(card.locator('.el')).toHaveText('word “lose”');
  await expect(card.locator('.num')).toHaveText('Shot 03 · 08.65s');
  const number = (await card.locator('.dot').textContent())!;

  const hex = wordButton(page, 'lose').locator('.wpin');
  await expect(hex.locator('b')).toHaveText(number);
  const [wordBox, hexBox] = [(await wordButton(page, 'lose').boundingBox()) as Box, (await hex.boundingBox()) as Box];
  expect(hexBox.y + hexBox.height).toBeLessThanOrEqual(wordBox.y + 1);

  const lane = (await page.locator('.pins-lane').boundingBox()) as Box;
  const lanePin = (await page.locator('.pins-lane .lpin', { hasText: number }).first().boundingBox()) as Box;
  expect(Math.abs(lanePin.x - lane.x - (lane.width * (8.65 / REEL_SECONDS) + LANE_PIN_OFFSET))).toBeLessThan(3);
});

test('keyboard only: tab into the words, arrow along them, pin one, and copy the batch', async ({ page }) => {
  await openShot(page, '03');
  const before = (await saved(page)).length;
  const text = 'Cut on this word.';

  for (let i = 0; i < 40 && !(await page.evaluate(() => document.activeElement?.closest('[data-word-row]') != null)); i++) {
    await page.keyboard.press('Tab');
  }
  await expect(wordButton(page, 'the')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(wordButton(page, 'answer')).toBeFocused();
  // Arrows moved along the words, not between shots.
  await expect(dialog(page).locator('.lbl .dot')).toHaveText('03');

  await page.keyboard.press('Enter');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
  await expect(dialog(page).getByRole('textbox')).toHaveCount(0);
  expect(await saved(page)).toHaveLength(before + 1);
  await expect(wordButton(page, 'answer')).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  await copyButton(page).click();
  await expect(copyButton(page)).toHaveText('Copied');
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toMatch(new RegExp(`\\d+\\. Shot 03, 06\\.80s, word “answer”: ${text}`));
});
