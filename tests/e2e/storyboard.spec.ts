import { expect, test } from '@playwright/test';

const SHOT_TITLES = ['Cube lands', 'Logo lockup', 'Word slams', 'All-in-one dashboard', 'Icons and flows', 'Call to action'];
const SHOT_TIMECODES = ['00.00', '01.80', '03.60', '05.90', '08.40', '12.20'];

test('opening a reel shows its newest version as a grid of every shot', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Storyboard, v2');
  await expect(page.getByText('Click a shot to enlarge it and pin comments')).toBeVisible();
  await expect(page.locator('.reelname')).toContainText('15.0s');

  const shots = page.locator('.grid .shot');
  await expect(shots).toHaveCount(6);
  await expect(shots.locator('.lbl .dot')).toHaveText(['01', '02', '03', '04', '05', '06']);
  await expect(shots.locator('.lbl .t')).toHaveText(SHOT_TIMECODES);
  for (const [i, title] of SHOT_TITLES.entries()) {
    await expect(shots.nth(i).locator('.lbl')).toContainText(title);
  }
  await expect(shots.nth(2).locator('.desc')).toHaveText('Four feature words slam in on the beat, and ICONS stays lit.');
  await expect(shots.nth(2).locator('.lbl .t')).toHaveCSS('font-family', /Doto/);
  await expect(shots.nth(2).locator('.lbl .t')).toHaveCSS('font-variant-numeric', 'tabular-nums');
});

test('each still is the live page seeked to the start of its shot', async ({ page }) => {
  await page.goto('/');

  const still = page.locator('.grid .shot').nth(2).locator('.still');
  await expect(still).toHaveAttribute('data-state', 'ready');
  const frame = still.frameLocator('iframe');
  await expect(frame.locator('[data-scene="word-slams"]')).toHaveClass(/active/);
  await expect(frame.locator('[data-scene="word-slams"] [data-el="icons-word"]')).toBeVisible();
  await expect(frame.locator('[data-scene="cube-lands"]')).not.toHaveClass(/active/);

  const first = page.locator('.grid .shot').nth(0).locator('.still');
  await expect(first).toHaveAttribute('data-state', 'ready');
  await expect(first.frameLocator('iframe').locator('[data-scene="cube-lands"]')).toHaveClass(/active/);

  const iframe = still.locator('iframe');
  await expect(iframe).toHaveAttribute('tabindex', '-1');
  await expect(iframe).toHaveAttribute('title', 'Shot 03 still');
  await expect(iframe).toHaveCSS('pointer-events', 'none');
  await expect(iframe).toHaveAttribute('src', /^\/reels\/product-showreel\/v2\/index\.html\?render$/);

  const stillBox = (await still.boundingBox())!;
  const frameBox = (await iframe.boundingBox())!;
  expect(frameBox.width).toBeCloseTo(stillBox.width, 0);
  expect(frameBox.height).toBeCloseTo(stillBox.height, 0);
});

test('stills below the fold load only once scrolled into view', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 300 });
  await page.goto('/');

  const shots = page.locator('.grid .shot');
  await expect(shots.nth(0).locator('.still')).toHaveAttribute('data-state', 'ready');
  for (const i of [3, 4, 5]) {
    await expect(shots.nth(i).locator('.still')).toHaveAttribute('data-state', 'idle');
    await expect(shots.nth(i).locator('iframe')).toHaveCount(0);
  }

  await shots.nth(5).scrollIntoViewIfNeeded();

  const last = shots.nth(5).locator('.still');
  await expect(last).toHaveAttribute('data-state', 'ready');
  await expect(last.locator('iframe')).toHaveCount(1);
  await expect(last.frameLocator('iframe').locator('[data-scene="cta"]')).toHaveClass(/active/);
});

test('hover and keyboard focus lift a shot into stacked paper', async ({ page }) => {
  await page.goto('/');

  const shot = page.locator('.grid .shot').nth(1);
  await expect(shot).toHaveCSS('transform', 'none');
  await expect(shot).toHaveCSS('transition-duration', /0\.38s/);

  await shot.hover();
  await expect(shot).toHaveCSS('transform', 'matrix(1, 0, 0, 1, -3, -3)');
  await expect(shot).not.toHaveCSS('box-shadow', 'none');

  await page.mouse.move(0, 0);
  await expect(shot).toHaveCSS('transform', 'none');

  await shot.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(shot).toBeFocused();
  await expect(shot).toHaveCSS('transform', 'matrix(1, 0, 0, 1, -3, -3)');
});

test('reduced motion removes the lift transition', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  const shot = page.locator('.grid .shot').first();
  await expect(shot).toHaveCSS('transition-duration', '0s');
});

test('a page without seek gets a labelled placeholder, not a black frame', async ({ page }) => {
  await page.route('**/reels/product-showreel/v2/index.html*', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>no seek</title><p>plain page</p>' }),
  );
  await page.goto('/');

  const still = page.locator('.grid .shot').first().locator('.still');
  await expect(still).toHaveAttribute('data-state', 'failed');
  await expect(still).toContainText('Still unavailable');
  await expect(still).toContainText('seek');
});

test('version files are served same-origin and confined to version folders', async ({ request }) => {
  const page = await request.get('/reels/product-showreel/v2/index.html');
  expect(page.status()).toBe(200);
  expect(page.headers()['content-type']).toContain('text/html');

  const missing = await request.get('/reels/product-showreel/v2/nope.html');
  expect(missing.status()).toBe(404);

  for (const path of [
    '/reels/product-showreel/reel.json',
    '/reels/product-showreel/v2/../reel.json',
    '/reels/product-showreel/v2/%2e%2e/reel.json',
    '/reels/product-showreel/v2/..%2f..%2f..%2fpackage.json',
    '/reels/product-showreel/v2/%2e%2e%5c%2e%2e%5c%2e%2e%5cpackage.json',
    '/reels/.kinotta/x/v1/index.html',
  ]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }

  expect((await request.post('/reels/product-showreel/v2/index.html')).status()).toBe(405);
});

test('the version API reports shots and clear errors', async ({ request }) => {
  const ok = await request.get('/api/reels/product-showreel/versions/2');
  expect(ok.status()).toBe(200);
  const body = (await ok.json()) as { number: number; isNewest: boolean; shots: unknown[] };
  expect(body).toMatchObject({ number: 2, isNewest: true });
  expect(body.shots).toHaveLength(6);

  expect((await request.get('/api/reels/product-showreel/versions/9')).status()).toBe(404);
  expect((await request.get('/api/reels/nope/versions/1')).status()).toBe(404);
});
