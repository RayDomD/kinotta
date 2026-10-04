import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

// Starting a reel runs the real build, and so does Save.
const BUILD_WAIT_MS = 30_000;
const PROJECT_FILE = join(tmpdir(), 'kinotta-e2e-snip-save-project.txt');
/** Pixels up from the bottom of the lane column: the axis row, which no button covers. */
const AXIS_INSET = 10;
/** The sample video is 12 s and the lanes open on all of it; a drag from a quarter to a half selects about 3 s. */
const DRAG_FROM = 0.25;
const DRAG_TO = 0.5;
/** A caption nobody moved: no `translate`, or the preview's zero offset (which Chrome reports as one 0px). */
const NOT_MOVED = /^(none|0px)$/;

// The footage sample with a fake transcriber, its own server (playwright.config.ts).
test.use({ baseURL: 'http://localhost:4385' });
test.describe.configure({ mode: 'serial' });

const review = (page: Page): Locator => page.getByRole('main', { name: 'Review' });
const timecode = (page: Page): Locator => review(page).getByLabel('Timecode');
const versions = (page: Page): Locator => page.getByRole('navigation', { name: 'Versions' });

async function startReel(page: Page, title: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'New reel' }).click();
  await page.getByRole('list', { name: 'Videos in the project' }).getByRole('button', { name: /media\/talk\.mp4/ }).click();
  await page.getByLabel('Reel name').fill(title);
  await page.getByRole('button', { name: 'Start reel' }).click();
  await expect(review(page).getByRole('heading', { name: title })).toBeVisible({ timeout: BUILD_WAIT_MS });
}

/** With the Snip tool on, drags along the lanes between two fractions of the reel's width and leaves a stretch selected. */
async function selectStretch(page: Page): Promise<void> {
  await review(page).getByRole('toolbar', { name: 'Edit tools' }).getByRole('button', { name: 'Snip S' }).click();
  await review(page).locator('.axis').scrollIntoViewIfNeeded();
  const plane = (await review(page).locator('.rv-plane').boundingBox())!;
  const y = plane.y + plane.height - AXIS_INSET;
  await page.mouse.move(plane.x + plane.width * DRAG_FROM, y);
  await page.mouse.down();
  await page.mouse.move(plane.x + plane.width * ((DRAG_FROM + DRAG_TO) / 2), y, { steps: 5 });
  await page.mouse.move(plane.x + plane.width * DRAG_TO, y, { steps: 5 });
  await page.mouse.up();
}

