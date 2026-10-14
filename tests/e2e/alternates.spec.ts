import { expect, test } from '@playwright/test';
import { startServer } from '../../server/main.ts';
import { alternatesFixture } from '../helpers/parts.ts';
import { invariants as sheetInvariants } from '../../web/src/ShotSheet.verify.ts';
import { cardInvariants } from '../../web/src/Storyboard.verify.ts';
import { topBarInvariants } from '../../web/src/App.verify.ts';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Locator } from '@playwright/test';
import { revealReelRail } from '../helpers/review-rail.ts';

const verify = (root: Locator, rules: Array<{ check(root: Element): boolean }>) => root.evaluate((element, checks) => checks.map((source) => new Function('return (' + source + ')')()(element)), rules.map((rule) => rule.check.toString()));

test('Use updates the alternate played in Review while frozen history retains its original revision', async ({ page }) => {
  const { dir } = alternatesFixture();
  const server = await startServer({ projectDir: dir, port: 0 });
  try {
    await server.project.buildParts('parts');
    await page.goto(server.url);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Parts fixture', exact: true }).click();
    await page.locator('.grid').getByRole('button', { name: /^Shot 02,/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'View alternate B', exact: true }).click();
    await dialog.getByRole('button', { name: 'Use alternate B', exact: true }).click();
    await expect.poll(async () => (await server.project.readWorkingVersion('parts')).workingParts?.shots[1].revision).toBe('r2');
    await dialog.getByRole('button', { name: /Close/ }).click();
    await page.getByRole('navigation', { name: 'Phase' }).getByRole('button', { name: 'Review', exact: true }).click();
    const graphics = page.frameLocator('.rv-page iframe');
    await expect(graphics.locator('[data-scene="proof"]')).toHaveAttribute('data-revision', 'r2');
    await expect(graphics.locator('[data-scene="close"]')).toHaveAttribute('data-start', '3');
    await revealReelRail(page);
    await page.getByRole('navigation', { name: 'Versions' }).getByRole('button', { name: /^v1 Built/ }).click();
    await expect(graphics.locator('[data-scene="proof"]')).toHaveAttribute('data-revision', 'r1');
    await page.getByRole('button', { name: 'Back to Working', exact: true }).click();
    await expect(graphics.locator('[data-scene="proof"]')).toHaveAttribute('data-revision', 'r2');
    await server.project.undoEdit('parts');
    await expect(graphics.locator('[data-scene="proof"]')).toHaveAttribute('data-revision', 'r1');
  } finally { await server.close(); }
});

