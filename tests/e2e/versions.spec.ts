import { expect, test } from '../helpers/editor-test.ts';
import type { Locator, Page } from '../helpers/editor-test.ts';
import { cpSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { revealReelRail } from '../helpers/review-rail.ts';
import { projectFile, serverUrl } from './ports.ts';

test.use({ baseURL: serverUrl('versions') });
test.describe.configure({ mode: 'serial' });

const REEL = 'product-showreel';
const current = (page: Page): Locator => page.getByRole('navigation', { name: 'Current reel', exact: true });
const saved = (page: Page): Locator => page.getByRole('navigation', { name: 'Versions', exact: true });
/** Words from the owner's old vocabulary that no screen should show any more. */
const FREEZE_WORD = /freez|frozen/i;

test('Current comes first with Undo, then every saved version, newest first', async ({ page }) => {
  await page.goto('/');
  await expect(current(page).getByRole('button')).toHaveText('Current0 edits');
  await expect(current(page).getByRole('button')).toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('group', { name: 'Current reel history' }).getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  await expect(saved(page).getByRole('button')).toHaveText([/^v2/, /^v1/]);
});

test('saved versions remain readable, while the removed approval route has no handler', async ({ request }) => {
  expect((await request.get('/api/reels/product-showreel/versions/1')).status()).toBe(200);
  const listed = await (await request.get('/api/reels/product-showreel/versions')).json();
  expect(listed.versions.map((entry: { number: number }) => entry.number)).toEqual([1, 2]);
  expect((await request.put('/api/reels/product-showreel/versions/2/approval')).status()).toBe(405);
});

test('a new build becomes Current and joins the list', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Storyboard, v2');
  const project = readFileSync(projectFile('versions'), 'utf8');
  const reel = join(project, 'reels/product-showreel');
  mkdirSync(join(reel, 'v3'));
  cpSync(join(reel, 'v2/index.html'), join(reel, 'v3/index.html'));
  cpSync(join(reel, 'v2/shots.json'), join(reel, 'v3/shots.json'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Storyboard, v3');
  await expect(page.locator('[data-working-row]')).toHaveAttribute('data-current-version', '3');
  await expect(current(page).getByRole('button')).toHaveCount(1);
  await expect(saved(page).getByRole('button')).toHaveText([/^v3/, /^v2/, /^v1/]);
});

test('open v1 from the rail read-only, use it, and Undo puts the current reel back', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: /Product showreel/ }).click();
  await page.getByRole('navigation', { name: 'Phase' }).getByRole('button', { name: 'Edit', exact: true }).click();
  await revealReelRail(page);

  // Opening a version reads it and nothing else: the banner says so, and Current is not the open row.
  await saved(page).getByRole('button', { name: /^v1/ }).click();
  await expect(saved(page).getByRole('button', { name: /^v1/ })).toHaveAttribute('aria-current', 'true');
  await expect(current(page).getByRole('button')).not.toHaveAttribute('aria-current', 'true');
  const banner = page.locator('.frozen-version-line');
  await expect(banner).toContainText('You are viewing v1, a saved version');
  expect((await (await page.request.get(`/api/reels/${REEL}/edits`)).json()).operations).toEqual([]);

  // Use this version: it becomes the current reel as one edit, shown in the Edits panel.
  await banner.getByRole('button', { name: 'Use this version', exact: true }).click();
  await expect(current(page).getByRole('button')).toHaveAttribute('aria-current', 'true');
  await expect(current(page).getByRole('button')).toContainText('1 edit');
  await expect(banner).toHaveCount(0);
  await page.getByRole('tab', { name: /^Edits/ }).click();
  await expect(page.getByRole('list', { name: 'Edits' }).getByRole('listitem')).toHaveCount(1);
  await expect(page.getByRole('list', { name: 'Edits' })).toContainText('Used v1');
  expect((await (await page.request.get(`/api/reels/${REEL}/working`)).json()).workingBase).toBe(1);
  // No version was made by choosing one.
  expect((await (await page.request.get(`/api/reels/${REEL}/versions`)).json()).versions).toHaveLength(3);

  // Undo is one step: the current reel is v3 again, with no edits.
  await page.getByRole('button', { name: /^Undo Ctrl/ }).click();
  await expect(current(page).getByRole('button')).toContainText('0 edits');
  await expect(page.getByRole('list', { name: 'Edits' })).toHaveCount(0);
  expect((await (await page.request.get(`/api/reels/${REEL}/working`)).json()).workingBase).toBe(3);
});