test('snip a stretch, see it in the Edits panel, and Save it as a new version', async ({ page }) => {
  await startReel(page, 'Snip talk');
  await expect(timecode(page)).toHaveText(/\/ 00:12\.0\d$/);
  await expect(versions(page)).toContainText('Saved by you');
  await expect(review(page).getByRole('toolbar', { name: 'Edit tools' })).toBeVisible();

  await selectStretch(page);
  await expect(review(page).getByRole('button', { name: /^Snip \d\.\ds$/ })).toBeVisible();
  await review(page).getByRole('button', { name: /^Snip \d\.\ds$/ }).click();

  // The operation is listed, the timeline closes over it and says how long it was, and the reel is shorter.
  const edits = page.getByRole('list', { name: 'Edits' });
  await expect(edits.getByRole('listitem')).toHaveCount(1);
  await expect(edits).toContainText(/Snipped 3\.\ds \(00:0[23]\.\d\d to 00:0[56]\.\d\d\)/);
  await expect(review(page).locator('.rv-joint span')).toHaveText(/^SNIP −3\.\ds$/);
  await expect(timecode(page)).toHaveText(/\/ 00:0[89]\.\d\d$/);
  await expect(review(page).locator('.meta').first()).toContainText('unsaved edits');
  // The playhead sits where the snip was, and the footage is already past the snipped stretch.
  await expect.poll(() => review(page).locator('video').evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(4.9);

  // The edit list is in the reel folder, outside every version, and no version exists yet.
  const project = readFileSync(PROJECT_FILE, 'utf8');
  const reelDir = join(project, 'reels', 'snip-talk');
  expect(JSON.parse(readFileSync(join(reelDir, 'edit-list.json'), 'utf8')).operations).toHaveLength(1);
  expect(existsSync(join(reelDir, 'v2'))).toBe(false);

  // Save builds v2 and opens it.
  await page.getByRole('button', { name: /^Save as v2/ }).click();
  await expect(versions(page).getByRole('button', { name: /^v2/ })).toBeVisible({ timeout: BUILD_WAIT_MS });
  await expect(versions(page).getByRole('button', { name: /^v2/ })).toContainText('Saved by you');
  await expect(review(page).locator('.meta').first()).toContainText('v2');
  await expect(review(page).locator('.meta').first()).not.toContainText('unsaved edits');
  await expect(timecode(page)).toHaveText(/\/ 00:0[89]\.\d\d$/);
  await expect(page.getByText('No edits yet')).toBeVisible();
  const shots = JSON.parse(readFileSync(join(reelDir, 'v2', 'shots.json'), 'utf8'));
  expect(shots.builtBy).toBe('you');
  expect(existsSync(join(reelDir, 'v2', 'edits.json'))).toBe(true);
  expect(existsSync(join(reelDir, 'edit-list.json'))).toBe(false);
});

test('Discard drops the edit list and the reel plays whole again', async ({ page }) => {
  await startReel(page, 'Discard talk');
  await selectStretch(page);
  await review(page).getByRole('button', { name: /^Snip \d\.\ds$/ }).click();
  await expect(page.getByRole('list', { name: 'Edits' }).getByRole('listitem')).toHaveCount(1);
  await expect(timecode(page)).toHaveText(/\/ 00:0[89]\.\d\d$/);

  await page.getByRole('button', { name: 'Discard', exact: true }).click();

  await expect(page.getByText('No edits yet')).toBeVisible();
  await expect(timecode(page)).toHaveText(/\/ 00:12\.0\d$/);
  const project = readFileSync(PROJECT_FILE, 'utf8');
  expect(existsSync(join(project, 'reels', 'discard-talk', 'edit-list.json'))).toBe(false);
  await expect(versions(page).getByRole('button', { name: /^v2/ })).toHaveCount(0);
});

test('an agent-built footage reel can be snipped and saved too, and its unsent comments go with their moments', async ({ page }) => {
  // Three comments on v1: shot 01 at 0 s, shot 02 at 3.2 s (inside the stretch snipped below) and a word at 8.65 s.
  const commentsUrl = '/api/reels/founder-talk/versions/1/comments';
  const pins = [
    { pin: { shot: '01', x: 0.3, y: 0.4, element: 'document' }, text: 'Slide the laptops in faster.' },
    { pin: { shot: '02', x: 0.5, y: 0.5, element: 'conflict-panel' }, text: 'Bigger count.' },
    { pin: { kind: 'word', shot: '03', time: 8.65, word: 'lose' }, text: 'Land this word harder.' },
  ];
  for (const input of pins) expect((await page.request.post(commentsUrl, { data: input })).ok()).toBe(true);
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: /Founder talk/ }).click();
  await page.getByRole('navigation', { name: 'Phase' }).getByRole('button', { name: 'Review' }).click();
  await expect(timecode(page)).toHaveText(/\/ 00:12\.0\d$/, { timeout: BUILD_WAIT_MS });
  await expect(review(page).getByRole('toolbar', { name: 'Edit tools' })).toBeVisible();

  await selectStretch(page);
  await review(page).getByRole('button', { name: /^Snip \d\.\ds$/ }).click();
  await expect(page.getByRole('list', { name: 'Edits' }).getByRole('listitem')).toHaveCount(1);
  await page.getByRole('button', { name: /^Save as v2/ }).click();
  await expect(versions(page).getByRole('button', { name: /^v2/ })).toBeVisible({ timeout: BUILD_WAIT_MS });

  // v2 holds all three: the one whose moment was snipped says so, the others sit at their new times (the word 3 s earlier).
  await page.getByRole('tab', { name: /^Comments/ }).click();
  const cards = page.locator('.clist .c');
  // The column lists the open section's (01) comments.
  await expect(cards).toHaveCount(2);
  await expect(cards.filter({ hasText: 'Bigger count.' }).locator('.carry-state')).toHaveText('Moment removed');
  await expect(cards.filter({ hasText: 'Slide the laptops in faster.' }).locator('.carry-state')).toHaveCount(0);
  const carried = (await (await page.request.get('/api/reels/founder-talk/versions/2/comments')).json()) as { comments: Array<{ text: string; state?: string; pin: { time: number } }> };
  expect(carried.comments).toHaveLength(3);
  const word = carried.comments.find((c) => c.text === 'Land this word harder.')!;
  expect(word.pin.time).toBe(5.65);
  expect(word.state).toBeUndefined();

  const project = readFileSync(PROJECT_FILE, 'utf8');
  expect(JSON.parse(readFileSync(join(project, 'motion', 'plan.json'), 'utf8')).pieces).toHaveLength(2);
  expect(existsSync(join(project, 'reels', 'founder-talk', 'plan.json'))).toBe(false);
});

