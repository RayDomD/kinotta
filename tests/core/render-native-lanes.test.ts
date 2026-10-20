import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import type { Locator, Page } from 'playwright';
import { expect, it } from 'vitest';
import { startServer } from '../../server/main.ts';
import { copyFixture } from '../helpers/project.ts';
import { invariants as toolbarChecks } from '../../web/src/review/_internal/EditorToolbar.verify.ts';
import { invariants as editorChecks } from '../../web/src/review/_internal/MediaEditor.verify.ts';

async function drag(page: Page, from: Locator, to: { x: number; y: number }) {
  const box = (await from.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

it('drags native sound between owners, detaches insert sound, trims and changes a fade without moving footage', { timeout: 90_000 }, async () => {
  const dir = copyFixture('footage-project');
  const generated = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=lime:s=160x90:r=30:d=4', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-c:v', 'libx264', '-c:a', 'aac', join(dir, 'take.mp4')], { encoding: 'utf8' });
  expect(generated.status, generated.stderr).toBe(0);
  const reel = join(dir, 'reels/founder-talk');
  const media = (prefix: string) => ({ schema: 1, tracks: [{ id: 'speech', name: 'Speech', order: 0, gain: 1, mute: false }, { id: 'music', name: 'Music', order: 1, gain: 1, mute: false }], sources: [{ id: 'take', name: 'Take', kind: 'video', audio: true, duration: 4, path: `${prefix}take.mp4` }], placements: [{ id: 'footage', role: 'main', source: 'take', track: 'speech', in: 0, out: 4, speech: false }, { id: 'insert', role: 'insert', source: 'take', in: 0, out: 2, at: 1, mute: false }, { id: 'sound', role: 'audio', source: 'take', track: 'speech', in: 0, out: 2, at: 0 }], sequence: ['footage'] });
  writeFileSync(join(reel, 'plan.json'), JSON.stringify({ duration: 4, clips: [], media: media('../../') }));
  writeFileSync(join(reel, 'v1/plan.json'), JSON.stringify({ duration: 4, clips: [], media: media('../../../') }));
  const server = await startServer({ projectDir: dir, port: 0 });
  await server.project.addOperation('founder-talk', { kind: 'placement-add', placement: { id: 'upper', role: 'insert', source: 'take', layer: 9, at: 2, in: 0, out: 1, mute: true } });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(server.url);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Founder talk: going local-first' }).click();
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    const lanes = page.getByRole('region', { name: 'Media timeline' });
    await page.getByRole('separator', { name: 'Picture and tracks' }).press('Home');
    const last = async () => { await expect.poll(() => page.getByRole('button', { name: 'Add track', exact: true }).isEnabled(), { timeout: 5000 }).toBe(true); return (await server.project.readEditList('founder-talk')).operations.at(-1)!; };
    await lanes.locator('[data-placement="sound"]').waitFor();
    await expect.poll(() => lanes.locator('.native-stills img').evaluateAll((images) => images.some((image) => (image as HTMLImageElement).naturalWidth > 0)), { timeout: 10_000 }).toBe(true);
    expect(await lanes.locator('[data-role="insert"] > strong').allTextContents()).toEqual(['Picture 3', 'Picture 2']);
    expect(await lanes.locator('[data-role="insert"]').first().getAttribute('data-picture-layer')).toBe('9');
    expect(await lanes.locator('[data-role="insert"]').first().locator('[data-placement="upper"]').count()).toBe(1);
    await expect.poll(() => page.getByLabel('Track name music').isEnabled()).toBe(true);
    await lanes.scrollIntoViewIfNeeded();
    const music = (await lanes.locator('[data-track="music"] .native-lane-bars').boundingBox())!;
    await drag(page, lanes.locator('[data-placement="sound"]'), { x: music.x + music.width / 4, y: music.y + music.height / 2 });
    await expect.poll(last, { timeout: 10_000 }).toMatchObject({ kind: 'placement-change', placement: 'sound', changes: { track: 'music' } });
    await lanes.locator('[data-track="music"] [data-placement="sound"]').waitFor();
    const movedMusic = (await lanes.locator('[data-track="music"] .native-lane-bars').boundingBox())!;
    await drag(page, lanes.locator('[data-placement="insert"] .native-insert-sound'), { x: movedMusic.x + movedMusic.width / 2, y: movedMusic.y + movedMusic.height / 2 });
    await expect.poll(last, { timeout: 10_000 }).toMatchObject({ kind: 'placement-detach', placement: 'insert', track: 'music' });
    await expect.poll(() => lanes.locator('[data-track="music"] [data-placement]').count()).toBe(2);
    const sound = lanes.locator('[data-track="music"] [data-placement="sound"]');
    const edge = (await sound.locator('.native-trim-end').boundingBox())!;
    await drag(page, sound.locator('.native-trim-end'), { x: edge.x + edge.width / 2 - music.width / 8, y: edge.y + edge.height / 2 });
    await expect.poll(last, { timeout: 10_000 }).toMatchObject({ kind: 'placement-change', placement: 'sound', changes: { out: 1.5, duration: 1.5 } });
    const fade = (await sound.locator('[aria-label="Fade in sound"]').boundingBox())!;
    await drag(page, sound.locator('[aria-label="Fade in sound"]'), { x: fade.x + fade.width / 2 + music.width / 8, y: fade.y + fade.height / 2 });
    await expect.poll(async () => {
      const op = await last();
      return op.kind === 'placement-change' ? op.changes.fadeIn : null;
    }).toBeCloseTo(0.5, 2);
    await page.getByRole('button', { name: 'Move Music track up' }).click();
    await expect.poll(last, { timeout: 10_000 }).toMatchObject({ kind: 'track-move', track: 'music', index: 0 });
    const operations = (await server.project.readEditList('founder-talk')).operations;
    expect(operations.some((op) => 'placement' in op && op.placement === 'footage')).toBe(false);
    const toolbar = page.getByRole('toolbar', { name: 'Timeline tools' });
    await sound.click({ button: 'right' });
    const menu = page.getByRole('menu', { name: 'Clip actions' });
    const editor = page.locator('[data-verify-unit="MediaEditor"]');
    expect(await editor.getAttribute('data-verify-menu')).toBe('sound');
    expect(await editor.evaluate((root, rules) => rules.map((rule) => Boolean((0, eval)(`(${rule})`)(root))), editorChecks.map((rule) => rule.check.toString()))).toEqual(editorChecks.map(() => true));
    const invalidMenu = await editor.evaluate((root, rules) => { const copy = root.cloneNode(true) as Element; copy.setAttribute('data-verify-menu', 'missing'); return rules.map((rule) => Boolean((0, eval)(`(${rule})`)(copy))); }, editorChecks.map((rule) => rule.check.toString()));
    expect(invalidMenu.filter((pass) => !pass)).toHaveLength(1);
    expect(await menu.getByRole('menuitem').allTextContents()).toEqual(['Clip settings…', 'SplitCtrl+K', 'DuplicateCtrl+D', 'Replace…', 'RemoveDelete', 'Remove and close the gapShift+Delete']);
    await menu.getByRole('menuitemcheckbox', { name: 'Mute', exact: true }).click();
    await expect.poll(last, { timeout: 10_000 }).toMatchObject({ kind: 'placement-change', placement: 'sound', changes: { mute: true } });
    await toolbar.getByRole('button', { name: 'Select', exact: true }).focus();
    await page.keyboard.press('Control+z');
    await expect.poll(last, { timeout: 10_000 }).toMatchObject({ kind: 'track-move' });
    await sound.click({ button: 'right' });
    await menu.getByRole('menuitem', { name: 'Clip settings…', exact: true }).press('Enter');
    await page.getByRole('region', { name: 'Clip settings' }).getByLabel('Volume for sound', { exact: true }).waitFor();
    await page.getByRole('tab', { name: /^Edits/ }).click();
    await sound.scrollIntoViewIfNeeded();
    const lineBox = (await sound.locator('.native-volume').boundingBox())!;
    const pointY = Math.round(lineBox.y + lineBox.height / 2);
    const pointGain = (1 - (pointY - lineBox.y) / lineBox.height) * 2;
    await page.mouse.dblclick(lineBox.x + lineBox.width / 2, pointY);
    await expect.poll(last, { timeout: 10_000 }).toMatchObject({ kind: 'placement-change', placement: 'sound', changes: { volume: [expect.objectContaining({ gain: pointGain })] } });
    await expect.poll(async () => { const op = await last(); return op.kind === 'placement-change' ? op.changes.volume?.[0]?.at : null; }).toBeCloseTo(0.75, 2);
    const point = sound.locator('[aria-label="Volume point 1 for sound"]');
    const pointBox = (await point.boundingBox())!;
    const soundBox = (await sound.boundingBox())!;
    await drag(page, point, { x: pointBox.x + pointBox.width / 2 + music.width / 16, y: pointBox.y + pointBox.height / 2 + soundBox.height / 4 });
    await expect.poll(async () => { const op = await last(); return op.kind === 'placement-change' ? op.changes.volume?.[0]?.at : null; }).toBeCloseTo(1, 2);
    await expect.poll(async () => { const op = await last(); return op.kind === 'placement-change' ? Math.abs(op.changes.volume![0]!.gain - (pointGain - 0.5)) : Infinity; }).toBeLessThanOrEqual(2 / soundBox.height);
    const dragged = await last();
    const actualDraggedGain = dragged.kind === 'placement-change' ? dragged.changes.volume![0]!.gain : NaN;
    await point.press('ArrowDown');
    await expect.poll(async () => { const op = await last(); return op.kind === 'placement-change' ? op.changes.volume?.[0]?.gain : null; }).toBeCloseTo(actualDraggedGain - 0.1, 6);
    await expect.poll(() => toolbar.getByRole('button', { name: 'Blade', exact: true }).isEnabled()).toBe(true);
    await point.press('Delete');
    await expect.poll(last, { timeout: 10_000 }).toMatchObject({ kind: 'placement-change', placement: 'sound', changes: { volume: [] } });
    await expect.poll(() => point.count()).toBe(0);
    await toolbar.getByRole('button', { name: 'Select', exact: true }).focus();
    await page.keyboard.press('Control+z');
    await point.waitFor();
    const checks = await toolbar.evaluate((root, rules) => rules.map((rule) => Boolean((0, eval)(`(${rule})`)(root))), toolbarChecks.map((rule) => rule.check.toString()));
    expect(checks).toEqual(toolbarChecks.map(() => true));
    const invalidTool = await toolbar.evaluate((root, rules) => { const copy = root.cloneNode(true) as Element; copy.setAttribute('data-verify-tool', 'paint'); return rules.map((rule) => Boolean((0, eval)(`(${rule})`)(copy))); }, toolbarChecks.map((rule) => rule.check.toString()));
    expect(invalidTool.filter((pass) => !pass)).toHaveLength(1);
    await page.getByLabel('Playhead', { exact: true }).fill('2');
    await toolbar.getByRole('button', { name: 'Select', exact: true }).focus();
    await page.keyboard.press('b');
    expect(await toolbar.getAttribute('data-verify-tool')).toBe('blade');
    const picture = lanes.locator('[data-role="main"]').locator('[data-placement="footage"]');
    await expect.poll(() => toolbar.getByRole('button', { name: 'Blade', exact: true }).isEnabled()).toBe(true);
    await picture.click({ position: { x: (await picture.boundingBox())!.width / 2, y: 15 } });
    await expect.poll(last, { timeout: 10_000 }).toMatchObject({ kind: 'placement-split', placement: 'footage', at: 2 });
    await toolbar.getByRole('button', { name: 'Snip', exact: true }).click();
    const footage = lanes.locator('[data-role="main"]').locator('.native-lane-bars');
    await footage.scrollIntoViewIfNeeded();
    const box = (await footage.boundingBox())!;
    await page.mouse.move(box.x + box.width / 4, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 3 / 4, box.y + 20, { steps: 8 });
    await page.mouse.up();
    await page.getByRole('button', { name: 'Apply snip' }).click();
    await expect.poll(last, { timeout: 10_000 }).toMatchObject({ kind: 'placement-snip', from: 1, to: 3 });
    await toolbar.getByRole('button', { name: 'Select', exact: true }).focus();
    await page.keyboard.press('Control+z');
    await expect.poll(last, { timeout: 10_000 }).toMatchObject({ kind: 'placement-split', placement: 'footage' });
    // Selecting sound opens Clip settings. History controls live in Edits.
    await page.getByRole('tab', { name: /^Edits/ }).click();
    await expect.poll(() => page.getByRole('button', { name: /^Redo/ }).isEnabled()).toBe(true);
    await toolbar.getByRole('button', { name: 'Select', exact: true }).focus();
    await page.keyboard.press('Control+y');
    await expect.poll(last, { timeout: 10_000 }).toMatchObject({ kind: 'placement-snip', from: 1, to: 3 });
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Keyboard', exact: true }).click();
    await page.getByLabel('Blade shortcut').press('x');
    await page.getByRole('button', { name: 'Layout', exact: true }).click();
    await page.getByLabel('Show toolbar labels').check();
    await page.getByLabel('Timecode', { exact: true }).selectOption('frames');
    await page.getByRole('button', { name: 'Close Settings' }).click();
    await toolbar.getByRole('button', { name: 'Select', exact: true }).focus();
    await page.keyboard.press('x');
    expect(await toolbar.getAttribute('data-verify-tool')).toBe('blade');
    expect(await toolbar.getByRole('button', { name: 'Blade', exact: true }).getAttribute('title')).toBe('Blade (X)');
    expect(await toolbar.getAttribute('data-verify-labels')).toBe('true');
    await page.getByLabel('Playhead', { exact: true }).fill('30');
    expect(await page.locator('[data-verify-unit="MediaEditor"]').getAttribute('data-verify-clock')).toBe('1');
  } finally { await browser.close(); await server.close(); }
});

