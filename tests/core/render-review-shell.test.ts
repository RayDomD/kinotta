import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { expect, it } from 'vitest';
import { startServer } from '../../server/main.ts';
import { copyFixture } from '../helpers/project.ts';
import { invariants as workspaceChecks } from '../../web/src/review/_internal/EditorWorkspace.verify.ts';
import { invariants as settingsChecks } from '../../web/src/review/_internal/EditorSettingsSheet.verify.ts';
import { invariants as laneChecks } from '../../web/src/review/_internal/NativeLanes.verify.ts';
import { invariants as clipChecks } from '../../web/src/review/_internal/ClipSettings.verify.ts';
import { invariants as railChecks } from '../../web/src/review/_internal/EditorRail.verify.ts';

it('keeps Review inside the viewport with either rail state and theme, and persists Settings and rebound keys', { timeout: 90_000 }, async () => {
  const dir = copyFixture('footage-project');
  const reel = join(dir, 'reels/founder-talk');
  const plan = { duration: 4, clips: [], media: { schema: 1, tracks: [{ id: 'music', name: 'Music', order: 0, gain: 1, mute: false }], sources: [], placements: [{ id: 'pause', role: 'gap', duration: 4 }], sequence: ['pause'] } };
  writeFileSync(join(reel, 'v1/plan.json'), JSON.stringify(plan));
  writeFileSync(join(reel, 'plan.json'), JSON.stringify(plan));
  const server = await startServer({ projectDir: dir, port: 0 });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1272, height: 950 } });
    await page.goto(server.url);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Founder talk: going local-first' }).click();
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    const workspace = page.locator('[data-verify-unit="EditorWorkspace"]');
    await page.locator('[data-verify-unit="MediaEditor"]').waitFor();
    const lanes = page.locator('[data-verify-unit="NativeLanes"]');
    await lanes.locator('[data-placement="pause"]').dblclick();
    expect(await page.getByRole('tab', { name: 'Clip', exact: true }).getAttribute('aria-selected')).toBe('true');
    const inspector = page.getByRole('region', { name: 'Clip settings' });
    expect(await inspector.getByLabel('Duration', { exact: true }).inputValue()).toBe('4');
    const clipVerdicts = await inspector.evaluate((root, checks) => checks.map((check) => Boolean((0, eval)(`(${check})`)(root))), clipChecks.map((rule) => rule.check.toString()));
    expect(clipVerdicts).toEqual(clipChecks.map(() => true));
    const invalidClip = await inspector.evaluate((root, checks) => { const copy = root.cloneNode(true) as Element; copy.setAttribute('data-verify-empty', 'true'); return checks.map((check) => Boolean((0, eval)(`(${check})`)(copy))); }, clipChecks.map((rule) => rule.check.toString()));
    expect(invalidClip.filter((pass) => !pass)).toHaveLength(1);
    const laneVerdicts = await lanes.evaluate((root, checks) => checks.map((check) => Boolean((0, eval)(`(${check})`)(root))), laneChecks.map((rule) => rule.check.toString()));
    expect(laneVerdicts).toEqual(laneChecks.map(() => true));
    const invalidSelection = await lanes.evaluate((root, checks) => {
      const copy = root.cloneNode(true) as Element;
      copy.setAttribute('data-verify-selected', 'missing');
      return checks.map((check) => Boolean((0, eval)(`(${check})`)(copy)));
    }, laneChecks.map((rule) => rule.check.toString()));
    expect(invalidSelection.filter((pass) => !pass)).toHaveLength(1);
    await page.getByRole('button', { name: 'Mute Music', exact: true }).click();
    await expect.poll(() => page.getByRole('button', { name: 'Mute Music', exact: true }).getAttribute('aria-pressed')).toBe('true');
    await page.getByRole('button', { name: 'Solo Music', exact: true }).click();
    expect(await page.getByRole('button', { name: 'Solo Music', exact: true }).getAttribute('aria-pressed')).toBe('true');
    await page.getByRole('tab', { name: /^Edits/ }).click();
    expect(await workspace.getAttribute('data-verify-rail-open')).toBe('false');
    expect(await page.getByRole('navigation', { name: 'Reels' }).isVisible()).toBe(false);
    const closed = await page.locator('[data-verify-unit="EditorSettingsSheet"]').evaluate((root, checks) => checks.map((check) => Boolean((0, eval)(`(${check})`)(root))), settingsChecks.map((rule) => rule.check.toString()));
    expect(closed).toEqual(settingsChecks.map(() => true));
    for (const theme of ['dark', 'light']) {
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByRole('button', { name: 'Appearance', exact: true }).click();
      await page.getByLabel('Theme', { exact: true }).selectOption(theme);
      await page.getByRole('button', { name: 'Close Settings' }).click();
      for (const width of [390, 768, 1024, 1272, 1600]) {
        await page.setViewportSize({ width, height: 950 });
        for (const open of [true, false]) {
          await page.getByRole('tab', { name: 'Reel rail' }).click();
          expect(await workspace.getAttribute('data-verify-rail-open')).toBe(String(open));
          const sizes = await page.evaluate(() => [document.documentElement, document.querySelector('.body')!, document.querySelector('main[aria-label="Review"]')!].map((node) => ({ width: node.clientWidth, content: node.scrollWidth })));
          for (const size of sizes) expect(size.content, `${theme}, ${width}px, rail ${open}`).toBeLessThanOrEqual(size.width);
          const rail = await page.locator('[data-verify-unit="EditorRail"]').evaluate((root, checks) => checks.map((check) => Boolean((0, eval)(`(${check})`)(root))), railChecks.map((rule) => rule.check.toString()));
          expect(rail).toEqual(railChecks.map(() => true));
        }
      }
    }
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Keyboard', exact: true }).click();
    await page.getByLabel('Blade shortcut').press('Escape');
    expect(await page.locator('[data-verify-unit="EditorSettingsSheet"]').getAttribute('data-verify-status')).toBe('closed');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Blade shortcut').press('v');
    expect(await page.getByRole('alert').filter({ hasText: 'assigned to Select and Blade' }).count()).toBe(1);
    const verdicts = await page.locator('[data-verify-unit="EditorSettingsSheet"]').evaluate((root, checks) => checks.map((check) => Boolean((0, eval)(`(${check})`)(root))), settingsChecks.map((rule) => rule.check.toString()));
    expect(verdicts).toEqual(settingsChecks.map(() => true));
    const incorrectConflicts = await page.locator('[data-verify-unit="EditorSettingsSheet"]').evaluate((root, checks) => {
      const copy = root.cloneNode(true) as Element;
      copy.setAttribute('data-verify-error', 'false');
      return checks.map((check) => Boolean((0, eval)(`(${check})`)(copy)));
    }, settingsChecks.map((rule) => rule.check.toString()));
    expect(incorrectConflicts.filter((pass) => !pass)).toHaveLength(1);
    await page.getByRole('button', { name: 'Reset all shortcuts' }).click();
    await page.getByLabel('Toggle Media rail shortcut').press('l');
    await page.getByRole('button', { name: 'Layout', exact: true }).click();
    await page.getByLabel('Open rail at start').check();
    await page.getByRole('button', { name: 'Close Settings' }).click();
    await page.getByRole('button', { name: 'Play', exact: true }).focus();
    await page.keyboard.press('l');
    expect(await workspace.getAttribute('data-verify-rail-open')).toBe('true');
    expect(await workspace.getAttribute('data-verify-rail-tab')).toBe('media');
    await page.reload();
    await page.locator('[data-verify-unit="MediaEditor"]').waitFor();
    expect(await workspace.getAttribute('data-verify-theme')).toBe('light');
    expect(await workspace.getAttribute('data-verify-rail-open')).toBe('true');
    const checks = await workspace.evaluate((root, rules) => rules.map((rule) => Boolean((0, eval)(`(${rule})`)(root))), workspaceChecks.map((rule) => rule.check.toString()));
    expect(checks).toEqual(workspaceChecks.map(() => true));
    const invalidOpen = await workspace.evaluate((root, rules) => {
      const copy = root.cloneNode(true) as Element;
      copy.setAttribute('data-verify-rail-open', 'unknown');
      return rules.map((rule) => Boolean((0, eval)(`(${rule})`)(copy)));
    }, workspaceChecks.map((rule) => rule.check.toString()));
    expect(invalidOpen.filter((pass) => !pass)).toHaveLength(1);
    const invalidRail = await page.locator('[data-verify-unit="EditorRail"]').evaluate((root, rules) => {
      const copy = root.cloneNode(true) as Element;
      copy.setAttribute('data-verify-open', 'unknown');
      return rules.map((rule) => Boolean((0, eval)(`(${rule})`)(copy)));
    }, railChecks.map((rule) => rule.check.toString()));
    expect(invalidRail.filter((pass) => !pass)).toHaveLength(1);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Keyboard', exact: true }).click();
    expect(await page.getByLabel('Toggle Media rail shortcut').inputValue()).toBe('L');
  } finally { await browser.close(); await server.close(); }
});