test('the rail offers Use this version for the open version, and the current reel refuses nothing', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: /Product showreel/ }).click();
  await page.getByRole('navigation', { name: 'Phase' }).getByRole('button', { name: 'Edit', exact: true }).click();
  await revealReelRail(page);
  await expect(page.getByRole('button', { name: 'Use this version', exact: true })).toHaveCount(0);
  await saved(page).getByRole('button', { name: /^v2/ }).click();
  await page.getByRole('complementary').getByRole('button', { name: 'Use this version', exact: true }).click();
  await expect(current(page).getByRole('button')).toContainText('1 edit');
  await page.getByRole('button', { name: /^Undo Ctrl/ }).click();
  await expect(current(page).getByRole('button')).toContainText('0 edits');
});

test('Use this version is off in the banner and the rail on the version the current reel already is', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: /Product showreel/ }).click();
  await page.getByRole('navigation', { name: 'Phase' }).getByRole('button', { name: 'Edit', exact: true }).click();
  await revealReelRail(page);
  await saved(page).getByRole('button', { name: /^v3/ }).click();
  await expect(page.locator('.frozen-version-line').getByRole('button', { name: 'Use this version', exact: true })).toBeDisabled();
  await expect(page.getByRole('complementary').getByRole('button', { name: 'Use this version', exact: true })).toBeDisabled();
});

test('Export lists Quick preview, Video and Transparent overlay, each with what it does and why', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('banner').getByRole('button', { name: 'Export', exact: true }).click();
  const menu = page.getByRole('dialog', { name: 'Export' });
  const presets = menu.getByRole('radio');
  await expect(presets).toHaveCount(3);
  await expect(menu.locator('.pk-preset')).toHaveText(['Quick preview', 'Video', 'Transparent overlay']);
  // Video is where it starts.
  await expect(menu.getByRole('radio', { name: 'Video', exact: true })).toBeChecked();
  // Each choice carries a tooltip and a visible "Why this?" line, which also describes its radio.
  const quick = menu.locator('.pk-preset', { hasText: 'Quick preview' });
  await expect(quick).toHaveAttribute('title', /fast, lower-quality video of Working\. Why this\? Cheap and fast to render.*Doesn't save a version/);
  await expect(menu.locator('.pk-why').nth(0)).toContainText("Why this? Cheap and fast to render; for checking timing or sending a quick look. Doesn't save a version.");
  await expect(menu.locator('.pk-preset', { hasText: 'Video' })).toHaveAttribute('title', /full-quality video\. Why this\? The one to publish\. Saves Working as/);
  await expect(menu.locator('.pk-why').nth(2)).toContainText('Why this? To lay over your footage in another editor such as Premiere.');
  await expect(menu.getByRole('radio', { name: 'Transparent overlay', exact: true })).toHaveAccessibleDescription(/To lay over your footage in another editor such as Premiere/);
});

test('no screen of the editor says freeze', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: /Product showreel/ }).click();
  const text = async (): Promise<string> => page.locator('body').evaluate((body) => `${(body as HTMLElement).innerText}\n${[...body.querySelectorAll('[title], [aria-label]')].map((element) => `${element.getAttribute('title') ?? ''} ${element.getAttribute('aria-label') ?? ''}`).join('\n')}`);
  const phases = page.getByRole('navigation', { name: 'Phase' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await text()).not.toMatch(FREEZE_WORD);
  await phases.getByRole('button', { name: 'Edit', exact: true }).click();
  await revealReelRail(page);
  await saved(page).getByRole('button', { name: /^v1/ }).click();
  expect(await text()).not.toMatch(FREEZE_WORD);
  await page.getByRole('banner').getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('button', { name: 'More settings…', exact: true }).click();
  expect(await text()).not.toMatch(FREEZE_WORD);
});

test('no screen of Simple mode says freeze', async ({ page }) => {
  // Simple mode as the owner meets it first: the helper's editor default is replaced before the page loads.
  await page.addInitScript(() => { try { localStorage.setItem('kinotta-mode', 'simple'); } catch { /* Not an app page. */ } });
  await page.goto('/');
  await expect(page.getByRole('group', { name: 'Edit view' }).getByRole('button', { name: 'Simple', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const body = await page.locator('body').evaluate((element) => `${(element as HTMLElement).innerText}\n${[...element.querySelectorAll('[title], [aria-label]')].map((node) => `${node.getAttribute('title') ?? ''} ${node.getAttribute('aria-label') ?? ''}`).join('\n')}`);
  expect(body).not.toMatch(FREEZE_WORD);
});
