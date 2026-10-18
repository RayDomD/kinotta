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
    const shotStill = page.frameLocator('[data-graphic="proof"] .native-shot-still iframe');
    await expect(shotStill.locator('[data-scene="proof"]')).toHaveAttribute('data-revision', 'r2');
    const scrubber = page.getByRole('slider', { name: 'Scrub reel' });
    await page.getByRole('button', { name: 'Next shot', exact: true }).click();
    await expect(scrubber).toHaveAttribute('aria-valuenow', '1');
    await page.evaluate(() => (document.activeElement as HTMLElement).blur());
    await page.keyboard.press('f');
    await expect(page.locator('[data-review-shell="true"]')).toHaveAttribute('data-focus', 'true');
    await expect(page.getByRole('separator', { name: 'Picture and tracks' })).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('separator', { name: 'Picture and tracks' })).toBeVisible();

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

test('card previews an alternate, switches pins, steps with keyboard, and opens sheet on previewed alternate without server edits', async ({ page }) => {
  const { dir } = alternatesFixture();
  const server = await startServer({ projectDir: dir, port: 0 });
  try {
    await server.project.buildParts('parts');
    for (const [revision, text] of [['r1', 'Only A'], ['r2', 'Only B'], [undefined, 'Any alternate']] as const) {
      await server.project.addComment('parts', 1, { pin: { shot: '02', alternate: revision, x: 0.5, y: 0.5, element: 'label' }, text });
    }
    await page.goto(server.url);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Parts fixture', exact: true }).click();

    const card = page.locator('.grid .shot.has-alternates');
    await expect(card).toBeVisible();

    // Initially shows in-reel alternate A (r1)
    await expect(card).toHaveAttribute('data-verify-shown', 'r1');
    await expect(card.locator('.shot-alternates span')).toHaveText('3 alternates · A in the reel');
    const stillIframe = card.locator('iframe');
    await expect(stillIframe.contentFrame().locator('[data-scene="proof"]')).toHaveAttribute('data-revision', 'r1');
    await expect(card.locator('.hexpin b')).toHaveText(['1', '3']);

    // Invariants check
    expect(await verify(card, cardInvariants)).toEqual(cardInvariants.map(() => true));

    // Clicking dot B shows alternate B (r2) without opening dialog
    const dotB = card.locator('.shot-alternates [data-alternate-revision="r2"]');
    await dotB.click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(card).toHaveAttribute('data-verify-shown', 'r2');
    await expect(card.locator('.shot-alternates span')).toHaveText('3 alternates · A in the reel · previewing B');
    await expect(dotB).toHaveClass(/shown/);
    await expect(stillIframe.contentFrame().locator('[data-scene="proof"]')).toHaveAttribute('data-revision', 'r2');
    await expect(card.locator('.hexpin b')).toHaveText(['2', '3']);

    // Invariants still pass while previewing
    expect(await verify(card, cardInvariants)).toEqual(cardInvariants.map(() => true));

    // Server Working version and edits are unchanged
    const working = await server.project.readWorkingVersion('parts');
    expect(working.workingParts?.shots[1].revision).toBe('r1');
    const edits = await server.project.readEditList('parts');
    expect(edits.operations).toEqual([]);

    // Keyboard navigation with card's button.open focused: ArrowDown / ArrowUp steps through alternates without scrolling
    const openBtn = card.getByRole('button', { name: /^Shot 02,/ });
    await openBtn.focus();
    const scrollYBefore = await page.evaluate(() => window.scrollY);

    // Press ArrowDown from B -> steps to C (r3)
    await page.keyboard.press('ArrowDown');
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollYBefore);
    await expect(card).toHaveAttribute('data-verify-shown', 'r3');
    await expect(card.locator('.shot-alternates span')).toHaveText('3 alternates · A in the reel · previewing C');
    await expect(card.locator('.hexpin b')).toHaveText(['3']);

    // Press ArrowUp -> steps back to B (r2)
    await page.keyboard.press('ArrowUp');
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollYBefore);
    await expect(card).toHaveAttribute('data-verify-shown', 'r2');
    await expect(card.locator('.shot-alternates span')).toHaveText('3 alternates · A in the reel · previewing B');

    // Press Enter opens ShotSheet on previewed alternate B
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'View alternate B', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.frameLocator('.sheet .well iframe').locator('[data-scene="proof"]')).toHaveAttribute('data-revision', 'r2');
    await expect(dialog.locator('.well .pintext')).toHaveText(['Only B', 'Any alternate']);

    // Close sheet and verify return
    await dialog.getByRole('button', { name: /Close/ }).click();
    await expect(dialog).toBeHidden();
  } finally { await server.close(); }
});

