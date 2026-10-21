import { expect, test } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { startServer } from '../../server/main.ts';
import { copyFixture } from '../helpers/project.ts';
import type { AgentJob } from '../../web/src/api/_internal/client.ts';

test('picture pins name the element, pause playback, persist coordinates and remain reachable alongside timeline pins', async ({ page }) => {
  const server = await startServer({ projectDir: copyFixture('showreel-project'), port: 0 });
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(server.url);
    const player = page.locator('.sm-preview .rv-page');
    await expect(player).toHaveAttribute('data-state', 'ready');
    const playhead = page.getByRole('slider', { name: 'Simple playhead' });
    await playhead.fill('0.5');
    await page.locator('.sm-app').evaluate((element) => { element.scrollTop = 0; });
    const cube = page.frameLocator('iframe[title="Authored graphics"]').locator('[data-el="cube"]');
    await expect(cube).toBeVisible();
    const bounds = (await cube.boundingBox())!;
    const point = { x: bounds.x + bounds.width / 2 + 3, y: bounds.y + bounds.height / 2 };
    await page.mouse.move(point.x, point.y);
    await expect(player.locator('.tag')).toHaveText('cube');
    await expect(player.locator('.hot')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Choose pin position' })).toHaveCSS('cursor', /data:image\/svg\+xml.*circle/);
    const tag = (await player.locator('.tag').boundingBox())!;
    expect(tag.y + tag.height <= bounds.y || tag.y >= bounds.y + bounds.height || tag.x + tag.width <= bounds.x || tag.x >= bounds.x + bounds.width).toBe(true);
    mkdirSync(resolve('tests/artifacts/simple-picture-pins'), { recursive: true });
    await page.screenshot({ path: resolve('tests/artifacts/simple-picture-pins/after-simple-hover.png') });

    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(async () => Number(await playhead.inputValue())).toBeGreaterThan(0.5);
    const frame = (await player.boundingBox())!;
    await page.mouse.click(point.x, point.y);
    const composer = page.getByRole('form', { name: 'New pin', exact: true });
    await expect(composer.getByRole('heading')).toContainText('cube');
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    const pinnedTime = Number(await playhead.inputValue());
    await expect(composer.getByRole('button', { name: 'Add pin', exact: true })).toBeDisabled();
    await composer.getByRole('textbox').fill('Make the cube brighter.');
    await page.screenshot({ path: resolve('tests/artifacts/simple-picture-pins/after-simple-composer.png') });
    await composer.getByRole('button', { name: 'Add pin', exact: true }).click();
    const list = page.getByRole('complementary', { name: 'Your pins' });
    await expect(list.getByRole('listitem')).toContainText('cube');
    await expect(player.getByRole('img', { name: 'Comment 1', exact: true })).toBeVisible();
    const saved = (await server.project.listComments('product-showreel', 2))[0];
    expect(saved.pin).toMatchObject({ kind: 'frame', element: 'cube' });
    expect(saved.pin.time).toBeCloseTo(pinnedTime, 2);
    if (saved.pin.kind !== 'frame') throw new Error('Expected a frame pin');
    // Browser clicks land on device pixels; the stored normalized coordinates use three decimals.
    expect(Math.abs(saved.pin.x - (point.x - frame.x) / frame.width)).toBeLessThan(1 / frame.width + 0.001);
    expect(Math.abs(saved.pin.y - (point.y - frame.y) / frame.height)).toBeLessThan(1 / frame.height + 0.001);
    expect(Math.abs(saved.pin.x - 0.5)).toBeGreaterThan(0.001);
    await page.locator('.sm-app').evaluate((element) => { element.scrollTop = 0; });
    await page.screenshot({ path: resolve('tests/artifacts/simple-picture-pins/after-simple-saved.png') });

    await playhead.fill('4');
    await page.getByRole('button', { name: 'Add a timeline pin' }).press('Enter');
    await composer.getByRole('textbox').fill('Shorten this moment.');
    await composer.getByRole('button', { name: 'Add pin', exact: true }).click();
    await expect(list.getByRole('listitem')).toHaveCount(2);
    expect((await server.project.listComments('product-showreel', 2))[1].pin).toMatchObject({ kind: 'frame', time: 4, x: 0.5, y: 0.5, element: null });
    await expect(player.getByRole('img', { name: 'Comment 2', exact: true })).toBeVisible();
    await playhead.focus(); await playhead.blur();
    await page.keyboard.press(']');
    await expect(list.getByRole('listitem').first()).toHaveAttribute('data-selected', 'true');
    await expect.poll(async () => Number(await playhead.inputValue())).toBeCloseTo(pinnedTime, 2);
    await expect(player.getByRole('img', { name: 'Comment 1', exact: true })).toBeVisible();
    await page.keyboard.press('[');
    await expect(playhead).toHaveValue('4');
    await page.reload();
    await expect(list.getByRole('listitem').first()).toContainText('cube');
    expect((await server.project.readEditList('product-showreel')).operations).toHaveLength(0);
  } finally { await server.close(); }
});

