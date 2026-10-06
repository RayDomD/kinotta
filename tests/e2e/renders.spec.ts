import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/** Two Drafts of the showreel, one after the other. */
const RENDER_WAIT_MS = 150_000;

// The showreel sample on its own server (playwright.config.ts), since renders are queued and cancelled on it.
test.use({ baseURL: 'http://localhost:4379' });

const phases = (page: Page): Locator => page.getByRole('navigation', { name: 'Phase' });
const menuButton = (page: Page): Locator => page.getByRole('banner').getByRole('button', { name: 'Renders' });
const menu = (page: Page): Locator => page.getByRole('dialog', { name: 'Renders' });
const queue = (page: Page): Locator => menu(page).getByRole('list', { name: 'Queue' });

async function renderDraft(page: Page, version: number): Promise<void> {
  await page.getByRole('navigation', { name: 'Versions' }).getByRole('button', { name: new RegExp(`^v${version}`) }).click();
  await page.getByRole('group', { name: 'Version actions' }).getByRole('button', { name: `Render v${version}` }).click();
  const form = page.getByRole('dialog', { name: `Render v${version}` });
  await form.getByRole('radio', { name: 'Draft' }).check();
  await form.getByRole('button', { name: 'Render', exact: true }).click();
  await expect(form.getByRole('status').filter({ hasText: 'queued' })).toBeVisible();
  await page.keyboard.press('Escape');
}

test('renders run in the background: progress on every tab, a queue with cancel, and a ready notice', async ({ page }) => {
  test.setTimeout(RENDER_WAIT_MS + 30_000);
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: /Product showreel/ }).click();
  await phases(page).getByRole('button', { name: 'Review' }).click();

  await renderDraft(page, 2);
  await renderDraft(page, 1);

  // Every tab shows the running render on the top bar's render button.
  await phases(page).getByRole('button', { name: 'Storyboard' }).click();
  await expect(menuButton(page)).toContainText(/Rendering v2 Draft \d+%/);
  await expect(menuButton(page)).toContainText('1 waiting');
  await phases(page).getByRole('button', { name: 'Review' }).click();
  await expect(menuButton(page)).toContainText('Rendering v2 Draft');

  // The render menu's queue: the running job with its progress and estimate, then the waiting one.
  await menuButton(page).click();
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
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);

  // It finishes: the ready notice, on whatever tab is open, plays the file in Review.
  await phases(page).getByRole('button', { name: 'Storyboard' }).click();
  const notice = page.getByRole('status', { name: 'Render ready' });
  await expect(notice).toContainText('v1 Draft is ready', { timeout: RENDER_WAIT_MS });
  await expect(notice.getByRole('button', { name: 'Show in folder' })).toBeVisible();
  await notice.getByRole('button', { name: 'Play' }).click();
  await expect(phases(page).getByRole('button', { name: 'Review' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('main', { name: 'Review' }).getByLabel('Render product-showreel-v1-draft-540p30.mp4')).toBeVisible();

  // The cancelled render left no file: only v1's Draft is in past renders, and nothing is rendering.
  await expect(menuButton(page)).not.toContainText('Rendering');
  await menuButton(page).click();
  await expect(menu(page).getByRole('list', { name: 'Past renders' }).getByRole('listitem')).toHaveCount(1);
  await expect(menu(page)).toContainText('Nothing rendering.');
});
