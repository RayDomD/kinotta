import { expect, test } from '@playwright/test';

test('editor shell lists reels newest change first and opens the newest', async ({ page }) => {
  await page.goto('/');

  const rail = page.getByRole('navigation', { name: 'Reels' });
  await expect(page.getByText(/^Reels in kinotta-e2e-.+\/reels$/)).toBeVisible();
  await expect(rail.getByRole('button')).toHaveText(['Product showreel', 'B-roll cutdown']);

  await expect(rail.getByRole('button', { name: 'Product showreel' })).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('.reelname')).toContainText('Product showreel');

  await rail.getByRole('button', { name: 'B-roll cutdown' }).click();
  await expect(rail.getByRole('button', { name: 'B-roll cutdown' })).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('.reelname')).toContainText('B-roll cutdown');
});

test('phase nav shows Storyboard as current and the other phases as inactive', async ({ page }) => {
  await page.goto('/');

  const phases = page.getByRole('navigation', { name: 'Phase' });
  await expect(phases.getByText('Storyboard')).toHaveAttribute('aria-current', 'page');
  await expect(phases.getByText('Review')).toHaveAttribute('aria-disabled', 'true');
  await expect(phases.getByText('Picker')).toHaveAttribute('aria-disabled', 'true');
  await expect(phases.getByRole('link')).toHaveCount(0);
});
