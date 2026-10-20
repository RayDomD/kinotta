import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SnipOperation } from '../../server/core/model.ts';
import { startServer } from '../../server/main.ts';
import { copyFixture } from '../helpers/project.ts';

test('Simple is the default: profile, required-note pins, navigation, persistence, copy request and same-reel editor', async ({ page, context }) => {
  const server = await startServer({ projectDir: copyFixture('showreel-project'), port: 0 });
  try {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(server.url);
    await expect(page.getByRole('heading', { name: 'About you', exact: true })).toBeVisible();
    const profile = page.getByRole('form', { name: 'About you' });
    await profile.getByLabel('Your name').fill('Alex');
    await profile.getByLabel('Your handle').fill('@alex');
    await profile.getByLabel('What do you make?').fill('Talking to camera');
    await profile.getByRole('button', { name: 'Let’s make something' }).click();
    const timeline = page.getByRole('button', { name: 'Add a timeline pin' });
    await expect(timeline).toBeVisible();
    await page.getByRole('slider', { name: 'Simple playhead' }).fill('2.5');
    await timeline.focus(); await page.keyboard.press('Enter');
    const composer = page.getByRole('form', { name: 'New timeline pin' });
    await expect(composer.getByRole('button', { name: 'Add pin', exact: true })).toBeDisabled();
    await composer.getByRole('textbox').fill('   ');
    await expect(composer.getByRole('button', { name: 'Add pin', exact: true })).toBeDisabled();
    await composer.getByRole('textbox').fill('Tighten this pause.');
    await composer.getByRole('button', { name: 'Add pin', exact: true }).click();
    await expect(page.getByRole('complementary', { name: 'Your pins' })).toContainText('Tighten this pause.');
    expect((await server.project.listComments('product-showreel', 2))[0].pin.time).toBeCloseTo(2.5);
    await timeline.click({ position: { x: 400, y: 30 } });
    await composer.getByRole('textbox').fill('Add b-roll here.');
    await composer.getByRole('button', { name: 'Add pin', exact: true }).click();
    await expect(page.getByRole('button', { name: /Regenerate \(2 pins\)/ })).toBeEnabled();
    await page.getByRole('button', { name: /Pin 1 at/ }).click();
    await expect(page.getByRole('slider', { name: 'Simple playhead' })).toHaveValue('2.5');
    await page.getByRole('button', { name: 'Next pin', exact: true }).click();
    await page.getByRole('button', { name: 'Next pin', exact: true }).blur();
    await page.keyboard.press('[');
    await expect(page.getByRole('slider', { name: 'Simple playhead' })).toHaveValue('2.5');
    await page.keyboard.press(']');
    const pins = await server.project.listComments('product-showreel', 2);
    await expect.poll(async () => Number(await page.getByRole('slider', { name: 'Simple playhead' }).inputValue())).toBeCloseTo(pins[1].pin.time, 2);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'About you', exact: true })).toHaveCount(0);
    await expect(page.getByRole('complementary', { name: 'Your pins' }).getByRole('listitem')).toHaveCount(2);
    await page.getByRole('button', { name: 'Previous pin', exact: true }).click();
    await expect.poll(async () => Number(await page.getByRole('slider', { name: 'Simple playhead' }).inputValue())).toBeCloseTo(pins[1].pin.time, 2);
    await page.getByRole('button', { name: /Regenerate \(2 pins\)/ }).click();
    await expect(page.getByRole('status')).toContainText('Request copied.');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('Tighten this pause.');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('Add b-roll here.');
    const clock = page.locator('[data-verify-unit="MediaEditor"]');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(async () => Number(await clock.getAttribute('data-verify-clock'))).toBeGreaterThan(0.3);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    expect((await server.project.readEditList('product-showreel')).operations).toHaveLength(0);
    const frame = (await page.locator('.sm-preview .rv-frame').boundingBox())!;
    const track = (await timeline.boundingBox())!;
    expect(frame.y + frame.height).toBeLessThan(track.y);
    expect(frame.width / frame.height).toBeCloseTo(9 / 16, 2);
    await expect(page.locator('.sm-preview .rv-page')).toHaveAttribute('data-state', 'ready');
    mkdirSync(resolve('tests/artifacts/simple-mode'), { recursive: true });
    await page.screenshot({ path: resolve('tests/artifacts/simple-mode/desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: resolve('tests/artifacts/simple-mode/mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: 'Open in editor', exact: true }).click();
    await expect(page.getByRole('main', { name: 'Review', exact: true })).toBeVisible();
    await expect(page.locator('.reelname')).toContainText('Product showreel');
    await expect(page.getByRole('navigation', { name: 'Phase' })).toBeVisible();
    await page.getByRole('button', { name: 'Simple mode', exact: true }).click();
    await expect(page.getByRole('complementary', { name: 'Your pins' }).getByRole('listitem')).toHaveCount(2);
    await page.getByRole('button', { name: 'Your profile', exact: true }).click();
    await expect(page.getByLabel('Your handle')).toHaveValue('@alex');
  } finally { await server.close(); }
});

