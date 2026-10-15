import { expect, test } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { startServer } from '../../server/main.ts';
import { copyFixture } from '../helpers/project.ts';
import { invariants as railChecks } from '../../web/src/App.verify.ts';
import { invariants as reviewChecks } from '../../web/src/review/_internal/Review.verify.ts';
import { invariants as renderChecks } from '../../web/src/Renders.verify.ts';
import { revealReelRail } from '../helpers/review-rail.ts';

test('Working is distinct from frozen history, survives reopen, and shows author names and working render choices', async ({ page }) => {
  const server = await startServer({ projectDir: copyFixture('showreel-project'), port: 0 });
  try {
    const reel = 'product-showreel';
    await server.project.addOperation(reel, { kind: 'element-offset', clip: 'cube-lands', element: 'cube', x: 10, y: 0, scale: 1, by: 'Codex' });
    await page.goto(server.url);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: /Product showreel/ }).click();
    await page.getByRole('navigation', { name: 'Phase' }).getByRole('button', { name: 'Review' }).click();
    await revealReelRail(page);
    const versions = page.getByRole('navigation', { name: 'Versions' });
    for (const check of railChecks) expect(await versions.evaluate(check.check), check.description).toBe(true);
    for (const check of renderChecks) expect(await page.locator('[data-verify-unit="VersionActions"]').evaluate(check.check), check.description).toBe(true);
    await expect(versions.getByRole('button', { name: /^Working/ })).toHaveAttribute('aria-current', 'true');
    await expect(versions.getByRole('button', { name: /^Working/ })).toContainText('1 edit since v2');
    await expect(page.getByRole('button', { name: /^Save|^Discard/ })).toHaveCount(0);
    await page.getByRole('tab', { name: /^Edits/ }).click();
    await expect(page.getByRole('list', { name: 'Edits' })).toContainText('Codex');
    await page.getByRole('button', { name: 'Render Working', exact: true }).click();
    const render = page.getByRole('dialog', { name: 'Render Working' });
    await expect(render.getByText('Draft of Working', { exact: true })).toBeVisible();
    await expect(render.getByText('Final, freezes as v3', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await server.project.addOperation(reel, { kind: 'element-offset', clip: 'cube-lands', element: 'cube', x: 20, y: 0, scale: 1, by: 'Claude' });
    await expect(versions.getByRole('button', { name: /^Working/ })).toContainText('2 edits since v2');
    await expect(page.getByRole('list', { name: 'Edits' })).toContainText('Claude');
    await versions.getByRole('button', { name: /^v2/ }).click();
    await expect(page.getByText('You are viewing v2, a frozen version.', { exact: true })).toBeVisible();
    const review = page.locator('[data-verify-unit="Review"]');
    for (const check of reviewChecks) expect(await review.evaluate(check.check), check.description).toBe(true);
    await review.evaluate((root) => { const invalid = document.createElement('span'); invalid.dataset.verifyEditable = 'true'; invalid.id = 'invalid-editing-fixture'; root.append(invalid); });
    expect(await review.evaluate(reviewChecks[3].check)).toBe(false);
    await review.locator('#invalid-editing-fixture').evaluate((root) => root.remove());
    await versions.getByRole('button', { name: /^Working/ }).evaluate((root) => root.setAttribute('aria-current', 'true'));
    expect(await versions.evaluate(railChecks[1].check)).toBe(false);
    await versions.getByRole('button', { name: /^Working/ }).evaluate((root) => root.removeAttribute('aria-current'));
    const actions = page.locator('[data-verify-unit="VersionActions"]');
    await actions.evaluate((root) => { root.setAttribute('data-verify-working', 'true'); const invalid = document.createElement('span'); invalid.className = 'pk-base'; root.append(invalid); });
    expect(await actions.evaluate(renderChecks[2].check)).toBe(false);
    await actions.locator('.pk-base').evaluate((root) => root.remove());
    await actions.evaluate((root) => root.setAttribute('data-verify-working', 'false'));
    mkdirSync(resolve('tests/artifacts/working'), { recursive: true });
    await page.screenshot({ path: resolve('tests/artifacts/working/frozen-desktop.png'), fullPage: true });
    for (const button of await page.getByRole('list', { name: 'Edits' }).getByRole('button', { name: /Remove/ }).all()) await expect(button).toBeDisabled();
    await page.getByRole('button', { name: 'Back to Working' }).click();
    await page.reload();
    await revealReelRail(page);
    await expect(versions.getByRole('button', { name: /^Working/ })).toHaveAttribute('aria-current', 'true');
    await expect(page.getByRole('list', { name: 'Edits' })).toContainText('Codex');
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
    await expect(page.frameLocator('iframe[title="Authored graphics"]').locator('[data-scene="cube-lands"] [data-el="cube"]')).toBeVisible();
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      if (width <= 900) {
        const row = await versions.getByRole('button', { name: /^Working/ }).boundingBox();
        const rail = await page.getByRole('complementary', { name: 'Project' }).boundingBox();
        expect(row!.y + row!.height).toBeLessThanOrEqual(rail!.y + rail!.height);
        await expect.poll(async () => {
          // Tracks scroll inside their pane; the side panel follows the visible pane.
          const timeline = await page.locator('.rv-tracks-pane').boundingBox();
          const side = await page.locator('.rv-side').boundingBox();
          return side!.y - timeline!.y - timeline!.height;
        }).toBeGreaterThanOrEqual(0);
      }
      await page.screenshot({ path: resolve(`tests/artifacts/working/working-${width}.png`), fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  } finally { await server.close(); }
});

test('a frozen native mix opens with exact captured inputs and no working operations applied again', async ({ page }) => {
  const dir = copyFixture('showreel-project');
  const file = join(dir, 'sound.wav');
  const made = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.4', file], { encoding: 'utf8' });
  expect(made.status, made.stderr).toBe(0);
  const server = await startServer({ projectDir: dir, port: 0 });
  try {
    const sound = await server.project.importMedia('sound.wav', (async function* () { yield readFileSync(file); })());
    await server.project.addOperation('product-showreel', { kind: 'placement-add', source: { id: sound.id, name: sound.name, kind: 'audio', path: `../../../${sound.path}`, duration: sound.duration }, placement: { id: 'sound-use', role: 'audio', source: sound.id, at: 1, in: 0, out: 0.4, gain: 0.35 } });
    await server.project.freezeEdits('product-showreel');
    await page.goto(server.url);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: /Product showreel/ }).click();
    await page.getByRole('navigation', { name: 'Phase' }).getByRole('button', { name: 'Review' }).click();
    await revealReelRail(page);
    await page.getByRole('navigation', { name: 'Versions' }).getByRole('button', { name: /^v3/ }).click();
    const editor = page.locator('[data-verify-unit="MediaEditor"]');
    await expect(editor).toBeVisible();
    await expect(editor).toHaveAttribute('data-verify-count', '1');
    await expect(page.getByText('You are viewing v3, a frozen version.', { exact: true })).toBeVisible();
    await expect(page.getByRole('main', { name: 'Review' }).getByRole('button', { name: 'Snip', exact: true })).toBeDisabled();
  } finally { await server.close(); }
});
