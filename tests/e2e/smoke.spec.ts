import { expect, test } from '../helpers/editor-test.ts';

test('editor shell lists reels newest change first and opens the newest', async ({ page }) => {
  await page.goto('/');

  const rail = page.getByRole('navigation', { name: 'Reels' });
  await expect(page.locator('[data-rail-fold="reels"]')).toContainText('Reels');
  await expect(rail.getByRole('button')).toHaveText(['Product showreel', 'B-roll cutdown']);

  await expect(rail.getByRole('button', { name: 'Product showreel' })).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('.reelname')).toContainText('Product showreel');

  await rail.getByRole('button', { name: 'B-roll cutdown' }).click();
  await expect(rail.getByRole('button', { name: 'B-roll cutdown' })).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('.reelname')).toContainText('B-roll cutdown');
});

test('phase nav shows Storyboard as current with Edit and Colour as tabs; Picker is part of Edit', async ({ page }) => {
  await page.goto('/');

  const phases = page.getByRole('navigation', { name: 'Phase' });
  await expect(phases.getByRole('button', { name: /^Storyboard/ })).toHaveAttribute('aria-current', 'page');
  await expect(phases.getByRole('button', { name: 'Edit', exact: true })).not.toHaveAttribute('aria-current', 'page');
  await expect(phases.getByRole('button', { name: 'Colour', exact: true })).not.toHaveAttribute('aria-current', 'page');
  await expect(phases.getByRole('button')).toHaveCount(3);
  await expect(phases.getByRole('link')).toHaveCount(0);
});
