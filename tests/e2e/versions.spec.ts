import { expect, test } from '../helpers/editor-test.ts';
import { cpSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectFile, serverUrl } from './ports.ts';

test.use({ baseURL: serverUrl('versions') });
test.describe.configure({ mode: 'serial' });

test('Current replaces numbered history and retains Undo', async ({ page }) => {
  await page.goto('/');
  const current = page.getByRole('navigation', { name: 'Current reel', exact: true });
  await expect(current.getByRole('button')).toHaveText('Current0 edits');
  await expect(current.getByRole('button')).toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('group', { name: 'Current reel history' }).getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  await expect(page.getByRole('navigation', { name: 'Versions', exact: true })).toHaveCount(0);
});

test('frozen versions remain readable, while the removed approval route has no handler', async ({ request }) => {
  expect((await request.get('/api/reels/product-showreel/versions/1')).status()).toBe(200);
  const listed = await (await request.get('/api/reels/product-showreel/versions')).json();
  expect(listed.versions.map((entry: { number: number }) => entry.number)).toEqual([1, 2]);
  expect((await request.put('/api/reels/product-showreel/versions/2/approval')).status()).toBe(405);
});

test('a new build becomes Current without exposing numbered history', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Storyboard, v2');
  const project = readFileSync(projectFile('versions'), 'utf8');
  const reel = join(project, 'reels/product-showreel');
  mkdirSync(join(reel, 'v3'));
  cpSync(join(reel, 'v2/index.html'), join(reel, 'v3/index.html'));
  cpSync(join(reel, 'v2/shots.json'), join(reel, 'v3/shots.json'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Storyboard, v3');
  await expect(page.locator('[data-working-row]')).toHaveAttribute('data-current-version', '3');
  await expect(page.getByRole('navigation', { name: 'Current reel', exact: true }).getByRole('button')).toHaveCount(1);
});
