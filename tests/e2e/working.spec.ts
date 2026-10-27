import { expect, test } from '../helpers/editor-test.ts';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { startServer } from '../../server/main.ts';
import { copyFixture } from '../helpers/project.ts';
import { invariants as railChecks } from '../../web/src/App.verify.ts';
import { invariants as reviewChecks } from '../../web/src/review/_internal/Review.verify.ts';
import { invariants as renderChecks } from '../../web/src/Renders.verify.ts';
import { revealReelRail } from '../helpers/review-rail.ts';

test('Current survives reopen, preserves author names and supports Undo and Redo', async ({ page }) => {
  const server = await startServer({ projectDir: copyFixture('showreel-project'), port: 0 });
  try {
    const reel = 'product-showreel';
    await server.project.addOperation(reel, { kind: 'element-offset', clip: 'cube-lands', element: 'cube', x: 10, y: 0, scale: 1, by: 'Codex' });
    await page.goto(server.url);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: /Product showreel/ }).click();
    await page.getByRole('navigation', { name: 'Phase' }).getByRole('button', { name: 'Edit', exact: true }).click();
    await revealReelRail(page);
    const versions = page.getByRole('navigation', { name: 'Current reel', exact: true });
    for (const check of railChecks) expect(await versions.evaluate(check.check), check.description).toBe(true);
    for (const check of renderChecks) expect(await page.locator('[data-verify-unit="VersionActions"]').evaluate(check.check), check.description).toBe(true);
    await expect(versions.getByRole('button', { name: /^Current/ })).toHaveAttribute('aria-current', 'true');
    await expect(versions.getByRole('button', { name: /^Current/ })).toContainText('1 edit');
    await expect(page.getByRole('button', { name: /^Save|^Discard/ })).toHaveCount(0);
    await page.getByRole('tab', { name: /^Edits/ }).click();
    await expect(page.getByRole('list', { name: 'Edits' })).toContainText('Codex');
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByRole('button', { name: 'More settings…', exact: true }).click();
    const render = page.getByRole('dialog', { name: 'Render Working' });
    await expect(render.getByText('Draft of Working', { exact: true })).toBeVisible();
    await expect(render.getByText('Final, freezes as v3', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await server.project.addOperation(reel, { kind: 'element-offset', clip: 'cube-lands', element: 'cube', x: 20, y: 0, scale: 1, by: 'Claude' });
    await expect(versions.getByRole('button', { name: /^Current/ })).toContainText('2 edits');
    await expect(page.getByRole('list', { name: 'Edits' })).toContainText('Claude');
    expect((await server.project.readVersion(reel, 2)).number).toBe(2);
    await expect(page.getByRole('navigation', { name: 'Versions', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: /^Undo Ctrl/ }).click();
    await expect(versions.getByRole('button', { name: /^Current/ })).toContainText('1 edit');
    await page.getByRole('button', { name: /^Redo Ctrl/ }).click();
    await expect(versions.getByRole('button', { name: /^Current/ })).toContainText('2 edits');
    await page.reload();
    await revealReelRail(page);
    await expect(versions.getByRole('button', { name: /^Current/ })).toHaveAttribute('aria-current', 'true');
    await expect(page.getByRole('list', { name: 'Edits' })).toContainText('Codex');
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
    await expect(page.frameLocator('iframe[title="Authored graphics"]').locator('[data-scene="cube-lands"] [data-el="cube"]')).toBeVisible();
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      if (width <= 900) {
        const row = await versions.getByRole('button', { name: /^Current/ }).boundingBox();
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

test('a native mix reopens Current with exact captured inputs and no operations applied again', async ({ page }) => {
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
    await page.getByRole('navigation', { name: 'Phase' }).getByRole('button', { name: 'Edit', exact: true }).click();
    await revealReelRail(page);
    await expect(page.locator('[data-current-version="3"]')).toBeVisible();
    const editor = page.locator('[data-verify-unit="MediaEditor"]');
    await expect(editor).toBeVisible();
    await expect(editor).toHaveAttribute('data-verify-count', '1');
    expect((await server.project.readVersion('product-showreel', 3)).media!.placements).toHaveLength(1);
    await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeVisible();
  } finally { await server.close(); }
});
