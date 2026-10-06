import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/** A Draft of the showreel's v2 runs in parallel segments, but still takes a while. */
const RENDER_WAIT_MS = 120_000;

// The showreel sample: two code-only versions. Its own server (playwright.config.ts), since versions are approved and rendered.
test.use({ baseURL: 'http://localhost:4380' });
test.describe.configure({ mode: 'serial' });

const picker = (page: Page): Locator => page.getByRole('main', { name: 'Picker' });
const panel = (page: Page): Locator => page.getByRole('complementary', { name: 'Render' });
const table = (page: Page): Locator => picker(page).getByRole('table', { name: 'Versions' });
const row = (page: Page, number: number): Locator => table(page).getByRole('row', { name: new RegExp(`^v${number}\\b`) });

async function openPicker(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: /Product showreel/ }).click();
  await page.getByRole('navigation', { name: 'Phase' }).getByRole('button', { name: 'Picker' }).click();
  await expect(table(page)).toBeVisible();
}

test('the versions table lists each version, and approving one marks it in the rail', async ({ page }) => {
  await openPicker(page);

  await expect(table(page).getByRole('columnheader')).toHaveText(['Version', 'Built by', 'Comments', 'Contract', 'Approval']);
  await expect(row(page, 1)).toBeVisible();
  await expect(row(page, 2)).toContainText('ok');
  await expect(row(page, 2)).toContainText('0');

  await row(page, 1).getByRole('button', { name: 'Approve v1' }).click();
  await expect(row(page, 1)).toContainText('Approved');
  const rail = page.getByRole('navigation', { name: 'Versions' });
  await expect(rail.getByRole('button', { name: /^v1/ })).toContainText('approved');

  await row(page, 1).getByRole('button', { name: 'Withdraw v1' }).click();
  await expect(row(page, 1).getByRole('button', { name: 'Approve v1' })).toBeVisible();
  await expect(rail.getByRole('button', { name: /^v1/ })).not.toContainText('approved');
});

test('selecting a row plays that version, and the rail follows', async ({ page }) => {
  await openPicker(page);

  await row(page, 1).getByRole('button', { name: 'v1', exact: true }).click();

  await expect(page.getByRole('navigation', { name: 'Versions' }).getByRole('button', { name: /^v1/ })).toHaveAttribute('aria-current', 'true');
  await expect(row(page, 1)).toHaveAttribute('aria-current', 'true');
  await expect(picker(page).locator('iframe[title$=" page"]')).toHaveAttribute('src', /\/v1\//);
  await expect(panel(page).getByRole('heading', { name: 'Render v1' })).toBeVisible();
});

test('a refused Final shows its reasons; a Draft renders and the finished file plays', async ({ page }) => {
  test.setTimeout(RENDER_WAIT_MS + 30_000);
  await openPicker(page);
  await expect(panel(page).getByRole('heading', { name: 'Render v2' })).toBeVisible();

  await panel(page).getByRole('radio', { name: 'Final' }).check();
  await expect(panel(page).getByLabel('Size')).toHaveValue('source');
  await panel(page).getByRole('button', { name: 'Render', exact: true }).click();
  await expect(panel(page).getByRole('alert')).toContainText("isn't approved");

  await panel(page).getByRole('radio', { name: 'Draft' }).check();
  await expect(panel(page).getByLabel('Size')).toHaveValue('half');
  await panel(page).getByRole('button', { name: 'Render', exact: true }).click();
  await expect(panel(page).getByRole('status')).toContainText('queued');

  const past = page.getByRole('list', { name: 'Past renders' });
  const draft = past.getByRole('listitem').filter({ hasText: 'product-showreel-v2-draft-540p30.mp4' });
  await expect(draft).toBeVisible({ timeout: RENDER_WAIT_MS });
  await expect(draft.getByRole('button', { name: 'Show in folder' })).toBeVisible();
  await draft.getByRole('button', { name: 'Play' }).click();

  const video = picker(page).getByLabel('Render product-showreel-v2-draft-540p30.mp4');
  await expect(video).toHaveAttribute('src', /\/renders\/product-showreel\/product-showreel-v2-draft-540p30\.mp4$/);
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.duration), { timeout: 15_000 }).toBeGreaterThan(1);
  await picker(page).getByRole('button', { name: 'Back to v2' }).click();
  await expect(picker(page).locator('iframe[title$=" page"]')).toBeVisible();
});