/** Snips the stretch the lanes' drag selects. */
async function snipOnce(page: Page): Promise<void> {
  await selectStretch(page);
  await review(page).getByRole('button', { name: /^Snip \d\.\ds$/ }).click();
}

test('undo and redo step the edit list, one card can be removed, and a reload brings it all back', async ({ page }) => {
  await startReel(page, 'Undo talk');
  const cards = page.getByRole('list', { name: 'Edits' }).getByRole('listitem');
  await snipOnce(page);
  await expect(cards).toHaveCount(1);
  const oneSnip = (await timecode(page).textContent())!.split('/')[1]!.trim();
  await snipOnce(page);
  await expect(cards).toHaveCount(2);
  await expect(timecode(page)).not.toHaveText(new RegExp(`/ ${oneSnip.replace('.', '\.')}$`));
  const twoSnips = (await timecode(page).textContent())!.split('/')[1]!.trim();

  // Ctrl+Z restores the list and the reel's length, Ctrl+Shift+Z puts the snip back.
  await page.keyboard.press('Control+z');
  await expect(cards).toHaveCount(1);
  await expect(timecode(page)).toHaveText(new RegExp(`/ ${oneSnip.replace('.', '\.')}$`));
  await page.keyboard.press('Control+Shift+z');
  await expect(cards).toHaveCount(2);
  await expect(timecode(page)).toHaveText(new RegExp(`/ ${twoSnips.replace('.', '\.')}$`));
  await page.keyboard.press('Control+z');
  await expect(cards).toHaveCount(1);
  await page.keyboard.press('Control+y');
  await expect(cards).toHaveCount(2);

  // Removing the first card leaves the second applied.
  await cards.first().hover();
  await page.getByRole('button', { name: 'Remove edit 1' }).click();
  await expect(cards).toHaveCount(1);
  await expect(timecode(page)).not.toHaveText(new RegExp(`/ ${twoSnips.replace('.', '\.')}$`));

  // The buttons do the same as the keys, and Redo is there after an Undo.
  await page.getByRole('button', { name: /^Undo Ctrl/ }).click();
  await expect(cards).toHaveCount(2);
  await page.getByRole('button', { name: /^Undo Ctrl/ }).click();
  await expect(cards).toHaveCount(1);
  await expect(page.getByRole('button', { name: /^Redo Ctrl/ })).toBeEnabled();

  // Reloading restores the list and its redo history.
  await page.reload();
  await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: /Undo talk/ }).click();
  await page.getByRole('navigation', { name: 'Phase' }).getByRole('button', { name: 'Review' }).click();
  await expect(cards).toHaveCount(1);
  await page.getByRole('button', { name: /^Redo Ctrl/ }).click();
  await expect(cards).toHaveCount(2);
  const project = readFileSync(PROJECT_FILE, 'utf8');
  expect(JSON.parse(readFileSync(join(project, 'reels', 'undo-talk', 'edit-list.json'), 'utf8')).operations).toHaveLength(2);
});