it('leaves a gap on Delete and Apply snip so later clips keep their times, and closes the gap with Shift', { timeout: 90_000 }, async () => {
  const dir = copyFixture('footage-project');
  const generated = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=lime:s=160x90:r=30:d=4', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-c:v', 'libx264', '-c:a', 'aac', join(dir, 'take.mp4')], { encoding: 'utf8' });
  expect(generated.status, generated.stderr).toBe(0);
  const reel = join(dir, 'reels/founder-talk');
  const media = (prefix: string) => ({
    schema: 1,
    tracks: [
      { id: 'speech', name: 'Speech', order: 0, gain: 1, mute: false },
      { id: 'music', name: 'Music', order: 1, gain: 1, mute: false },
    ],
    sources: [{ id: 'take', name: 'Take', kind: 'video', audio: true, duration: 4, path: `${prefix}take.mp4` }],
    placements: [
      { id: 'first', role: 'main', source: 'take', track: 'speech', in: 0, out: 2, speech: false },
      { id: 'second', role: 'main', source: 'take', track: 'speech', in: 2, out: 4, speech: false },
    ],
    sequence: ['first', 'second'],
  });
  writeFileSync(join(reel, 'plan.json'), JSON.stringify({ duration: 4, clips: [], media: media('../../') }));
  writeFileSync(join(reel, 'v1/plan.json'), JSON.stringify({ duration: 4, clips: [], media: media('../../../') }));
  const server = await startServer({ projectDir: dir, port: 0 });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(server.url);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Founder talk: going local-first' }).click();
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    const lanes = page.getByRole('region', { name: 'Media timeline' });
    const toolbar = page.getByRole('toolbar', { name: 'Timeline tools' });
    const last = async () => {
      await expect.poll(() => page.getByRole('button', { name: 'Add track', exact: true }).isEnabled(), { timeout: 5000 }).toBe(true);
      return (await server.project.readEditList('founder-talk')).operations.at(-1)!;
    };

    const mainLane = lanes.locator('[data-role="main"]');
    const firstClip = mainLane.locator('[data-placement="first"]');
    const secondClip = mainLane.locator('[data-placement="second"]');
    await expect.poll(() => page.getByRole('button', { name: 'Add track', exact: true }).isEnabled(), { timeout: 5000 }).toBe(true);
    await secondClip.waitFor();
    await expect.poll(() => secondClip.getAttribute('aria-label')).toContain('2.00 to 4.00');

    // 1. Delete on first clip leaves a gap so second clip keeps its time
    await firstClip.click();
    await firstClip.focus();
    await expect.poll(() => firstClip.getAttribute('aria-pressed')).toBe('true');
    await page.keyboard.press('Delete');
    await expect.poll(last, { timeout: 5000 }).toMatchObject({ kind: 'placement-remove', placement: 'first', leaveGap: true });
    await expect.poll(() => lanes.locator('[data-role="main"] [aria-label*=", gap,"]').count()).toBeGreaterThan(0);
    await expect.poll(() => secondClip.getAttribute('aria-label')).toContain('2.00 to 4.00');

    // 2. Undo restores first clip and removes the gap
    await toolbar.getByRole('button', { name: 'Select', exact: true }).focus();
    await page.keyboard.press('Control+z');
    await firstClip.waitFor();
    await expect.poll(() => lanes.locator('[data-role="main"] [aria-label*=", gap,"]').count()).toBe(0);
    await expect.poll(() => secondClip.getAttribute('aria-label')).toContain('2.00 to 4.00');

    // 3. Snip 1s range across first (0.5 to 1.5) leaves a gap
    await toolbar.getByRole('button', { name: 'Snip', exact: true }).click();
    const footage = lanes.locator('[data-role="main"]').locator('.native-lane-bars');
    await footage.scrollIntoViewIfNeeded();
    const box = (await footage.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.5 / 4, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 1.5 / 4, box.y + 20, { steps: 8 });
    await page.mouse.up();

    const snipConfirm = page.locator('.editor-snip-confirm');
    await expect.poll(async () => snipConfirm.textContent()).toContain('keep the gap');
    await expect.poll(async () => snipConfirm.textContent()).toContain('Shift');
    await page.getByRole('button', { name: 'Apply snip' }).click();
    await expect.poll(last, { timeout: 5000 }).toMatchObject({ kind: 'placement-snip', leaveGap: true });
    await expect.poll(() => secondClip.getAttribute('aria-label')).toContain('2.00 to 4.00');

    // 4. Undo and Shift+Apply snip closes the gap
    await toolbar.getByRole('button', { name: 'Select', exact: true }).focus();
    await page.keyboard.press('Control+z');
    await expect.poll(() => secondClip.getAttribute('aria-label')).toContain('2.00 to 4.00');

    await toolbar.getByRole('button', { name: 'Snip', exact: true }).click();
    await page.mouse.move(box.x + box.width * 0.5 / 4, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 1.5 / 4, box.y + 20, { steps: 8 });
    await page.mouse.up();

    await page.getByRole('button', { name: 'Apply snip' }).click({ modifiers: ['Shift'] });
    await expect.poll(async () => {
      const op = await last();
      if (!op || op.kind !== 'placement-snip') return null;
      return (op as any).leaveGap ?? false;
    }, { timeout: 5000 }).toBe(false);
    await expect.poll(() => secondClip.getAttribute('aria-label')).toContain('1.00 to 3.00');

    // 5. Undo and Shift+Delete ripples (closes the gap)
    await toolbar.getByRole('button', { name: 'Select', exact: true }).focus();
    await page.keyboard.press('Control+z');
    await toolbar.getByRole('button', { name: 'Select', exact: true }).click();
    await firstClip.waitFor();
    await expect.poll(() => secondClip.getAttribute('aria-label')).toContain('2.00 to 4.00');

    await firstClip.click();
    await firstClip.focus();
    await expect.poll(() => firstClip.getAttribute('aria-pressed')).toBe('true');
    await page.keyboard.press('Shift+Delete');
    await expect.poll(last, { timeout: 5000 }).toMatchObject({ kind: 'placement-ripple-remove', placement: 'first' });
    await expect.poll(() => secondClip.getAttribute('aria-label')).toContain('0.00 to 2.00');
  } finally {
    await browser.close();
    await server.close();
  }
});