test('pointing or focusing a card with alternates plays the shown alternate in a loop, stops on leave or blur, and obeys reduced motion', async ({ page }) => {
  const { dir } = alternatesFixture(false, true);
  const server = await startServer({ projectDir: dir, port: 0 });
  try {
    await server.project.buildParts('parts');
    await page.goto(server.url);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Parts fixture', exact: true }).click();

    const proofCard = page.locator('.grid .shot').filter({ has: page.getByRole('button', { name: /^Shot 02,/ }) });
    const hookCard = page.locator('.grid .shot').filter({ has: page.getByRole('button', { name: /^Shot 01,/ }) });
    const closeCard = page.locator('.grid .shot').filter({ has: page.getByRole('button', { name: /^Shot 03,/ }) });

    // Before any hover or focus, [data-card-player="true"] count is 0, and all cards render PageStill (.still:not([data-card-player]))
    await expect(page.locator('[data-card-player="true"]')).toHaveCount(0);
    await expect(page.locator('.grid .shot .still')).toHaveCount(3);

    // Hovering the card with alternates mounts [data-card-player="true"] (count 1)
    await proofCard.hover();
    await expect(page.locator('[data-card-player="true"]')).toHaveCount(1);
    await expect(proofCard.locator('[data-card-player="true"]')).toBeVisible();

    // Leaving the card returns it to a still
    await page.mouse.move(0, 0);
    await expect(page.locator('[data-card-player="true"]')).toHaveCount(0);

    // Hovering again resumes playback, and the scene data-local advances over time and loops within duration (r1 duration is 1)
    await proofCard.hover();
    await expect(proofCard.locator('[data-card-player="true"]')).toBeVisible();
    const proofIframe = proofCard.locator('[data-card-player="true"] iframe');
    const proofScene = proofIframe.contentFrame().locator('[data-scene="proof"]');
    await expect.poll(async () => {
      const local = Number(await proofScene.getAttribute('data-local'));
      return local > 0 && local < 1;
    }).toBe(true);

    // Switching alternates while playing (e.g. clicking dot B) switches to r2 and restarts playback from shot.start
    const dotB = proofCard.locator('.shot-alternates [data-alternate-revision="r2"]');
    await dotB.click();
    await expect(proofScene).toHaveAttribute('data-revision', 'r2');
    await expect.poll(async () => {
      const local = Number(await proofScene.getAttribute('data-local'));
      return local > 0 && local < 2;
    }).toBe(true);

    // Hovering a second card with alternates stops the first so at most one [data-card-player="true"] exists in the DOM
    await hookCard.hover();
    await expect(page.locator('[data-card-player="true"]')).toHaveCount(1);
    await expect(hookCard.locator('[data-card-player="true"]')).toBeVisible();
    await expect(proofCard.locator('[data-card-player="true"]')).toHaveCount(0);

    // Hovering a card without alternates (Shot 03) stops playback
    await closeCard.hover();
    await expect(page.locator('[data-card-player="true"]')).toHaveCount(0);

    // Keyboard focus starts playback the same way, steps alternates with keyboard, and blur stops it
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    const proofOpenBtn = proofCard.getByRole('button', { name: /^Shot 02,/ });
    await proofOpenBtn.focus();
    await expect(proofCard.locator('[data-card-player="true"]')).toHaveCount(1);
    await page.keyboard.press('ArrowDown');
    await expect(proofScene).toHaveAttribute('data-revision', 'r3');
    await proofOpenBtn.blur();
    await expect(page.locator('[data-card-player="true"]')).toHaveCount(0);
  } finally { await server.close(); }
});

test('with prefers-reduced-motion reduce, card with alternates shows still on hover or focus and does not play', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { dir } = alternatesFixture();
  const server = await startServer({ projectDir: dir, port: 0 });
  try {
    await server.project.buildParts('parts');
    await page.goto(server.url);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Parts fixture', exact: true }).click();

    const proofCard = page.locator('.grid .shot.has-alternates');
    await proofCard.hover();
    await expect(page.locator('[data-card-player="true"]')).toHaveCount(0);
    await expect(proofCard.locator('.still')).toBeVisible();

    const proofOpenBtn = proofCard.getByRole('button', { name: /^Shot 02,/ });
    await proofOpenBtn.focus();
    await expect(page.locator('[data-card-player="true"]')).toHaveCount(0);
  } finally { await server.close(); }
});

