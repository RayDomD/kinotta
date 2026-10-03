import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

// The engine-project sample, its clips built by the motion engine when the server starts (playwright.config.ts).
const ENGINE_SERVER = 'http://localhost:4391';
const PAGE_WIDTH = 1920;

test.use({ baseURL: ENGINE_SERVER });

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const dialog = (page: Page): Locator => page.getByRole('dialog');
const bigFrame = (page: Page): Locator => dialog(page).locator('.still');
const centre = (b: Box): { x: number; y: number } => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

async function openReel(page: Page, title: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: title }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Storyboard, v1');
}

async function openShot(page: Page, number: string): Promise<void> {
  await page.locator('.grid').getByRole('button', { name: new RegExp(`^Shot ${number}, `) }).click();
  await expect(bigFrame(page)).toHaveAttribute('data-state', 'ready');
  await page.waitForFunction(() => document.getAnimations().length === 0);
}

/** A page element's box as it appears on screen: the page box scaled and offset by the enlarged frame. */
async function onScreen(page: Page, selector: string): Promise<Box> {
  const frame = (await bigFrame(page).boundingBox())!;
  const scale = frame.width / PAGE_WIDTH;
  const r = await page
    .frameLocator('.sheet iframe')
    .locator(selector)
    .first()
    .evaluate((el) => {
      const b = el.getBoundingClientRect();
      return { left: b.left, top: b.top, width: b.width, height: b.height };
    });
  return { x: frame.x + r.left * scale, y: frame.y + r.top * scale, width: r.width * scale, height: r.height * scale };
}

test('an engine clip opens as a reel with a still drawn at each shot and no contract issues', async ({ page }) => {
  await openReel(page, 'Engine clip: Opus drop');

  const stills = page.locator('.grid .shot .still');
  await expect(stills).toHaveCount(3);
  for (const still of await stills.all()) await expect(still).toHaveAttribute('data-state', 'ready');
  await expect(page.getByText(/contract issue/i)).toHaveCount(0);
  await expect(stills.nth(0).frameLocator('iframe').locator('[data-el="badge"]')).toBeVisible();
  await expect(stills.nth(1).frameLocator('iframe').locator('[data-el="icCastle"]')).toBeVisible();
});

test('a click on an engine clip pins the named element under it', async ({ page }) => {
  await openReel(page, 'Engine clip: Opus drop');
  await openShot(page, '01');

  const badge = centre(await onScreen(page, '[data-el="badge"]'));
  await page.mouse.click(badge.x, badge.y);

  await expect(dialog(page).getByRole('textbox', { name: 'Comment on badge, shot 01' })).toBeFocused();
});

test('a click inside a named wrapper with no box pins the nearest named element around it', async ({ page }) => {
  await openReel(page, 'Engine clip: Effort slider');
  await openShot(page, '02');

  // The castle's base block sits in the "scene" wrapper, which has no size of its own.
  const block = centre(await onScreen(page, '#p0'));
  await page.mouse.click(block.x, block.y);

  await expect(dialog(page).getByRole('textbox', { name: 'Comment on shape, shot 02' })).toBeFocused();
});