it('previews captions with a main trim, keeps later clips fixed, extends into gaps, and Shift ripples', { timeout: 90_000 }, async () => {
  const dir = copyFixture('footage-project');
  const generated = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=lime:s=160x90:r=30:d=4', '-c:v', 'libx264', join(dir, 'take.mp4')], { encoding: 'utf8' });
  expect(generated.status, generated.stderr).toBe(0);
  const reel = join(dir, 'reels/founder-talk');
  const media = (prefix: string) => ({ schema: 1, sources: [{ id: 'take', kind: 'video', audio: false, duration: 4, path: `${prefix}take.mp4`, words: [{ text: 'early', start: 0.1, end: 0.4 }, { text: 'late', start: 1.6, end: 1.9 }, { text: 'next', start: 2.1, end: 2.4 }] }], placements: [{ id: 'first', role: 'main', source: 'take', in: 0, out: 2 }, { id: 'second', role: 'main', source: 'take', in: 2, out: 4 }], sequence: ['first', 'second'] });
  for (const [file, prefix] of [['plan.json', '../../'], ['v1/plan.json', '../../../']]) writeFileSync(join(reel, file), JSON.stringify({ duration: 4, clips: [], captions: true, media: media(prefix) }));
  const server = await startServer({ projectDir: dir, port: 0 });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(server.url);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Founder talk: going local-first' }).click();
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    await expect.poll(() => page.getByRole('button', { name: 'Add track', exact: true }).isEnabled(), { timeout: 10_000 }).toBe(true);
    const lane = page.locator('[data-role="main"] .native-lane-bars');
    const first = lane.locator('[data-placement="first"]');
    const second = lane.locator('[data-placement="second"]');
    const captions = page.locator('[data-row="captions"]');
    await first.waitFor();
    await expect.poll(() => captions.textContent()).toContain('late');
    await first.scrollIntoViewIfNeeded();
    const width = (await lane.boundingBox())!.width;
    const trim = async (seconds: number, shift = false, preview = false) => {
      const edge = first.locator('.native-trim-end');
      const box = (await edge.boundingBox())!;
      if (shift) await page.keyboard.down('Shift');
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + seconds / 4 * width, box.y + box.height / 2, { steps: 8 });
      if (preview) {
        await expect.poll(() => captions.textContent()).not.toContain('late');
        expect((await server.project.readEditList('founder-talk')).operations).toHaveLength(0);
        await page.screenshot({ path: join(dir, 'trim-during.png') });
      }
      if (seconds > 1) {
        const clipBox = (await first.boundingBox())!;
        const nextBox = (await second.boundingBox())!;
        expect(Math.abs(clipBox.x + clipBox.width - nextBox.x)).toBeLessThan(2);
      }
      await page.mouse.up();
      if (shift) await page.keyboard.up('Shift');
      await expect.poll(() => page.getByRole('button', { name: 'Add track', exact: true }).isEnabled(), { timeout: 10_000 }).toBe(true);
    };
    await page.screenshot({ path: join(dir, 'trim-before.png') });
    await trim(-1, false, true);
    await page.screenshot({ path: join(dir, 'trim-after.png') });
    await expect.poll(() => first.getAttribute('aria-label')).toContain('0.00 to 1.00');
    expect(await second.getAttribute('aria-label')).toContain('2.00 to 4.00');
    expect(await lane.locator('[aria-label*=", gap,"]').count()).toBe(1);
    const undo = async () => { await page.getByRole('button', { name: 'Select', exact: true }).focus(); await page.keyboard.press('Control+z'); };
    await trim(1.5);
    await expect.poll(() => first.getAttribute('aria-label')).toContain('0.00 to 2.00');
    expect(await second.getAttribute('aria-label')).toContain('2.00 to 4.00');
    expect(await lane.locator('[aria-label*=", gap,"]').count()).toBe(0);
    await undo();
    await expect.poll(() => first.getAttribute('aria-label')).toContain('0.00 to 1.00');
    await undo();
    await expect.poll(() => first.getAttribute('aria-label')).toContain('0.00 to 2.00');
    await trim(-1, true);
    await expect.poll(() => second.getAttribute('aria-label')).toContain('1.00 to 3.00');
    expect(await lane.locator('[aria-label*=", gap,"]').count()).toBe(0);
    expect(await captions.locator('[data-caption]').last().getAttribute('data-start')).toBe('1.1');
    await undo();
    await expect.poll(() => second.getAttribute('aria-label')).toContain('2.00 to 4.00');
    const start = first.locator('.native-trim-start');
    const startBox = (await start.boundingBox())!;
    await drag(page, start, { x: startBox.x + startBox.width / 2 + width / 4, y: startBox.y + startBox.height / 2 });
    await expect.poll(() => first.getAttribute('aria-label'), { timeout: 10_000 }).toContain('1.00 to 2.00');
    expect(await second.getAttribute('aria-label')).toContain('2.00 to 4.00');
    expect(await captions.textContent()).not.toContain('early');
    expect(await captions.locator('[data-caption]').first().getAttribute('data-start')).toBe('1.6');
    await page.reload();
    await expect.poll(() => first.getAttribute('aria-label'), { timeout: 10_000 }).toContain('1.00 to 2.00');
    expect(await captions.textContent()).not.toContain('early');
    await undo();
    await expect.poll(() => first.getAttribute('aria-label')).toContain('0.00 to 2.00');
    expect(await captions.textContent()).toContain('early');
  } finally { await browser.close(); await server.close(); }
});
