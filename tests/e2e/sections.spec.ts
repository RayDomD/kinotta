import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

// Read-only, on the footage server (two sections) so it never disturbs footage.spec.ts, which saves comments there.
// Pin counts are not asserted for that reason. The one-section reel is checked on the shared server, in the last test.
const FOOTAGE_SERVER = 'http://localhost:4396';
const SHARED_SERVER = 'http://localhost:4399';

const heading = (page: Page): Locator => page.getByRole('heading', { level: 1 });
const railSections = (page: Page): Locator => page.getByRole('navigation', { name: 'Sections' }).getByRole('button');
const bands = (page: Page): Locator => page.locator('.band-lane .band');
const gridShots = (page: Page): Locator => page.locator('.grid').getByRole('button');

test.describe('two sections', () => {
  test.use({ baseURL: FOOTAGE_SERVER });

  test('the rail lists the sections above the versions, with span and shot count', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('.rail .label').filter({ hasText: 'Sections' })).toHaveText('Sections · 2');
    const labels = await page.locator('.rail .label').allTextContents();
    expect(labels.findIndex((l) => l.startsWith('Sections'))).toBeLessThan(labels.indexOf('Versions'));

    await expect(railSections(page)).toHaveCount(2);
    await expect(railSections(page).nth(0).locator('.n')).toHaveText('01');
    await expect(railSections(page).nth(0).locator('.n')).toHaveCSS('font-family', /Doto/);
    await expect(railSections(page).nth(0).locator('.nm')).toHaveText('Cold open');
    await expect(railSections(page).nth(0).locator('.sub')).toContainText('00:00–00:06');
    await expect(railSections(page).nth(0).locator('.sub')).toContainText('2 shots');
    await expect(railSections(page).nth(1).locator('.nm')).toHaveText('The sync problem');
    await expect(railSections(page).nth(1).locator('.sub')).toContainText('00:06–00:12');
    await expect(railSections(page).nth(1).locator('.sub')).toContainText('2 shots');
  });

  test('the grid shows the current section, and the rail switches it', async ({ page }) => {
    await page.goto('/');

    await expect(railSections(page).nth(0)).toHaveAttribute('aria-current', 'true');
    await expect(heading(page)).toHaveText('01 Cold open');
    await expect(page.locator('.head .meta')).toContainText('00:00–00:06 · 2 shots');
    await expect(gridShots(page)).toHaveCount(2);
    await expect(gridShots(page).nth(0)).toHaveAccessibleName(/^Shot 01,/);
    await expect(gridShots(page).nth(1)).toHaveAccessibleName(/^Shot 02,/);

    await railSections(page).nth(1).click();

    await expect(railSections(page).nth(1)).toHaveAttribute('aria-current', 'true');
    await expect(railSections(page).nth(0)).not.toHaveAttribute('aria-current', 'true');
    await expect(heading(page)).toHaveText('02 The sync problem');
    await expect(gridShots(page)).toHaveCount(2);
    await expect(gridShots(page).nth(0)).toHaveAccessibleName(/^Shot 03,/);
    await expect(gridShots(page).nth(1)).toHaveAccessibleName(/^Shot 04,/);
    await expect(page.getByRole('complementary', { name: 'Comments' }).locator('header .meta')).toContainText('section 02');
  });

  test('the lanes show one band per section, mark the current one, and a band switches the section', async ({ page }) => {
    await page.goto('/');

    await expect(bands(page)).toHaveCount(2);
    await expect(bands(page).nth(0)).toHaveAttribute('aria-current', 'true');
    await expect(bands(page).nth(1)).not.toHaveAttribute('aria-current', 'true');
    await expect(bands(page).nth(1)).toHaveAttribute('title', '02 The sync problem');
    await expect(bands(page).nth(0)).toHaveText('01');

    // Both sections are 6s of a 12s reel, so each band is half the lane.
    const lane = (await page.locator('.band-lane').boundingBox())!;
    const first = (await bands(page).nth(0).boundingBox())!;
    expect(Math.abs(first.width - lane.width / 2)).toBeLessThan(2);

    // The shots lane spans the reel: buttons for the current section's shots, ticks for the other's.
    await expect(page.locator('.shots-lane .seg')).toHaveCount(2);
    await expect(page.locator('.shots-lane .tick')).toHaveCount(2);

    await bands(page).nth(1).click();
    await expect(bands(page).nth(1)).toHaveAttribute('aria-current', 'true');
    await expect(heading(page)).toHaveText('02 The sync problem');
    await expect(page.locator('.shots-lane .seg')).toHaveCount(2);
    await expect(page.locator('.shots-lane .seg').nth(0)).toHaveAccessibleName(/^Shot 03,/);

    await bands(page).nth(0).click();
    await expect(heading(page)).toHaveText('01 Cold open');
  });

  test('the section survives the sheet, and arrow keys stay inside it', async ({ page }) => {
    await page.goto('/');
    await railSections(page).nth(1).click();

    await gridShots(page).nth(0).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.locator('.lbl .dot')).toHaveText('03');
    await page.keyboard.press('ArrowLeft');
    await expect(sheet.locator('.lbl .dot')).toHaveText('03');
    await page.keyboard.press('ArrowRight');
    await expect(sheet.locator('.lbl .dot')).toHaveText('04');
    await page.keyboard.press('ArrowRight');
    await expect(sheet.locator('.lbl .dot')).toHaveText('04');

    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(heading(page)).toHaveText('02 The sync problem');
  });

  test('the rail buttons and the bands take keyboard focus and switch on Enter', async ({ page }) => {
    await page.goto('/');
    await railSections(page).nth(1).focus();
    await expect(railSections(page).nth(1)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(heading(page)).toHaveText('02 The sync problem');
    await bands(page).nth(0).focus();
    await expect(bands(page).nth(0)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(heading(page)).toHaveText('01 Cold open');
  });
});

test.describe('one section', () => {
  test.use({ baseURL: SHARED_SERVER });

  test('a reel without sections shows no section list or bands and keeps its heading', async ({ page }) => {
    await page.goto('/');

    await expect(heading(page)).toHaveText('Storyboard, v2');
    await expect(page.getByRole('navigation', { name: 'Sections' })).toHaveCount(0);
    await expect(page.locator('.band-lane')).toHaveCount(0);
    await expect(gridShots(page)).toHaveCount(6);
    await expect(page.locator('.shots-lane .seg')).toHaveCount(6);
    await expect(page.locator('.shots-lane .tick')).toHaveCount(0);
  });
});
