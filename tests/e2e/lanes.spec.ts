import { expect, test } from '@playwright/test';

// Read-only: runs against the shared server (comments are never saved here). Pins on the lanes are
// covered in pins.spec.ts, which owns the server that saves comments.
const SHOT_STARTS = [0, 1.8, 3.6, 5.9, 8.4, 12.2];
const REEL_DURATION = 15;
const PIXEL_TOLERANCE = 1.5;
const durations = SHOT_STARTS.map((start, i) => (SHOT_STARTS[i + 1] ?? REEL_DURATION) - start);

test('segment widths are proportional to the shot durations', async ({ page }) => {
  await page.goto('/');
  const segs = page.locator('.shots-lane .seg');
  await expect(segs).toHaveCount(6);

  const laneWidth = (await page.locator('.shots-lane').boundingBox())!.width;
  for (const [i, duration] of durations.entries()) {
    const box = (await segs.nth(i).boundingBox())!;
    expect(Math.abs(box.width - (duration / REEL_DURATION) * laneWidth), `shot ${i + 1} width`).toBeLessThan(PIXEL_TOLERANCE);
  }

  await expect(segs.nth(2)).toHaveAccessibleName('Shot 03, Word slams, 03.60 to 05.90');
  await expect(segs.nth(2)).toHaveAttribute('title', '03 Word slams, 2.3s');
  await expect(segs.nth(2).locator('b')).toHaveText('03');
  await expect(segs.nth(2).locator('b')).toHaveCSS('font-family', /Doto/);
  await expect(segs.nth(2).locator('span')).toHaveText('Word slams');
  await expect(page.locator('.shots-lane .seg.has')).toHaveCount(0);
});

test('overlays sit at their real span on the time axis', async ({ page }) => {
  await page.goto('/');
  const lane = (await page.locator('.ov-lane').boundingBox())!;
  const overlays = page.locator('.ov-lane .ov');
  await expect(overlays).toHaveCount(2);
  await expect(page.locator('.ov-empty')).toHaveCount(0);

  const spans = [
    { kind: 'B-ROLL', name: 'Hands on keyboard', start: 6.2, end: 9.8 },
    { kind: 'L3', name: 'Lower third: product name', start: 12.4, end: 14.6 },
  ];
  for (const [i, span] of spans.entries()) {
    const box = (await overlays.nth(i).boundingBox())!;
    expect(Math.abs(box.x - lane.x - (span.start / REEL_DURATION) * lane.width), `${span.kind} left`).toBeLessThan(PIXEL_TOLERANCE);
    expect(Math.abs(box.width - ((span.end - span.start) / REEL_DURATION) * lane.width), `${span.kind} width`).toBeLessThan(PIXEL_TOLERANCE);
    await expect(overlays.nth(i).locator('b')).toHaveText(span.kind);
    await expect(overlays.nth(i)).toContainText(span.name);
  }
  await expect(overlays.nth(0)).toHaveAttribute('title', 'Hands on keyboard, 06.20 to 09.80');
});

test('a reel with no overlays shows None over dot terrain, and its own axis', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'B-roll cutdown' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Storyboard, v1');

  await expect(page.locator('.ov-lane .ov')).toHaveCount(0);
  await expect(page.locator('.ov-empty span')).toHaveText('None');
  const terrain = (await page.locator('.ov-empty .terrain').boundingBox())!;
  expect(terrain.width).toBeGreaterThan(100);
  await expect(page.locator('.ov-empty .terrain')).toHaveCSS('background-image', /radial-gradient/);

  await expect(page.locator('.axis span')).toHaveText(['00.00', '02.00', '04.00', '06.00', '08.00']);
  const segs = page.locator('.shots-lane .seg');
  await expect(segs).toHaveCount(2);
  const [a, b] = [(await segs.nth(0).boundingBox())!, (await segs.nth(1).boundingBox())!];
  expect(Math.abs(a.width - b.width)).toBeLessThan(PIXEL_TOLERANCE);
});

test('the axis shows a tick every 3 seconds for a 15 second reel, first and last aligned to the lane edges', async ({ page }) => {
  await page.goto('/');
  const ticks = page.locator('.axis span');
  await expect(ticks).toHaveText(['00.00', '03.00', '06.00', '09.00', '12.00', '15.00']);

  const lane = (await page.locator('.axis').boundingBox())!;
  const first = (await ticks.first().boundingBox())!;
  const last = (await ticks.last().boundingBox())!;
  expect(Math.abs(first.x - lane.x)).toBeLessThan(PIXEL_TOLERANCE);
  expect(Math.abs(last.x + last.width - (lane.x + lane.width))).toBeLessThan(PIXEL_TOLERANCE);
  await expect(ticks.nth(2)).toHaveCSS('font-family', /Doto/);
});

test('clicking a segment opens that shot, Esc closes it and focus returns to the segment', async ({ page }) => {
  await page.goto('/');
  const seg = page.getByRole('button', { name: /^Shot 04, .*05\.90 to 08\.40$/ });
  await seg.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleName('04 All-in-one dashboard');
  await expect(dialog.locator('.lbl .dot')).toHaveText('04');

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(seg).toBeFocused();
});

test('lane controls are reachable by keyboard after the grid, with a visible focus state', async ({ page }) => {
  await page.goto('/');
  const lastCard = page.locator('.grid').getByRole('button', { name: /^Shot 06, Call to action, / });
  const firstSeg = page.locator('.shots-lane .seg').first();
  await lastCard.focus();
  await page.keyboard.press('Tab');
  await expect(firstSeg).toBeFocused();
  await expect(firstSeg).toHaveCSS('outline-style', 'solid');

  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveAccessibleName('01 Cube lands');
});