test('card Use chooses alternate in the reel with undo, and Not this dismisses with reason', async ({ page }) => {
  const { dir } = alternatesFixture();
  const server = await startServer({ projectDir: dir, port: 0 });
  try {
    await server.project.buildParts('parts');
    await page.goto(server.url);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Parts fixture', exact: true }).click();

    const card = page.locator('.grid .shot.has-alternates');
    await expect(card).toBeVisible();

    // Use and Not this are disabled when in-reel alternate A is shown
    const useBtnA = card.getByRole('button', { name: 'Use alternate A' });
    const notThisBtnA = card.getByRole('button', { name: 'Not this alternate A' });
    await expect(useBtnA).toBeDisabled();
    await expect(notThisBtnA).toBeDisabled();

    // Previewing alternate B on the card and clicking Use alternate B
    const dotB = card.locator('.shot-alternates [data-alternate-revision="r2"]');
    await dotB.click();
    const useBtnB = card.getByRole('button', { name: 'Use alternate B' });
    await expect(useBtnB).toBeEnabled();
    await useBtnB.click();
    await expect(page.getByRole('dialog')).toBeHidden();

    // Updates Working: shots[1].revision === 'r2' and shots[2].start === 3
    await expect.poll(async () => {
      const working = await server.project.readWorkingVersion('parts');
      return working.workingParts?.shots[1].revision === 'r2' && working.workingParts?.shots[2].start === 3;
    }).toBe(true);

    // Updates Edits list
    const edits = await server.project.readEditList('parts');
    expect(edits.operations).toMatchObject([{ kind: 'shot-alternate', shot: 'proof', revision: 'r2' }]);

    // Pressing Control+z undoes the choice, restoring r1 and shots[2].start === 2
    await page.keyboard.press('Control+z');
    await expect.poll(async () => {
      const working = await server.project.readWorkingVersion('parts');
      return working.workingParts?.shots[1].revision === 'r1' && working.workingParts?.shots[2].start === 2;
    }).toBe(true);

    const openBtn = card.getByRole('button', { name: /^Shot 02,/ });

    // Previewing alternate C, clicking Not this, typing reason and pressing Escape closes without edit and focuses card
    const dotC = card.locator('.shot-alternates [data-alternate-revision="r3"]');
    await dotC.click();
    const notThisBtnC = card.getByRole('button', { name: 'Not this alternate C' });
    await notThisBtnC.click();
    const reasonInput = card.getByLabel('Reason for Not this');
    await expect(reasonInput).toBeVisible();
    await expect(reasonInput).toBeFocused();
    await reasonInput.fill('Maybe later');
    await page.keyboard.press('Escape');
    await expect(reasonInput).toBeHidden();
    const editsAfterEsc = await server.project.readEditList('parts');
    expect(editsAfterEsc.operations.some((op) => op.kind === 'shot-alternate-dismiss')).toBe(false);
    await expect(openBtn).toBeFocused();

    // Previewing alternate C, clicking Not this alternate C, typing 'Too abrupt' and pressing Enter
    await dotC.click();
    await notThisBtnC.click();
    await expect(reasonInput).toBeVisible();
    await reasonInput.fill('Too abrupt');
    await page.keyboard.press('Enter');
    await expect(reasonInput).toBeHidden();

    // Records shot-alternate-dismiss operation with reason: 'Too abrupt'
    await expect.poll(async () => {
      const list = await server.project.readEditList('parts');
      return list.operations.find((op) => op.kind === 'shot-alternate-dismiss');
    }).toMatchObject({ kind: 'shot-alternate-dismiss', shot: 'proof', revision: 'r3', reason: 'Too abrupt' });

    // Removes dot C from the card, resets card to in-reel alternate, leaves activeElement on button.open
    await expect(card.locator('.shot-alternates [data-alternate-revision="r3"]')).toHaveCount(0);
    await expect(card).toHaveAttribute('data-verify-shown', 'r1');
    await expect(openBtn).toBeFocused();

    // Both Use and Not this are absent when viewing frozen v1
    await page.getByRole('navigation', { name: 'Versions' }).getByRole('button', { name: /^v1/ }).click();
    await expect(page.locator('.main .readonly-note')).toBeVisible();
    const frozenCard = page.locator('.grid .shot.has-alternates');
    await expect(frozenCard.getByRole('button', { name: /Use alternate/ })).toHaveCount(0);
    await expect(frozenCard.getByRole('button', { name: /Not this alternate/ })).toHaveCount(0);
  } finally {
    await server.close();
  }
});

