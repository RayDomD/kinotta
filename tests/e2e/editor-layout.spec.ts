import { expect, test } from '../helpers/editor-test.ts';
import type { Locator, Page } from '../helpers/editor-test.ts';
import { openDetailedEditor, revealReelRail } from '../helpers/review-rail.ts';
import { serverUrl } from './ports.ts';

// Layout checks share the versions fixture server; marker and track checks use temporary editor items.
test.use({ baseURL: serverUrl('versions') });

const RAIL_WIDTH = 220;
const PANEL_WIDTH = 320;
const TRACKS_FLOOR = 120;
const SIDE_PANEL_WIDTHS = [1280, 1920] as const;

async function openEditor(page: Page): Promise<void> {
  await openDetailedEditor(page, '/');
  await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: /Product showreel/ }).click();
  await page.getByRole('navigation', { name: 'Phase' }).getByRole('button', { name: 'Edit', exact: true }).click();
  await page.locator('.body[data-review-shell="true"]').waitFor();
}

/** Waits until a locator stops changing size, since the editor finishes laying out after it opens. */
async function settled(locator: Locator): Promise<void> {
  let last = -1;
  await expect.poll(async () => { const width = (await locator.boundingBox())!.width; const same = width === last; last = width; return same; }).toBe(true);
}

const columns = (page: Page) => page.locator('.body[data-review-shell="true"]').evaluate((body) => getComputedStyle(body).gridTemplateColumns.split(' ').map(parseFloat));

test('Each side panel collapses and expands with its own button, and the choice survives a reload', async ({ page }) => {
  await openEditor(page);
  const body = page.locator('.body[data-review-shell="true"]');
  await page.getByRole('button', { name: 'Collapse right panel', exact: true }).click();
  await expect(body).toHaveAttribute('data-panel-open', 'false');
  await expect(body).toHaveAttribute('data-rail-open', /./);
  await expect.poll(async () => (await columns(page)).at(-1)).toBeLessThan(PANEL_WIDTH);
  await page.reload();
  await page.locator('.body[data-review-shell="true"]').waitFor();
  await expect(body).toHaveAttribute('data-panel-open', 'false');
  await page.getByRole('button', { name: 'Expand right panel', exact: true }).click();
  await expect(body).toHaveAttribute('data-panel-open', 'true');
  await expect.poll(async () => (await columns(page)).at(-1)).toBe(PANEL_WIDTH);
});

test('A collapsed panel is inert so focus skips it', async ({ page }) => {
  await openEditor(page);
  await page.getByRole('button', { name: 'Collapse right panel', exact: true }).click();
  await expect(page.locator('.rv-side')).toHaveAttribute('inert', '');
});

test('The panel animation is one short transition, and reduced motion removes it', async ({ page }) => {
  await openEditor(page);
  const duration = () => page.locator('.body[data-review-shell="true"]').evaluate((body) => getComputedStyle(body).transitionDuration);
  expect(await duration()).toBe('0.22s');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await duration()).toBe('0s');
});

test('Dragging the divider to the bottom keeps the timeline usable and leaves the toolbar alone', async ({ page }) => {
  await openEditor(page);
  const toolbar = page.getByRole('toolbar', { name: 'Timeline tools' });
  await settled(toolbar);
  const before = (await toolbar.boundingBox())!;
  const divider = page.getByRole('separator', { name: 'Picture and tracks' });
  const box = (await divider.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 2000, { steps: 10 });
  await page.mouse.up();
  const tracks = (await page.locator('.rv-tracks-pane').boundingBox())!;
  expect(tracks.height).toBeGreaterThanOrEqual(TRACKS_FLOOR);
  const after = (await toolbar.boundingBox())!;
  expect(after.width).toBeCloseTo(before.width, 0);
  expect(after.height).toBeCloseTo(before.height, 0);
});

test('Resizing the window only changes the centre column', async ({ page }) => {
  await openEditor(page);
  await revealReelRail(page);
  const widths: number[][] = [];
  for (const width of SIDE_PANEL_WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    // The panels settle after their 220ms transition.
    await expect.poll(async () => { const [rail, , panel] = await columns(page); return [rail, panel]; }).toEqual([RAIL_WIDTH, PANEL_WIDTH]);
    widths.push(await columns(page));
  }
  expect(widths[1]![1]).toBeGreaterThan(widths[0]![1]!);
});

test('Opening marker settings keeps the picture and tracks in place', async ({ page }) => {
  await openEditor(page);
  const picture = page.locator('.rv-resizable > .rv-well');
  const tracks = page.locator('.rv-tracks-pane');
  await settled(picture);
  const beforePicture = (await picture.boundingBox())!;
  const beforeTracks = (await tracks.boundingBox())!;
  await page.getByRole('button', { name: 'Marker', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Marker settings' })).toBeVisible();
  const afterPicture = (await picture.boundingBox())!;
  const afterTracks = (await tracks.boundingBox())!;
  expect(afterPicture.y).toBeCloseTo(beforePicture.y, 0);
  expect(afterPicture.height).toBeCloseTo(beforePicture.height, 0);
  expect(afterTracks.y).toBeCloseTo(beforeTracks.y, 0);
  expect(afterTracks.height).toBeCloseTo(beforeTracks.height, 0);
  await page.getByRole('button', { name: 'Remove marker' }).click();
});
test('Speech track controls fit without overlap at 1280 pixels', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openEditor(page);
  await page.getByRole('button', { name: 'Add track' }).click();
  const name = page.locator('.native-track-header > input').last();
  await name.fill('Speech');
  await name.blur();
  const header = page.locator('.native-track-header').filter({ has: page.getByRole('button', { name: 'Mute Speech' }) });
  await expect(header).toBeVisible();
  const boxes = await header.locator('button, input').evaluateAll((elements) => elements.map((element) => { const r = element.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }));
  const bounds = await header.boundingBox();
  expect(bounds).not.toBeNull();
  for (const [index, box] of boxes.entries()) {
    expect(box.left).toBeGreaterThanOrEqual(bounds!.x);
    expect(box.right).toBeLessThanOrEqual(bounds!.x + bounds!.width);
    expect(box.top).toBeGreaterThanOrEqual(bounds!.y);
    expect(box.bottom).toBeLessThanOrEqual(bounds!.y + bounds!.height);
    for (const other of boxes.slice(index + 1)) expect(box.right <= other.left || other.right <= box.left || box.bottom <= other.top || other.bottom <= box.top).toBe(true);
  }
});

test('Narrow graphic clips hide their label and retain the full name in a tooltip', async ({ page }) => {
  await openEditor(page);
  const clip = page.locator('.editorial-graphic').first();
  const label = clip.locator('.native-clip-name');
  const name = (await label.textContent())!.trim();
  await expect(clip).toHaveAttribute('title', name);
  await clip.evaluate((element) => { element.style.width = '30px'; });
  await expect(label).toBeHidden();
  await clip.evaluate((element) => { element.style.width = '150px'; });
  await expect(label).toBeVisible();
});


test('Timeline tools and zoom controls share a compact row at 1920 pixels', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await openEditor(page);
  const tools = (await page.getByRole('toolbar', { name: 'Timeline tools' }).boundingBox())!;
  const zoom = (await page.getByRole('region', { name: 'Timeline view' }).boundingBox())!;
  expect(Math.abs((tools.y + tools.height / 2) - (zoom.y + zoom.height / 2))).toBeLessThan(2);
  expect(zoom.x - (tools.x + tools.width)).toBeGreaterThanOrEqual(0);
  expect(zoom.x - (tools.x + tools.width)).toBeLessThanOrEqual(16);
});
