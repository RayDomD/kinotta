import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { expect, it } from 'vitest';
import { startServer } from '../../server/main.ts';
import { copyFixture } from '../helpers/project.ts';

it('hears shortcuts with nothing focused, splits sound on a code-built reel, and keeps a dragged clip under the pointer', { timeout: 90_000 }, async () => {
  const dir = copyFixture('showreel-project');
  const file = join(dir, 'sound.wav');
  const made = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', file], { encoding: 'utf8' });
  expect(made.status, made.stderr).toBe(0);
  const server = await startServer({ projectDir: dir, port: 0 });
  await server.project.addOperation('product-showreel', { kind: 'placement-add', source: { id: 'sound', kind: 'audio', path: '../../../sound.wav', duration: 2 }, placement: { id: 'sound-use', role: 'audio', source: 'sound', at: 1, in: 0, out: 2 } });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(server.url);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Product showreel' }).click();
    const tab = page.getByRole('button', { name: 'Review', exact: true });
    await tab.click();
    const review = page.getByRole('main', { name: 'Review' });
    const lanes = page.getByRole('region', { name: 'Media timeline' });
    const clip = lanes.locator('[data-placement="sound-use"]');
    await clip.waitFor();
    const clock = async () => Number(await review.getAttribute('data-verify-clock'));
    /** The clip's body, clear of its end handle and of any badge at its start. */
    const GRAB = 30;
    const operations = async () => (await server.project.readEditList('product-showreel')).operations;
    /** The editor has taken the last edit in and accepts the next one. */
    const settled = () => expect.poll(() => page.getByRole('toolbar', { name: 'Timeline tools' }).getByRole('button', { name: 'Blade', exact: true }).isEnabled()).toBe(true);

    // Nothing is focused, as when the page has just opened or empty timeline was clicked.
    await page.evaluate(() => (document.activeElement as HTMLElement).blur());
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
    await page.keyboard.press('End');
    await expect.poll(clock).toBe(15);
    await page.keyboard.press('Home');
    await expect.poll(clock).toBe(0);

    // A chord reaches the editor from a control outside it; that control keeps its own plain keys.
    await tab.focus();
    await page.keyboard.press('End');
    expect(await clock()).toBe(0);
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await operations()).length).toBe(0);
    await settled();
    await page.keyboard.press('Control+y');
    await expect.poll(async () => (await operations()).length).toBe(1);
    await clip.waitFor();

    // Thick ends on every clip, wide enough to grab.
    await settled();
    const end = clip.locator('.native-trim-end');
    expect(await end.evaluate((element) => getComputedStyle(element).width)).toBe('10px');
    expect(await end.evaluate((element) => getComputedStyle(element).backgroundImage)).toContain('linear-gradient');

    // On a reel built from code the sound can be split; the picture's timing stays with the agent.
    const toolbar = page.getByRole('toolbar', { name: 'Timeline tools' });
    expect(await toolbar.getByRole('button', { name: 'Blade', exact: true }).isEnabled()).toBe(true);
    const snip = toolbar.getByRole('button', { name: 'Snip', exact: true });
    expect(await snip.isDisabled()).toBe(true);
    expect(await snip.getAttribute('title')).toContain('Built from code');
    await page.evaluate(() => (document.activeElement as HTMLElement).blur());
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await expect.poll(clock).toBe(2);
    const box = (await clip.boundingBox())!;
    await clip.click({ position: { x: box.width - GRAB, y: box.height / 2 } });
    await toolbar.getByRole('button', { name: 'Split at playhead', exact: true }).click();
    await expect.poll(async () => (await operations()).at(-1)).toMatchObject({ kind: 'placement-split', placement: 'sound-use', at: 1 });
    await settled();
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await operations()).length).toBe(1);

    // The clip follows the pointer while it is dragged, and stays where it is dropped.
    await settled();
    await expect.poll(() => clip.locator('.native-trim-end').count()).toBe(1);
    const before = (await clip.boundingBox())!;
    const DRAG = 120;
    await page.mouse.move(before.x + before.width - GRAB, before.y + before.height / 2);
    await page.mouse.down();
    await page.mouse.move(before.x + before.width - GRAB + DRAG, before.y + before.height / 2, { steps: 8 });
    const during = (await clip.boundingBox())!;
    expect(during.x - before.x).toBeGreaterThan(DRAG - 10);
    expect(during.x - before.x).toBeLessThan(DRAG + 10);
    expect(await clip.getAttribute('data-dragging')).toBe('true');
    await page.mouse.up();
    await expect.poll(async () => (await operations()).at(-1)).toMatchObject({ kind: 'placement-change', placement: 'sound-use' });
    await expect.poll(() => clip.getAttribute('data-dragging')).toBeNull();
    const after = (await clip.boundingBox())!;
    expect(Math.abs(after.x - during.x)).toBeLessThan(2);
    expect(await clip.evaluate((element) => (element as HTMLElement).style.getPropertyValue('--drag-x'))).toBe('');

    // A trim is drawn while the edge is dragged.
    const edge = (await clip.locator('.native-trim-end').boundingBox())!;
    await page.mouse.move(edge.x + edge.width - 2, edge.y + edge.height / 2);
    await page.mouse.down();
    await page.mouse.move(edge.x + edge.width - 2 - 40, edge.y + edge.height / 2, { steps: 8 });
    expect(after.width - (await clip.boundingBox())!.width).toBeGreaterThan(30);
    await page.mouse.up();
    await expect.poll(async () => { const op = (await operations()).at(-1)!; return op.kind === 'placement-change' && op.changes.out !== undefined; }).toBe(true);
    await expect.poll(() => clip.getAttribute('data-dragging')).toBeNull();
    expect(after.width - (await clip.boundingBox())!.width).toBeGreaterThan(30);
  } finally {
    await browser.close();
    await server.close();
  }
});