test('the Blade cuts the footage in two, a piece is dragged to a new place, and Save builds it', async ({ page }) => {
  await startReel(page, 'Blade talk');
  const tools = review(page).getByRole('toolbar', { name: 'Edit tools' });
  const cards = page.getByRole('list', { name: 'Edits' }).getByRole('listitem');
  const pieces = review(page).locator('.rv-piece');

  // B turns the Blade on; pressing the middle of the lanes cuts there. The cut is marked and listed, and nothing is removed.
  await page.keyboard.press('b');
  await expect(tools.getByRole('button', { name: 'Blade B' })).toHaveAttribute('aria-pressed', 'true');
  await review(page).locator('.axis').scrollIntoViewIfNeeded();
  const plane = (await review(page).locator('.rv-plane').boundingBox())!;
  await page.mouse.click(plane.x + plane.width / 2, plane.y + plane.height - AXIS_INSET);
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText(/Cut into two pieces at 00:0[56]\.\d\d/);
  await expect(pieces).toHaveCount(2);
  await expect(review(page).locator('.rv-joint.cut span')).toHaveText('CUT');
  await expect(timecode(page)).toHaveText(/\/ 00:12\.0\d$/);

  // Cutting at the playhead, which sits at the start where the footage already begins, is refused with a reason.
  await tools.getByRole('button', { name: /^Cut at playhead/ }).click();
  await expect(page.getByRole('alert')).toContainText('already a cut');
  await expect(cards).toHaveCount(1);
  await page.keyboard.press('v');

  // Dragging piece B to the left of A reorders the reel; the first piece now starts about halfway through the source.
  const second = (await pieces.nth(1).boundingBox())!;
  const y = second.y + second.height / 2;
  await page.mouse.move(second.x + second.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(second.x + second.width / 2 - plane.width * 0.3, y, { steps: 5 });
  await page.mouse.move(second.x + second.width / 2 - plane.width * 0.6, y, { steps: 5 });
  await page.mouse.up();
  await expect(cards.last()).toContainText('Moved piece B to place 1');
  await expect(pieces.first()).toContainText(/^A06\.00 to 12\.00$/);
  await expect(timecode(page)).toHaveText(/\/ 00:12\.0\d$/);

  // Undo takes the move back.
  await page.keyboard.press('Control+z');
  await expect(pieces.first()).toContainText(/^A00\.00 to 06\.00$/);
  await page.keyboard.press('Control+Shift+z');
  await expect(pieces.first()).toContainText(/^A06\.00 to 12\.00$/);

  await page.getByRole('button', { name: /^Save as v2/ }).click();
  await expect(versions(page).getByRole('button', { name: /^v2/ })).toBeVisible({ timeout: BUILD_WAIT_MS });
  const project = readFileSync(PROJECT_FILE, 'utf8');
  const plan = JSON.parse(readFileSync(join(project, 'reels', 'blade-talk', 'v2', 'plan.json'), 'utf8'));
  expect(plan.pieces).toHaveLength(2);
  expect(plan.pieces[0].in).toBeGreaterThan(5);
  expect(plan.pieces[1].in).toBe(0);
  await expect(pieces.first()).toContainText(/^A06\.00 to 12\.00$/);
});

test('a word is fixed in place and re-timed by its edge, and Save puts both in the new version', async ({ page }) => {
  await startReel(page, 'Words talk');
  const cards = page.getByRole('list', { name: 'Edits' }).getByRole('listitem');
  const word = (index: number): Locator => review(page).locator(`.rv-w[data-word="${index}"]`);
  await review(page).locator('.axis').scrollIntoViewIfNeeded();

  // Double-clicking a word opens its text; Enter saves the fix, which is listed and marked on the word.
  await expect(word(1)).toHaveText('there');
  await word(1).dblclick();
  await review(page).getByLabel('Word text').fill('where');
  await page.keyboard.press('Enter');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('Changed “there” to “where”');
  await expect(word(1)).toHaveText('where');
  await expect(word(1)).toHaveClass(/fixed/);

  // Dragging a word's right edge later re-times it.
  const grip = (await word(1).locator('.rv-grip.r').boundingBox())!;
  const y = grip.y + grip.height / 2;
  await page.mouse.move(grip.x + grip.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2 + 30, y, { steps: 5 });
  await page.mouse.up();
  await expect(cards).toHaveCount(2);
  await expect(cards.last()).toContainText(/Re-timed to 00:01\.00 to 00:0[12]\.\d\d/);
  await expect(word(1)).toHaveClass(/retimed/);

  await page.getByRole('button', { name: /^Save as v2/ }).click();
  await expect(versions(page).getByRole('button', { name: /^v2/ })).toBeVisible({ timeout: BUILD_WAIT_MS });
  const project = readFileSync(PROJECT_FILE, 'utf8');
  const words = JSON.parse(readFileSync(join(project, 'reels', 'words-talk', 'v2', 'transcript.json'), 'utf8')).words;
  const first = JSON.parse(readFileSync(join(project, 'reels', 'words-talk', 'v1', 'transcript.json'), 'utf8')).words;
  expect(words[1].text).toBe('where');
  expect(words[1].end).toBeGreaterThan(1.5);
  expect(first[1].text).toBe('there');
  await expect(word(1)).toHaveText('where');
  await expect(word(1)).not.toHaveClass(/fixed/);
});

test('dragging a caption moves every caption, Alt-drag moves one phrase, and Save builds both', async ({ page }) => {
  await startReel(page, 'Caption talk');
  const cards = page.getByRole('list', { name: 'Edits' }).getByRole('listitem');
  const handle = review(page).getByRole('button', { name: /^Move captions/ });
  const caption = page.frameLocator('iframe[title="Caption talk page"]').locator('.caption').first();

  // One second in, a caption is on show: the editor's handle sits over it, outside the page.
  await page.keyboard.press('Shift+ArrowRight');
  await expect(timecode(page)).toHaveText(/^00:01\.\d\d/);
  await expect(handle).toBeVisible();
  await expect(caption).toHaveCSS('translate', NOT_MOVED);
  await expect(page.frameLocator('iframe[title="Caption talk page"]').locator('.rv-caphandle')).toHaveCount(0);

  const dragBy = async (dx: number, dy: number, alt: boolean): Promise<void> => {
    const box = (await handle.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    if (alt) await page.keyboard.down('Alt');
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
    await page.mouse.move(x + dx, y + dy, { steps: 4 });
    await page.mouse.up();
    if (alt) await page.keyboard.up('Alt');
  };

  // A drag moves all captions: one card, and the page's caption is shifted in the preview.
  const before = (await handle.boundingBox())!;
  await dragBy(-30, -40, false);
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('Captions · all captions');
  await expect(cards.first()).toContainText(/Moved all captions to -\d+, -\d+/);
  await expect(caption).not.toHaveCSS('translate', NOT_MOVED);
  const after = (await handle.boundingBox())!;
  expect(after.y).toBeLessThan(before.y - 20);
  expect(after.x).toBeLessThan(before.x - 15);

  // Alt-drag moves this phrase alone, on top of that: its own card, and the lane marks the phrase.
  await dragBy(0, -40, true);
  await expect(cards).toHaveCount(2);
  await expect(cards.last()).toContainText(/Moved one caption to 0, -\d+/);
  await expect(review(page).locator('.rv-phrase.own')).toHaveCount(1);

  // The arrow keys nudge the focused handle (Shift for one pixel; Alt moves the phrase).
  await handle.focus();
  await page.keyboard.press('Shift+ArrowDown');
  await expect(cards).toHaveCount(3);
  await expect(cards.last()).toContainText('Moved all captions');

  await page.getByRole('button', { name: /^Save as v2/ }).click();
  await expect(versions(page).getByRole('button', { name: /^v2/ })).toBeVisible({ timeout: BUILD_WAIT_MS });
  const project = readFileSync(PROJECT_FILE, 'utf8');
  const reelDir = join(project, 'reels', 'caption-talk');
  const { captions } = JSON.parse(readFileSync(join(reelDir, 'v2', 'plan.json'), 'utf8'));
  expect(captions.position.x).toBeLessThan(0);
  expect(captions.position.y).toBeLessThan(-30);
  expect(captions.phrases).toEqual([{ at: 0.5, x: 0, y: expect.any(Number) }]);
  expect(readFileSync(join(reelDir, 'v2', 'index.html'), 'utf8')).toContain(';translate:');
  expect(readFileSync(join(reelDir, 'v1', 'index.html'), 'utf8')).not.toContain('translate:');
  // The new version's page already holds the positions; the editor shows them without any unsaved edit.
  await expect(caption).not.toHaveCSS('translate', NOT_MOVED);
  await expect(cards).toHaveCount(0);
});
