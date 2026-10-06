import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/** Two Drafts of the showreel, one after the other. */
const RENDER_WAIT_MS = 150_000;

// The showreel sample on its own server (playwright.config.ts), since renders are queued and cancelled on it.
test.use({ baseURL: 'http://localhost:4379' });

const panel = (page: Page): Locator => page.getByRole('complementary', { name: 'Render' });
const queue = (page: Page): Locator => panel(page).getByRole('list', { name: 'Queue' });
const phases = (page: Page): Locator => page.getByRole('navigation', { name: 'Phase' });

async function renderDraft(page: Page, version: number): Promise<void> {
  await page.getByRole('main', { name: 'Picker' }).getByRole('button', { name: `v${version}`, exact: true }).click();
  await expect(panel(page).getByRole('heading', { name: `Render v${version}` })).toBeVisible();
  await panel(page).getByRole('radio', { name: 'Draft' }).check();
  await panel(page).getByRole('button', { name: 'Render', exact: true }).click();
  await expect(panel(page).getByRole('status').filter({ hasText: 'queued' })).toBeVisible();
}

test('renders run in the background: progress on every tab, a queue with cancel, and a ready notice', async ({ page }) => {
  test.setTimeout(RENDER_WAIT_MS + 30_000);
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: /Product showreel/ }).click();
  await phases(page).getByRole('button', { name: 'Picker' }).click();

  await renderDraft(page, 2);
  await renderDraft(page, 1);

  // Every tab shows the running render in the top bar.
  await phases(page).getByRole('button', { name: 'Storyboard' }).click();
  const indicator = page.getByRole('banner').getByRole('status', { name: 'Render' });
  await expect(indicator).toContainText(/Rendering v2 Draft \d+%/);
  await expect(indicator).toContainText('1 waiting');
  await phases(page).getByRole('button', { name: 'Review' }).click();
  await expect(indicator).toContainText('Rendering v2 Draft');

  // Picker's queue: the running job with its progress and estimate, then the waiting one.
  await phases(page).getByRole('button', { name: 'Picker' }).click();
  const items = queue(page).getByRole('listitem');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText(/v2 Draft · \d+%/);
  // The estimate comes with the first frames, which can take a while when the machine is busy.
  await expect(items.nth(0)).toContainText(/left/, { timeout: 30_000 });
  await expect(items.nth(1)).toContainText('v1 Draft · waiting');

  // Cancel the running one: it leaves the queue and the waiting one starts.
  await items.nth(0).getByRole('button', { name: 'Cancel v2 Draft' }).click();
  // Cancel stops every render process and removes the files first, slower when the machine is busy.
  await expect(items).toHaveCount(1, { timeout: 30_000 });
  await expect(items.nth(0)).toContainText(/v1 Draft · \d+%/, { timeout: 30_000 });

  // It finishes: the ready notice, on whatever tab is open, plays the file.
  await phases(page).getByRole('button', { name: 'Storyboard' }).click();
  const notice = page.getByRole('status', { name: 'Render ready' });
  await expect(notice).toContainText('v1 Draft is ready', { timeout: RENDER_WAIT_MS });
  await expect(notice.getByRole('button', { name: 'Show in folder' })).toBeVisible();
  await notice.getByRole('button', { name: 'Play' }).click();
  await expect(phases(page).getByRole('button', { name: 'Picker' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('main', { name: 'Picker' }).getByLabel('Render product-showreel-v1-draft-540p30.mp4')).toBeVisible();

  // The cancelled render left no file: only v1's Draft is in past renders.
  await expect(page.getByRole('list', { name: 'Past renders' }).getByRole('listitem')).toHaveCount(1);
  await expect(indicator).toHaveCount(0);
});