test('the editor shares element hover feedback and retains its frame pin save flow', async ({ page }) => {
  const server = await startServer({ projectDir: copyFixture('showreel-project'), port: 0 });
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(server.url);
    await page.getByRole('button', { name: 'Open in editor', exact: true }).click();
    const tool = page.getByRole('toolbar', { name: 'Timeline tools' }).getByRole('button', { name: 'Pin', exact: true });
    await expect(tool).toBeEnabled();
    await tool.click();
    const picker = page.getByRole('button', { name: 'Choose pin position' });
    await expect(picker).toBeVisible();
    const cube = (await page.frameLocator('iframe[title="Authored graphics"]').locator('[data-el="cube"]').boundingBox())!;
    await page.mouse.move(cube.x + cube.width / 2, cube.y + cube.height / 2);
    await expect(page.locator('.rv-page .tag')).toHaveText('cube');
    await expect(page.locator('.rv-page .hot')).toBeVisible();
    await expect(picker).toHaveCSS('cursor', /data:image\/svg\+xml.*circle/);
    const tag = (await page.locator('.rv-page .tag').boundingBox())!;
    expect(tag.y + tag.height <= cube.y || tag.y >= cube.y + cube.height || tag.x + tag.width <= cube.x || tag.x >= cube.x + cube.width).toBe(true);
    mkdirSync(resolve('tests/artifacts/simple-picture-pins'), { recursive: true });
    await page.screenshot({ path: resolve('tests/artifacts/simple-picture-pins/after-editor-hover.png') });
    // A stationary pointer follows a keyboard seek into the next scene, without leaving a stale cube box.
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await expect(page.locator('.rv-page .tag')).toHaveText('wordmark');
    await picker.press('Enter');
    await expect(page.locator('.rv-page .hot, .rv-page .tag')).toHaveCount(0);
    const draft = page.getByRole('form', { name: 'New review pin' });
    await draft.getByLabel('Pin comment', { exact: true }).fill('Keep the wordmark.');
    await draft.getByRole('button', { name: 'Save pin', exact: true }).click();
    await expect.poll(async () => (await server.project.listComments('product-showreel', 2))[0]?.pin).toMatchObject({ kind: 'frame', x: 0.5, y: 0.5, element: 'wordmark' });
  } finally { await server.close(); }
});

test('picture picking covers footage-only moments with exact coordinates and no element', async ({ page }) => {
  const server = await startServer({ projectDir: copyFixture('footage-project'), port: 0, transcriber: async () => [] });
  try {
    const { slug } = await server.project.startReel({ video: 'media/talk.mp4', title: 'Footage only', broll: 'light', captions: 'off' });
    await expect.poll(async () => (await server.project.listVersions(slug)).length, { timeout: 30_000 }).toBe(1);
    await page.goto(server.url);
    await page.getByRole('combobox', { name: 'Choose reel' }).selectOption(slug);
    const player = page.locator('.sm-preview .rv-page');
    await expect(player).toHaveAttribute('data-state', 'ready');
    await expect(page.locator('[data-verify-unit="PictureLayer"] video')).toBeVisible();
    const picker = page.getByRole('button', { name: 'Choose pin position' });
    const frame = (await picker.boundingBox())!;
    await picker.click({ position: { x: frame.width * 0.25, y: frame.height * 0.3 } });
    const composer = page.getByRole('form', { name: 'New pin', exact: true });
    await expect(composer.getByRole('heading')).toHaveText(/Pin at \d+:\d+/);
    await composer.getByRole('textbox').fill('Brighten this footage.');
    await composer.getByRole('button', { name: 'Add pin', exact: true }).click();
    await expect(player.getByRole('img', { name: 'Comment 1', exact: true })).toBeVisible();
    const pin = (await server.project.listComments(slug, 1))[0].pin;
    expect(pin).toMatchObject({ kind: 'frame', element: null });
    if (pin.kind !== 'frame') throw new Error('Expected a frame pin');
    expect(Math.abs(pin.x - 0.25)).toBeLessThan(1 / frame.width + 0.001);
    expect(Math.abs(pin.y - 0.3)).toBeLessThan(1 / frame.height + 0.001);
    expect((await server.project.readEditList(slug)).operations).toHaveLength(0);
  } finally { await server.close(); }
});

