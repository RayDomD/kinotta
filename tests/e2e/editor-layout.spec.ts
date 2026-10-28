import { expect, test } from '../helpers/editor-test.ts';
import type { Locator, Page } from '../helpers/editor-test.ts';
import { openDetailedEditor, revealReelRail } from '../helpers/review-rail.ts';
import { serverUrl } from './ports.ts';

// Layout checks only move panels and the divider; they never change the project, so they share the versions fixture server.
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
