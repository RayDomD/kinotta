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

test('phase nav shows Storyboard as current and Review as a tab; Picker is part of Review', async ({ page }) => {
  await page.goto('/');

  const phases = page.getByRole('navigation', { name: 'Phase' });
  await expect(phases.getByRole('button', { name: 'Storyboard' })).toHaveAttribute('aria-current', 'page');
  await expect(phases.getByRole('button', { name: 'Review' })).not.toHaveAttribute('aria-current', 'page');
  await expect(phases.getByRole('button')).toHaveCount(2);
  await expect(phases.getByRole('link')).toHaveCount(0);
});