test('Storyboard offers alternates, previews with keyboard, chooses and dismisses through Undo', async ({ page }) => {
  const { dir } = alternatesFixture();
  const server = await startServer({ projectDir: dir, port: 0 });
  try {
    await server.project.buildParts('parts');
    await page.goto(server.url);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Parts fixture', exact: true }).click();
    await expect(page.getByLabel('Shots needing a choice')).toHaveText('1 shot needs a choice');
    await expect(page.locator('.grid .shot')).toHaveCount(3);
    await expect(page.locator('.grid .shot.has-alternates')).toHaveCount(1);
    await page.locator('.grid').getByRole('button', { name: /^Shot 02,/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: 'View alternate A', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await dialog.press('ArrowDown');
    await expect(dialog.getByRole('button', { name: 'View alternate B', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.frameLocator('.sheet .well iframe').locator('[data-scene="proof"]')).toHaveAttribute('data-revision', 'r2');
    await dialog.getByRole('button', { name: 'Use alternate B', exact: true }).click();
    await expect.poll(async () => (await server.project.readWorkingVersion('parts')).workingParts?.shots[2].start).toBe(3);
    await expect(page.getByLabel('Shots needing a choice')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'View alternate C', exact: true }).click();
    await dialog.getByLabel('Reason for Not this').fill('Too slow');
    await dialog.getByRole('button', { name: 'Not this alternate C', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'View alternate C', exact: true })).toHaveCount(0);
    await server.project.undoEdit('parts');
    await expect(dialog.getByRole('button', { name: 'View alternate C', exact: true })).toBeVisible();
    await expect(dialog.locator('.well .still.pinnable')).toHaveAttribute('data-state', 'ready');
    expect(await verify(dialog, sheetInvariants)).toEqual(sheetInvariants.map(() => true));
    expect(await verify(page.locator('.has-alternates'), cardInvariants)).toEqual(cardInvariants.map(() => true));
    expect(await verify(page.locator('.top'), topBarInvariants)).toEqual([true]);
    await dialog.evaluate((root) => root.setAttribute('data-verify-viewed', 'wrong'));
    expect((await verify(dialog, sheetInvariants))[2]).toBe(false);
  } finally { await server.close(); }
});

test('pins are visible only on their alternate and new pins keep the viewed identity', async ({ page }) => {
  const { dir } = alternatesFixture();
  const server = await startServer({ projectDir: dir, port: 0 });
  try {
    await server.project.buildParts('parts');
    for (const [revision, text] of [['r1', 'Only A'], ['r2', 'Only B'], [undefined, 'Any alternate']] as const) {
      await server.project.addComment('parts', 1, { pin: { shot: '02', alternate: revision, x: 0.5, y: 0.5, element: 'label' }, text });
    }
    await page.goto(server.url);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Parts fixture', exact: true }).click();
    await page.locator('.grid').getByRole('button', { name: /^Shot 02,/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('.well .still.pinnable')).toHaveAttribute('data-state', 'ready');
    await expect(dialog.locator('.well .pintext')).toHaveText(['Only A', 'Any alternate']);
    await dialog.getByRole('button', { name: 'View alternate B', exact: true }).click();
    await expect(dialog.locator('.well .still.pinnable')).toHaveAttribute('data-state', 'ready');
    await expect(dialog.locator('.well .pintext')).toHaveText(['Only B', 'Any alternate']);
    expect(await verify(dialog, sheetInvariants)).toEqual(sheetInvariants.map(() => true));
    await dialog.getByRole('button', { name: 'Frame centre (position only)', exact: true }).click();
    const field = dialog.getByRole('textbox', { name: /Comment on this position/ });
    await field.fill('New B pin');
    await field.press('Enter');
    await expect.poll(async () => (await server.project.listComments('parts', 1)).find((comment) => comment.text === 'New B pin')?.pin).toMatchObject({ alternate: 'r2' });
  } finally { await server.close(); }
});

test('alternate Storyboard and enlarged shot fit dark and light shells at the required widths', async ({ page }) => {
  test.setTimeout(120_000);
  const { dir } = alternatesFixture();
  const server = await startServer({ projectDir: dir, port: 0 });
  const artifacts = resolve('tests/artifacts/alternates');
  mkdirSync(artifacts, { recursive: true });
  try {
    await server.project.buildParts('parts');
    for (const theme of ['dark', 'light']) for (const width of [390, 768, 1024, 1272, 1600]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(server.url);
      await page.evaluate((theme) => localStorage.setItem('kinotta.editor.settings', JSON.stringify({ theme })), theme);
      await page.reload();
      await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Parts fixture', exact: true }).click();
      await expect(page.locator('.has-alternates .still')).toHaveAttribute('data-state', 'ready');
      await page.waitForFunction(() => document.getAnimations().length === 0);
      expect.soft(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme} ${width} Storyboard overflow`).toBe(true);
      await page.screenshot({ path: `${artifacts}/storyboard-${theme}-${width}.png`, fullPage: true });
      await page.locator('.grid').getByRole('button', { name: /^Shot 02,/ }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.locator('.well .still.pinnable')).toHaveAttribute('data-state', 'ready');
      await page.waitForFunction(() => document.getAnimations().length === 0);
      const bounds = await dialog.boundingBox();
      expect.soft(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width, `${theme} ${width} sheet bounds`).toBe(true);
      expect(await verify(dialog, sheetInvariants)).toEqual(sheetInvariants.map(() => true));
      // A capture must include the complete sheet, including its keyboard hint, beyond the scrollable scrim.
      if (bounds) await page.setViewportSize({ width, height: Math.max(1000, Math.ceil(bounds.height + 96)) });
      await dialog.screenshot({ path: `${artifacts}/sheet-${theme}-${width}.png` });
    }
  } finally { await server.close(); }
});

test('a frame pin asks for options with three by default and other shots name the one already asking', async ({ page }) => {
  const { dir } = alternatesFixture();
  const server = await startServer({ projectDir: dir, port: 0 });
  try {
    await server.project.buildParts('parts');
    await page.goto(server.url);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Parts fixture', exact: true }).click();
    await page.locator('.grid').getByRole('button', { name: /^Shot 02,/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('.well .still.pinnable')).toHaveAttribute('data-state', 'ready');
    await dialog.getByRole('button', { name: 'Frame centre (position only)', exact: true }).click();
    await dialog.getByRole('checkbox', { name: 'Ask for options' }).check();
    await expect(dialog.getByRole('combobox', { name: 'Number of alternates' })).toHaveValue('3');
    const comment = dialog.getByRole('textbox', { name: /Comment on this position/ });
    await comment.fill('Try other approaches');
    await comment.press('Enter');
    await expect.poll(() => server.project.listComments('parts', 1)).toMatchObject([{ options: 3 }]);
    await dialog.press('ArrowRight');
    await dialog.getByRole('button', { name: 'Frame centre (position only)', exact: true }).click();
    await expect(dialog.getByRole('checkbox', { name: 'Ask for options' })).toBeDisabled();
    await expect(dialog).toContainText('Shot 02 already asks for options');
  } finally { await server.close(); }
});
