import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/** A Draft of the showreel's v2 runs in parallel segments, but still takes a while. */
const RENDER_WAIT_MS = 120_000;

// The showreel sample: two code-only versions. Its own server (playwright.config.ts), since versions are approved and rendered.
// Approving and rendering are part of Review (docs/mockups/2026-10-06-review-picker-merge.html, option C).
test.use({ baseURL: 'http://localhost:4380' });
test.describe.configure({ mode: 'serial' });

const review = (page: Page): Locator => page.getByRole('main', { name: 'Review' });
const actions = (page: Page): Locator => review(page).getByRole('group', { name: 'Version actions' });
const rail = (page: Page): Locator => page.getByRole('navigation', { name: 'Versions' });
const renderMenu = (page: Page): Locator => page.getByRole('dialog', { name: 'Renders' });

async function openReview(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: /Product showreel/ }).click();
  await page.getByRole('navigation', { name: 'Phase' }).getByRole('button', { name: 'Review' }).click();
  await expect(actions(page)).toBeVisible();
}

test('Approve and Withdraw by the title mark the version on show, and the rail follows', async ({ page }) => {
  await openReview(page);

  await actions(page).getByRole('button', { name: 'Approve v2' }).click();
  await expect(actions(page)).toContainText('Approved');
  await expect(rail(page).getByRole('button', { name: /^v2/ })).toContainText('approved');

  await actions(page).getByRole('button', { name: 'Withdraw v2' }).click();
  await expect(actions(page).getByRole('button', { name: 'Approve v2' })).toBeVisible();
  await expect(rail(page).getByRole('button', { name: /^v2/ })).not.toContainText('approved');

  // Opening another version in the rail moves the actions to it.
  await rail(page).getByRole('button', { name: /^v1/ }).click();
  await expect(actions(page).getByRole('button', { name: 'Approve v1' })).toBeVisible();
  await expect(actions(page).getByRole('button', { name: 'Render v1' })).toBeVisible();
});

test('a refused render shows its reason; a Draft renders and the finished file plays in Review', async ({ page }) => {
  test.setTimeout(RENDER_WAIT_MS + 30_000);
  await openReview(page);

  // Render opens a popover over the reel, anchored to its button.
  await actions(page).getByRole('button', { name: 'Render v2' }).click();
  const form = page.getByRole('dialog', { name: 'Render v2' });
  await expect(form).toBeVisible();

  // The showreel's pages are opaque, so they have no Overlay.
  await form.getByRole('radio', { name: 'Overlay' }).check();
  await expect(form.getByLabel('Size')).toHaveValue('source');
  await form.getByRole('button', { name: 'Render', exact: true }).click();
  // The refusal waits on a browser reading the page, slow when the machine is busy.
  await expect(form.getByRole('alert')).toContainText('no transparent background', { timeout: 30_000 });

  await form.getByRole('radio', { name: 'Draft' }).check();
  await expect(form.getByLabel('Size')).toHaveValue('half');
  await form.getByRole('button', { name: 'Render', exact: true }).click();
  await expect(form.getByRole('status')).toContainText('queued');

  // Escape closes the popover and gives focus back to its button.
  await page.keyboard.press('Escape');
  await expect(form).toHaveCount(0);
  await expect(actions(page).getByRole('button', { name: 'Render v2' })).toBeFocused();

  // The top bar's render menu holds the past renders.
  await page.getByRole('banner').getByRole('button', { name: 'Renders' }).click();
  const draft = renderMenu(page).getByRole('list', { name: 'Past renders' }).getByRole('listitem').filter({ hasText: 'product-showreel-v2-draft-540p30.mp4' });
  await expect(draft).toBeVisible({ timeout: RENDER_WAIT_MS });
  await expect(draft.getByRole('button', { name: 'Show in folder' })).toBeVisible();
  await draft.getByRole('button', { name: 'Play' }).click();
  await expect(renderMenu(page)).toHaveCount(0);

  const video = review(page).getByLabel('Render product-showreel-v2-draft-540p30.mp4');
  await expect(video).toHaveAttribute('src', /\/renders\/product-showreel\/product-showreel-v2-draft-540p30\.mp4$/);
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.duration), { timeout: 15_000 }).toBeGreaterThan(1);
  await review(page).getByRole('button', { name: 'Back to v2' }).click();
  await expect(review(page).locator('iframe[title$=" page"]')).toBeVisible();
});
