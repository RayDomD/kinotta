import { cpSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { expect, it } from 'vitest';
import { startServer } from '../../server/main.ts';
import { copyFixture } from '../helpers/project.ts';
import { revealReelRail } from '../helpers/review-rail.ts';
import { invariants } from '../../web/src/review/_internal/EditsPanel.verify.ts';

it('keeps replayed edits with a visible history reset notice after reopening (AM34)', { timeout: 90_000 }, async () => {
  const dir = copyFixture('showreel-project');
  const server = await startServer({ projectDir: dir, port: 0 });
  await server.project.addOperation('product-showreel', { kind: 'element-offset', clip: 'cube-lands', element: 'cube', x: 10, y: 0, scale: 1 });
  cpSync(join(dir, 'reels/product-showreel/v2'), join(dir, 'reels/product-showreel/v3'), { recursive: true });
  const list = await server.project.readEditList('product-showreel');
  expect(list).toMatchObject({ base: 3, replayedFrom: 2, canUndo: false, canRedo: false });
  expect(list.operations).toHaveLength(1);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1272, height: 1000 } });
    const open = async () => {
      await page.goto(server.url);
      await revealReelRail(page);
      await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: /Product showreel/ }).click();
      await page.getByRole('button', { name: 'Review', exact: true }).click();
      await page.locator('[data-verify-unit="MediaEditor"]').waitFor();
      await page.getByRole('tab', { name: /^Edits/ }).click();
    };
    await open();
    const panel = page.locator('[data-verify-unit="EditsPanel"]');
    const notice = panel.getByRole('status').filter({ hasText: 'Edits carried from v2 to v3. Undo and Redo restarted for the new version.' });
    await notice.waitFor();
    expect(await panel.getByRole('button', { name: /^Undo/ }).isDisabled()).toBe(true);
    const checks = invariants.map((rule) => rule.check.toString());
    expect(await panel.evaluate((root, rules) => rules.map((rule) => Boolean((0, eval)(`(${rule})`)(root))), checks)).toEqual(invariants.map(() => true));
    const invalid = await panel.evaluate((root, rules) => { const copy = root.cloneNode(true) as Element; copy.setAttribute('data-verify-replayed-from', '3'); return rules.map((rule) => Boolean((0, eval)(`(${rule})`)(copy))); }, checks);
    expect(invalid.filter((pass) => !pass)).toHaveLength(1);
    await open();
    await notice.waitFor();
    expect((await server.project.readEditList('product-showreel')).operations).toHaveLength(1);
    await panel.getByRole('button', { name: 'Discard', exact: true }).click();
    await expect.poll(() => notice.count()).toBe(0);
    expect((await server.project.readEditList('product-showreel')).replayedFrom).toBeUndefined();
  } finally { await browser.close(); await server.close(); }
});
