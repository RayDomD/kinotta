import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { cpSync, mkdirSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { startServer } from '../../server/main.ts';
import { copyFixture, setReelMtime } from '../helpers/project.ts';
import { alternatesFixture } from '../helpers/parts.ts';

const SLUG = 'product-showreel';
const MODE_KEY = 'kinotta-mode';
const HINT_KEY = 'kinotta-first-cut-dismissed:';
const ARTIFACTS = resolve('tests/artifacts/top-bar');
const top = (page: Page) => page.locator('header.top');
const phases = (page: Page) => top(page).getByRole('navigation', { name: 'Phase' });
const views = (page: Page) => top(page).getByRole('group', { name: 'Edit view' });
const exportMenu = (page: Page) => page.getByRole('dialog', { name: 'Export', exact: true });
async function more(page: Page, action: string) {
  await top(page).getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: action, exact: true }).click();
}
function fixture() {
  const dir = copyFixture('showreel-project');
  setReelMtime(dir, 'broll-cutdown', new Date('2026-01-01'));
  setReelMtime(dir, SLUG, new Date('2026-02-01'));
  return dir;
}
test.beforeEach(() => { process.env.KINOTTA_HOME = mkdtempSync(join(tmpdir(), 'kinotta-top-bar-home-')); });

test('Storyboard and Edit share the bar; the edit view persists after reload and across tabs', async ({ page, context }) => {
  const server = await startServer({ projectDir: fixture(), port: 0 });
  try {
    await page.goto(server.url);
    await expect(views(page).getByRole('button', { name: 'Simple', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.sm-top')).toHaveCount(0);
    const before = await server.project.readEditList(SLUG);
    await phases(page).getByRole('button', { name: /^Storyboard/ }).click();
    await expect(page.locator('.grid')).toBeVisible();
    await expect(views(page)).toHaveCount(0);
    await phases(page).getByRole('button', { name: 'Edit', exact: true }).click();
    await views(page).getByRole('button', { name: 'Editor', exact: true }).click();
    await expect(page.locator('[data-review-shell="true"]')).toBeVisible();
    await page.reload();
    await expect(views(page).getByRole('button', { name: 'Editor', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const second = await context.newPage();
    await second.goto(server.url);
    await expect(views(second).getByRole('button', { name: 'Editor', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await views(second).getByRole('button', { name: 'Simple', exact: true }).click();
    await expect(views(page).getByRole('button', { name: 'Simple', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(await server.project.readEditList(SLUG)).toEqual(before);
    await second.close();
  } finally { await server.close(); }
});

test('More waits for the reel listing before exposing its actions', async ({ page }) => {
  const server = await startServer({ projectDir: fixture(), port: 0 });
  let release = () => {};
  const gate = new Promise<void>((done) => { release = done; });
  try {
    await page.route('**/api/reels', async (route) => { await gate; await route.continue(); });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(server.url);
    await expect(top(page).getByRole('button', { name: 'More', exact: true })).toBeDisabled();
    release();
    await expect(top(page).getByRole('button', { name: 'More', exact: true })).toBeEnabled();
    await more(page, 'New reel');
    await expect(page.locator('.sm-make')).toBeVisible();
  } finally { release(); await server.close(); }
});

test('the old session preference migrates once to local storage', async ({ page }) => {
  const server = await startServer({ projectDir: fixture(), port: 0 });
  try {
    await page.addInitScript(() => sessionStorage.setItem('kinotta-mode', 'editor'));
    await page.goto(server.url);
    await phases(page).getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(views(page).getByRole('button', { name: 'Editor', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate((key) => localStorage.getItem(key), MODE_KEY)).toBe('editor');
    await views(page).getByRole('button', { name: 'Simple', exact: true }).click();
    await page.reload();
    await expect(views(page).getByRole('button', { name: 'Simple', exact: true })).toHaveAttribute('aria-pressed', 'true');
  } finally { await server.close(); }
});

test('Export sends the preset and selected size for Working and exposes detailed settings', async ({ page }) => {
  const server = await startServer({ projectDir: copyFixture('footage-project'), port: 0 });
  try {
    const requests: Array<{ preset: string; size: string; fps: number | string; audio: string }> = [];
    await page.route('**/working-render', async (route) => {
      requests.push(route.request().postDataJSON());
      await route.fulfill({ json: { id: 'export-test', version: 2, working: true } });
    });
    await page.goto(server.url);
    await top(page).getByRole('button', { name: 'Export', exact: true }).click();
    const menu = exportMenu(page);
    await expect(menu.getByRole('button', { name: '1080p', exact: true })).toHaveAttribute('aria-pressed', 'true');
    for (const preset of ['Draft', 'Final', 'Overlay']) {
      await menu.getByRole('radio', { name: preset, exact: true }).check();
      await menu.getByRole('button', { name: '4K', exact: true }).click();
      await menu.getByRole('button', { name: 'Render', exact: true }).click();
      await expect.poll(() => requests.length).toBe(['Draft', 'Final', 'Overlay'].indexOf(preset) + 1);
      expect(requests.at(-1)).toMatchObject({ preset: preset.toLowerCase(), size: '4k' });
    }
    await menu.getByRole('button', { name: 'More settings\u2026', exact: true }).click();
    const detailed = page.getByRole('dialog', { name: 'Render Working', exact: true });
    await detailed.getByRole('combobox', { name: 'Frame rate', exact: true }).selectOption('24');
    await detailed.getByRole('combobox', { name: 'Size', exact: true }).selectOption('1080p');
    await detailed.getByRole('combobox', { name: 'Quality', exact: true }).selectOption('high');
    await detailed.getByRole('combobox', { name: 'Audio at cuts', exact: true }).selectOption('hard');
    await detailed.getByRole('button', { name: 'Render', exact: true }).click();
    await expect.poll(() => requests.length).toBe(4);
    expect(requests.at(-1)).toMatchObject({ size: '1080p', fps: 24, quality: 'high', audio: 'hard' });
    await page.keyboard.press('Escape');
    await expect(detailed).toHaveCount(0);
    await expect(top(page).getByRole('button', { name: 'Export', exact: true })).toBeFocused();
  } finally { await server.close(); }
});

test('Export renders the frozen version that is open, including after switching to Simple', async ({ page }) => {
  const server = await startServer({ projectDir: fixture(), port: 0 });
  try {
    await page.route('**/api/reels/*/agent', (route) => route.fulfill({ json: { job: {
      id: 'ready-test', reel: SLUG, version: 1, provider: 'copy', state: 'succeeded', elapsedSeconds: 1,
      createdAt: new Date().toISOString(), canCopy: false, canRetry: false,
    } } }));
    let queued: unknown;
    await page.route('**/api/renders', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      queued = route.request().postDataJSON();
      await route.fulfill({ json: { id: 'frozen-test', version: 1 } });
    });
    await page.goto(server.url);
    await page.getByRole('button', { name: 'Open v1', exact: true }).click();
    await views(page).getByRole('button', { name: 'Simple', exact: true }).click();
    await top(page).getByRole('button', { name: 'Export', exact: true }).click();
    await exportMenu(page).getByRole('radio', { name: 'Draft', exact: true }).check();
    await exportMenu(page).getByRole('button', { name: 'Render', exact: true }).click();
    await expect.poll(() => queued).toMatchObject({ reel: SLUG, version: 1, preset: 'draft', size: '1080p' });
  } finally { await server.close(); }
});

test('Export holds queue progress and Cancel, and recent renders with Play and Show in folder', async ({ page }) => {
  const server = await startServer({ projectDir: fixture(), port: 0 });
  try {
    await page.route('**/api/renders', (route) => route.fulfill({ json: { jobs: [{ id: 'queued-test', reel: SLUG, version: 2, preset: 'draft', state: 'running', progress: 0.42, remaining: 30 }] } }));
    await page.route('**/api/renders/queued-test', (route) => route.fulfill({ json: { cancelled: true } }));
    await page.route('**/api/reels/*/renders', (route) => route.fulfill({ json: { renders: [{ file: 'recent.mp4', preset: 'final', at: '2026-10-27T00:00:00Z', bytes: 100, version: 2 }] } }));
    let revealed = false;
    await page.route('**/renders/recent.mp4/reveal', (route) => { revealed = true; return route.fulfill({ json: {} }); });
    await page.goto(server.url);
    await page.setViewportSize({ width: 800, height: 900 });
    await expect(top(page).getByRole('button', { name: 'Export', exact: true })).toContainText('Export');
    await top(page).getByRole('button', { name: 'Export', exact: true }).click();
    const menu = exportMenu(page);
    await expect(menu.getByRole('list', { name: 'Queue' })).toContainText('42%');
    const cancelled = page.waitForRequest((request) => request.method() === 'DELETE' && request.url().endsWith('/queued-test'));
    await menu.getByRole('button', { name: 'Cancel v2 Draft', exact: true }).click();
    await cancelled;
    const recent = menu.getByRole('list', { name: 'Past renders' });
    await recent.getByRole('button', { name: 'Show in folder', exact: true }).click();
    await expect.poll(() => revealed).toBe(true);
    await recent.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.getByLabel('Render recent.mp4', { exact: true })).toBeVisible();
  } finally { await server.close(); }
});

test('More opens Library, Settings, All reels in each view, and New reel', async ({ page }) => {
  const server = await startServer({ projectDir: fixture(), port: 0 });
  try {
    await page.goto(server.url);
    await more(page, 'Library');
    await expect(page.locator('.library-page')).toBeVisible();
    await page.getByRole('button', { name: /Back to/ }).click();
    await more(page, 'Settings');
    await expect(page.getByRole('dialog', { name: 'Settings', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close Settings', exact: true }).click();
    await more(page, 'All reels');
    await page.getByRole('combobox', { name: 'Choose reel', exact: true }).selectOption('broll-cutdown');
    await expect(top(page)).toContainText('B-roll cutdown');
    await views(page).getByRole('button', { name: 'Editor', exact: true }).click();
    await more(page, 'All reels');
    await expect(page.getByRole('navigation', { name: 'Reels', exact: true })).toBeVisible();
    await page.getByRole('navigation', { name: 'Reels', exact: true }).getByRole('button', { name: /Product showreel/ }).click();
    await more(page, 'New reel');
    await expect(page.locator('.sm-make')).toBeVisible();
  } finally { await server.close(); }
});

for (const made of ['auto', 'direct', undefined] as const) {
  test(`Storyboard choice badge and first-cut hint for ${made ?? 'legacy Auto'}`, async ({ page }) => {
    const { dir } = alternatesFixture();
    const file = join(dir, 'reels/parts/reel.json');
    const metadata = JSON.parse(readFileSync(file, 'utf8'));
    writeFileSync(file, JSON.stringify({ ...metadata, ...(made ? { made } : {}) }));
    const server = await startServer({ projectDir: dir, port: 0 });
    try {
      await server.project.buildParts('parts');
      await page.goto(server.url);
      const badge = top(page).getByRole('status', { name: 'Shots needing a choice' });
      await expect(badge).toHaveAttribute('data-made', made ?? 'auto');
      if (made === 'direct') {
        expect(await badge.evaluate((element) => {
          const probe = document.createElement('span');
          probe.style.color = 'var(--changed)'; element.append(probe);
          const expected = getComputedStyle(probe).color; probe.remove();
          return getComputedStyle(element).color === expected;
        })).toBe(true);
        await expect(badge.locator('.num')).toHaveCSS('color', await badge.evaluate((element) => getComputedStyle(element).color));
        await expect(page.getByRole('status', { name: 'First cut', exact: true })).toHaveCount(0);
      } else {
        await expect(badge).toContainText('have other options');
        const hint = page.getByRole('status', { name: 'First cut', exact: true });
        await expect(hint).toContainText('This is your first cut. To rearrange shots or pin effects, open Storyboard.');
        if (made === 'auto') await hint.getByRole('button', { name: 'Open Storyboard', exact: true }).click();
        else await hint.getByRole('button', { name: 'Dismiss', exact: true }).click();
        expect(await page.evaluate((key) => localStorage.getItem(key), HINT_KEY + 'parts')).toBe('true');
        await phases(page).getByRole('button', { name: 'Edit', exact: true }).click();
        await page.reload();
        await expect(hint).toHaveCount(0);
      }
    } finally { await server.close(); }
  });
}

test('the shared bar and menus fit at 1440px and 390px', async ({ page }) => {
  const server = await startServer({ projectDir: fixture(), port: 0 });
  try {
    await page.goto(server.url);
    mkdirSync(ARTIFACTS, { recursive: true });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const view of ['Simple', 'Editor']) {
        await views(page).getByRole('button', { name: view, exact: true }).click();
        await expect(top(page).locator('.copy button').first()).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const bounds = (await top(page).boundingBox())!;
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
        for (const label of ['Export', 'More']) {
          await top(page).getByRole('button', { name: label, exact: true }).click();
          const menu = page.getByRole('dialog', { name: label, exact: true });
          await expect(menu).toBeVisible();
          const box = (await menu.boundingBox())!;
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(width);
          await page.screenshot({ animations: 'disabled', path: join(ARTIFACTS, `${view.toLowerCase()}-${label.toLowerCase()}-${width}.png`) });
          await page.keyboard.press('Escape');
        }
        await page.screenshot({ animations: 'disabled', path: join(ARTIFACTS, `${view.toLowerCase()}-${width}.png`) });
      }
      await phases(page).getByRole('button', { name: /^Storyboard/ }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ animations: 'disabled', path: join(ARTIFACTS, `storyboard-${width}.png`) });
      await phases(page).getByRole('button', { name: 'Edit', exact: true }).click();
    }
  } finally { await server.close(); }
});

test('Simple Edit keeps the last two-minute ruler label visible without horizontal scroll at 390px and 1440px', async ({ page }) => {
  const dir = copyFixture('footage-project');
  const version = join(dir, 'reels/founder-talk/v1');
  // Match the manual run length: its last major tick falls just beyond the reel end.
  const duration = 119.954;
  cpSync(join(dir, 'media/talk.mp4'), join(version, 'footage.mp4'));
  cpSync(join(dir, 'reels/founder-talk/transcript.json'), join(version, 'transcript.json'));
  writeFileSync(join(version, 'plan.json'), JSON.stringify({ duration, video: 'footage.mp4', transcript: 'transcript.json', pieces: [{ in: 0, out: duration }], clips: [], captions: true }));
  cpSync(join(version, 'plan.json'), join(dir, 'reels/founder-talk/plan.json'));
  writeFileSync(join(version, 'shots.json'), JSON.stringify({ contract: 1, duration, shots: [] }));
  const server = await startServer({ projectDir: dir, port: 0 });
  try {
    await page.route('**/api/reels/*/agent', (route) => route.fulfill({ json: { job: {
      id: 'phone-progress', reel: 'founder-talk', provider: 'claude', state: 'running',
      createdAt: new Date().toISOString(), elapsedSeconds: 30, canCopy: false, canRetry: false,
    } } }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(server.url);
    await expect(page.getByRole('region', { name: 'B-roll progress' })).toBeVisible();
    await expect(page.getByLabel('Simple timeline ruler')).toBeVisible();
    await expect(page.locator('[data-verify-unit=Transport]')).toHaveAttribute('data-verify-total', String(duration));
    const app = page.locator('.app.sm-app');
    mkdirSync(ARTIFACTS, { recursive: true });
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      const lastLabel = page.getByLabel('Simple timeline ruler').locator('.sm-tick.major span').last();
      await expect(lastLabel).toHaveText('02:00');
      await expect(lastLabel).toBeVisible();
      const appBox = (await app.boundingBox())!;
      const labelBox = (await lastLabel.boundingBox())!;
      expect(labelBox.x).toBeGreaterThanOrEqual(appBox.x);
      expect(labelBox.x + labelBox.width).toBeLessThanOrEqual(appBox.x + appBox.width);
      const rulerBox = (await page.getByLabel('Simple timeline ruler').boundingBox())!;
      expect(labelBox.x).toBeGreaterThanOrEqual(rulerBox.x);
      expect(labelBox.x + labelBox.width).toBeLessThanOrEqual(rulerBox.x + rulerBox.width);
      const overflow = await app.evaluate((element) => ({
        clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
        children: [...element.querySelectorAll('*')].filter((child) => child.getBoundingClientRect().right > element.getBoundingClientRect().left + element.clientWidth).map((child) => ({ className: child.className, right: child.getBoundingClientRect().right })),
      }));
      expect(overflow.scrollWidth, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.clientWidth);
      await page.getByLabel('Simple timeline ruler').screenshot({ animations: 'disabled', path: join(ARTIFACTS, `simple-ruler-${width}.png`) });
    }
  } finally { await server.close(); }
});