for (const [active, finished] of [
  ['queued', 'copy-ready'],
  ['running', 'succeeded'],
  ['validating', 'failed'],
  ['cancelling', 'cancelled'],
  ['running', 'interrupted'],
] as const) {
  test(`Agent timer ticks between polls while ${active} and retains the ${finished} total`, async ({ page }) => {
    const server = await startServer({ projectDir: copyFixture('showreel-project'), port: 0 });
    try {
      const now = new Date('2026-10-21T10:00:00Z');
      // Leave room for clock setup under concurrent browser load before pausing at the test time.
      await page.clock.install({ time: new Date(now.getTime() - 60_000) });
      await page.clock.pauseAt(now);
      let job: AgentJob = {
        id: 'timer-test', reel: 'product-showreel', provider: 'copy', state: active,
        createdAt: new Date(now.getTime() - 65_000).toISOString(), updatedAt: now.toISOString(),
        elapsedSeconds: 65, quiet: false, canCopy: true, canRetry: false,
      };
      let polls = 0;
      await page.route('**/api/reels/*/agent', (route) => {
        polls++;
        return route.fulfill({ json: { job } });
      });
      await page.goto(server.url);
      const timer = page.getByRole('timer');
      await expect(timer).toHaveText('Elapsed 1:05');
      const initialPolls = polls;
      await page.clock.fastForward(1000);
      await expect(timer).toHaveText('Elapsed 1:06');
      expect(polls).toBe(initialPolls);
      job = { ...job, state: finished, elapsedSeconds: 67 };
      await page.clock.fastForward(3000);
      await expect(timer).toHaveText('Took 1:07');
      await page.clock.fastForward(10_000);
      await expect(timer).toHaveText('Took 1:07');
      await page.reload();
      await expect(timer).toHaveText('Took 1:07');
    } finally { await server.close(); }
  });
}

test('Simple is the default: required-note pins, navigation, persistence, copy request and same-reel editor', async ({ page, context }) => {
  const server = await startServer({ projectDir: copyFixture('showreel-project'), port: 0 });
  try {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(server.url);
    await expect(page.getByRole('heading', { name: 'Product showreel', exact: true })).toBeVisible();
    await expect(page.getByLabel('Agent provider')).toBeVisible();
    await expect(page.locator('.sm-preview .rv-tracks-pane, .sm-preview .editor-toolbar, .sm-preview .rv-divider, .sm-preview .rv-scrubber')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'New reel', exact: true })).toHaveCount(0);

    const timeline = page.getByRole('button', { name: 'Add a timeline pin' });
    await expect(timeline).toBeVisible();
    await page.getByRole('slider', { name: 'Simple playhead' }).fill('2.5');
    await timeline.focus(); await page.keyboard.press('Enter');
    const composer = page.getByRole('form', { name: 'New pin' });
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
    await expect(page.locator('.sm-message[role="status"]')).toContainText('Request copied.');
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
    expect(frame.width / frame.height).toBeCloseTo(16 / 9, 2);
    await expect(page.locator('.sm-preview .rv-page')).toHaveAttribute('data-state', 'ready');
    mkdirSync(resolve('tests/artifacts/simple-mode'), { recursive: true });
    await page.screenshot({ path: resolve('tests/artifacts/simple-mode/desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: resolve('tests/artifacts/simple-mode/mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 500 });
    const app = page.locator('.sm-app');
    expect(await app.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
    await app.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    expect(await app.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: /Regenerate \(2 pins\)/ })).toBeInViewport();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: 'Open in editor', exact: true }).click();
    await expect(page.getByRole('main', { name: 'Review', exact: true })).toBeVisible();
    await expect(page.locator('.reelname')).toContainText('Product showreel');
    await expect(page.getByRole('navigation', { name: 'Phase' })).toBeVisible();
    await page.getByRole('button', { name: 'Simple mode', exact: true }).click();
    await expect(page.getByRole('complementary', { name: 'Your pins' }).getByRole('listitem')).toHaveCount(2);
    await expect(page.getByLabel('Agent provider')).toHaveValue('copy');
    await page.getByLabel('Agent provider').selectOption('claude');
    await expect(page.getByLabel('Agent provider')).toHaveValue('claude');
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
      navigator.clipboard.writeText = async () => { throw new Error('Clipboard blocked'); };
    });
    await page.goto(server.url);
    await page.getByRole('combobox', { name: 'Choose reel' }).selectOption('founder-talk');
    await page.getByRole('button', { name: /Regenerate \(2 pins\)/ }).click();
    await expect(page.locator('.sm-message[role="status"]')).toContainText('Request saved.');
    await page.getByText('Request to copy', { exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Request to copy', exact: true })).toHaveValue(/Change section 1\.[\s\S]*Change section 2\./);
    await expect(page.locator('.sm-preview .rv-page iframe')).toHaveCSS('width', '1920px');
    await expect(page.locator('.sm-preview .rv-page iframe')).toHaveCSS('height', '1080px');
    expect((await server.project.listVersions('founder-talk')).map((version) => version.number)).toEqual([1, 2]);
  } finally { await server.close(); }
});