test('Regenerate combines section requests after freezing changed Working and offers text when the clipboard is blocked', async ({ page }) => {
  const server = await startServer({ projectDir: copyFixture('footage-project'), port: 0 });
  try {
    await server.project.addOperation('founder-talk', { kind: 'snip', from: 0.1, to: 0.2 });
    const working = await server.project.readWorkingVersion('founder-talk');
    expect(working.sections.length).toBeGreaterThan(1);
    for (const [index, section] of working.sections.entries()) {
      await server.project.addComment('founder-talk', working.number, { pin: { kind: 'frame', shot: '', time: section.start + 0.2, x: 0.5, y: 0.5, element: null }, text: `Change section ${index + 1}.` });
    }
    await page.addInitScript(() => {
      localStorage.setItem('kinotta-simple-profile-v1', JSON.stringify({ name: 'Alex', handle: '@alex', makes: 'Vlogs', language: 'English', destination: 'TikTok', finish: 'MP4', music: 'No music' }));
      navigator.clipboard.writeText = async () => { throw new Error('Clipboard blocked'); };
    });
    await page.goto(server.url);
    await page.getByRole('combobox', { name: 'Choose reel' }).selectOption('founder-talk');
    await page.getByRole('button', { name: /Regenerate \(2 pins\)/ }).click();
    await expect(page.getByRole('status')).toContainText('Request saved.');
    await page.getByText('Request to copy', { exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Request to copy', exact: true })).toHaveValue(/Change section 1\.[\s\S]*Change section 2\./);
    expect((await server.project.listVersions('founder-talk')).map((version) => version.number)).toEqual([1, 2]);
  } finally { await server.close(); }
});

test('Make starts a real reel from a project video in Simple mode', async ({ page }) => {
  const server = await startServer({ projectDir: copyFixture('footage-project'), port: 0, transcriber: async () => [{ text: 'Hello', start: 0.5, end: 0.9 }] });
  try {
    await page.addInitScript(() => localStorage.setItem('kinotta-simple-profile-v1', JSON.stringify({ name: 'Alex', handle: '@alex', makes: 'Vlogs', language: 'English', destination: 'TikTok', finish: 'MP4', music: 'No music' })));
    await page.goto(server.url);
    await page.getByRole('button', { name: 'New reel', exact: true }).click();
    await expect(page.getByLabel('Drop videos')).toBeAttached();
    await page.getByLabel('Or use a video in this project').selectOption({ index: 1 });
    await page.getByLabel('Reel name', { exact: true }).fill('Simple make');
    await page.getByRole('button', { name: 'Make', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Simple make', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add a timeline pin' })).toBeVisible();
    expect((await server.project.listReels()).reels.some((reel) => reel.title === 'Simple make')).toBe(true);
  } finally { await server.close(); }
});

test('Editable dead-air cuts: full recording timeline, restored pause, resized cut, and playback across cut', async ({ page }) => {
  const words = [
    { text: 'Hello', start: 0.5, end: 0.9 },
    { text: 'there', start: 3, end: 3.4 },
    { text: 'friends', start: 6.5, end: 7 },
  ];
  const server = await startServer({
    projectDir: copyFixture('footage-project'),
    port: 0,
    transcriber: async () => words,
  });
  try {
    await page.addInitScript(() => localStorage.setItem('kinotta-simple-profile-v1', JSON.stringify({ name: 'Alex', handle: '@alex', makes: 'Vlogs', language: 'English', destination: 'TikTok', finish: 'MP4', music: 'No music' })));
    await page.goto(server.url);
    await page.getByRole('button', { name: 'New reel', exact: true }).click();
    await expect(page.getByLabel('Drop videos')).toBeAttached();
    await page.getByLabel('Or use a video in this project').selectOption({ index: 1 });
    await page.getByLabel('Reel name', { exact: true }).fill('Editable dead air');
    await page.getByRole('button', { name: 'Make', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Editable dead air', exact: true })).toBeVisible();

    const reels = (await server.project.listReels()).reels;
    const reel = reels.find((r) => r.title === 'Editable dead air');
    expect(reel).toBeDefined();
    const slug = reel!.slug;
    await server.project.whenTranscribed(slug);

    // Reload so the client fetches the edit list generated by background transcription
    await page.reload();
    const timeline = page.locator('section.sm-timeline[aria-label="Simple timeline"]');
    await expect(timeline).toHaveAttribute('data-verify-cuts', '2');

    // Assert: v1 is uncut and edit list has 2 snips by 'dead-air'
    const v1 = await server.project.readVersion(slug, 1);
    expect(v1.pieces).toEqual([{ in: 0, out: 12, at: 0 }]);
    expect(v1.duration).toBeCloseTo(12, 0);

    const initialEdits = await server.project.readEditList(slug);
    expect(initialEdits.operations).toHaveLength(2);
    const [op0, op1] = initialEdits.operations as SnipOperation[];
    expect(op0).toMatchObject({ kind: 'snip', by: 'dead-air' });
    expect(op0.from).toBeCloseTo(0.98, 2);
    expect(op0.to).toBeCloseTo(3.0, 2);
    expect(op1).toMatchObject({ kind: 'snip', by: 'dead-air' });
    expect(op1.from).toBeCloseTo(3.48, 2);
    expect(op1.to).toBeCloseTo(6.5, 2);

    // Restore: click the first cut block, click 'Keep this pause'
    const firstCutBlock = page.locator('.sm-cut').first().getByRole('button', { name: /^Cut pause/ });
    await firstCutBlock.click();
    const popover = page.getByRole('dialog', { name: 'Pause details' });
    await expect(popover).toBeVisible();
    await popover.getByRole('button', { name: 'Keep this pause' }).click();

    await expect(timeline).toHaveAttribute('data-verify-cuts', '1');
    await expect.poll(async () => (await server.project.readEditList(slug)).operations.length).toBe(1);
    const restoredEdits = await server.project.readEditList(slug);
    const [restoredOp] = restoredEdits.operations as SnipOperation[];
    expect(restoredOp).toMatchObject({ kind: 'snip', by: 'dead-air' });
    expect(restoredOp.from).toBeCloseTo(3.48, 2);
    expect(restoredOp.to).toBeCloseTo(6.5, 2);

    // Resize: drag the start handle of the remaining cut to the right (~1s later)
    const startHandle = page.locator('.sm-cut-handle-start');
    await expect(startHandle).toBeVisible();
    const handleBox = (await startHandle.boundingBox())!;
    const trackBox = (await page.locator('.sm-pin-track').boundingBox())!;
    const pixelsPerSecond = trackBox.width / 12;
    const startX = handleBox.x + handleBox.width / 2;
    const startY = handleBox.y + handleBox.height / 2;
    const targetX = startX + pixelsPerSecond;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(targetX, startY, { steps: 5 });
    await page.mouse.up();

    await expect.poll(async () => {
      const ops = (await server.project.readEditList(slug)).operations as SnipOperation[];
      return ops.length === 1 ? ops[0]!.from : 0;
    }).toBeGreaterThan(3.5);

    const resizedEdits = await server.project.readEditList(slug);
    expect(resizedEdits.operations).toHaveLength(1);
    const resizedOp = resizedEdits.operations[0] as SnipOperation;
    expect(resizedOp.by).toBe('dead-air');
    expect(resizedOp.from).toBeGreaterThan(3.5);
    expect(resizedOp.to).toBeCloseTo(6.5, 2);

    // Play across a cut: seek playhead to just before remaining cut in reel time, press Play, poll clock passes cutStart
    const cutStart = resizedOp.from;
    const playhead = page.getByRole('slider', { name: 'Simple playhead' });
    await playhead.fill((cutStart - 0.2).toFixed(2));
    const clock = page.locator('[data-verify-unit="MediaEditor"]');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(async () => Number(await clock.getAttribute('data-verify-clock'))).toBeGreaterThan(cutStart);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();

    // Take screenshot
    mkdirSync(resolve('tests/artifacts/simple-mode'), { recursive: true });
    await page.screenshot({ path: resolve('tests/artifacts/simple-mode/dead-air-cuts.png'), fullPage: true });
  } finally {
    await server.close();
  }
});