test('Make starts a real reel from a project video in Simple mode with treatment picker and live preview', async ({ page }) => {
  const projectDir = copyFixture('footage-project');
  const server = await startServer({ projectDir, port: 0, transcriber: async () => [{ text: 'Hello', start: 0.5, end: 0.9 }] });
  try {
    await page.goto(server.url);
    await page.getByRole('combobox', { name: 'Choose reel' }).selectOption('');
    await expect(page.getByLabel('Drop videos')).toBeAttached();
    await page.getByLabel('Or use a video in this project').selectOption({ index: 1 });

    // Treatment picker is shown
    await expect(page.getByText('What are you making?')).toBeVisible();
    await expect(page.getByRole('button', { name: /Let Kinotta decide/ })).toBeVisible();

    // Pick a video type: Explainer
    await page.getByRole('button', { name: /Explainer/ }).click();
    await expect(page.getByRole('button', { name: /✓ Explainer/ })).toBeVisible();

    // Override B-roll dial to heavy
    await page.getByRole('group', { name: 'B-roll' }).getByRole('button', { name: 'heavy' }).click();
    await expect(page.getByText(/about 60% covered · yours/)).toBeVisible();

    // Override Pace dial to fast
    await page.getByRole('group', { name: 'Pace' }).getByRole('button', { name: 'fast' }).click();
    await expect(page.getByText(/shots flash ~1–2 s, rapid cuts · yours/)).toBeVisible();

    // Check Live b-roll plan preview stat line
    const stat = page.locator('#stat');
    await expect(stat).toBeVisible();
    await expect(stat).toContainText('cutaways');
    await expect(stat).toContainText('60% covered');
    await expect(page.getByText('Added by Kinotta', { exact: true })).toBeVisible();
    for (const frame of await page.locator('.sm-preview-frame').all()) {
      const box = (await frame.boundingBox())!;
      expect(box.width / box.height).toBeCloseTo(16 / 9, 1);
    }

    // Optional notes
    await page.getByPlaceholder(/keep the jokes/).fill('Keep the jokes, hold the lab shot longer');

    // Fill in Reel name and submit
    await page.getByLabel('Reel name', { exact: true }).fill('Simple make');
    await page.getByRole('button', { name: 'Make', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Simple make', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add a timeline pin' })).toBeVisible();
    expect((await server.project.listReels()).reels.some((reel) => reel.title === 'Simple make')).toBe(true);

    // Verify treatment options persisted in plan.json
    const plan = JSON.parse(readFileSync(join(projectDir, 'reels/simple-make/plan.json'), 'utf8'));
    expect(plan).toMatchObject({
      videoType: 'explainer',
      broll: 'heavy',
      pace: 'fast',
      notes: 'Keep the jokes, hold the lab shot longer',
    });
  } finally { await server.close(); }
});
