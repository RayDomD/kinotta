import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import type { Page, Route } from 'playwright';
import { expect, it } from 'vitest';
import { startServer } from '../../server/main.ts';
import { copyFixture } from '../helpers/project.ts';

const REEL = 'founder-talk';
const TIMEOUT_MS = 120_000;
/** The picture may sit a frame (at 30 fps) off the sound's clock, plus the one animation frame the clock attribute lags. */
const SYNC_TOLERANCE = 1 / 30 + 1 / 60;
/** How long a held reel is watched to show it does not move on. */
const HOLD_WATCH_MS = 700;

/** A three-second picture with no sound of its own, and a tone placed under it, so the reel has a sound clock. */
function reelWithPicture(): string {
  const dir = copyFixture('footage-project');
  const reel = join(dir, 'reels', REEL);
  for (const [args, file] of [
    [['-f', 'lavfi', '-i', 'testsrc=s=160x90:r=30:d=3', '-c:v', 'libx264', '-g', '15'], 'take.mp4'],
    [['-f', 'lavfi', '-i', 'sine=frequency=440:duration=3'], 'tone.wav'],
  ] as const) {
    const run = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args, join(reel, 'v1', file)], { encoding: 'utf8' });
    expect(run.status, run.stderr).toBe(0);
  }
  const media = (root: string) => ({
    schema: 1,
    sources: [{ id: 'take', name: 'Take', kind: 'video', path: `${root}take.mp4`, duration: 3, audio: false, words: [] }, { id: 'tone', kind: 'audio', path: `${root}tone.wav`, duration: 3 }],
    placements: [{ id: 'main', role: 'main', source: 'take', in: 0, out: 3 }, { id: 'bed', role: 'audio', source: 'tone', at: 0, in: 0, out: 3 }],
    sequence: ['main'],
  });
  const plan = (root: string) => ({ title: 'Picture', duration: 3, sections: [{ id: 'all', name: 'All', start: 0, end: 3 }], clips: [], media: media(root) });
  writeFileSync(join(reel, 'plan.json'), JSON.stringify(plan('v1/')));
  writeFileSync(join(reel, 'v1/plan.json'), JSON.stringify(plan('')));
  writeFileSync(join(reel, 'v1/shots.json'), JSON.stringify({ contract: 1, duration: 3, sections: [{ id: 'all', name: 'All', start: 0, end: 3 }], shots: [] }));
  writeFileSync(join(reel, 'v1/index.html'), '<!doctype html><html class="alpha"><script>window.DURATION=3;window.seek=()=>{};</script>');
  return dir;
}

async function openEditor(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Founder talk: going local-first' }).click();
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await page.locator('[data-verify-unit="MediaEditor"]').waitFor();
}

/** The sound's clock and the picture's time, read together. */
const sample = (page: Page) => page.evaluate(() => {
  const main = document.querySelector('[data-verify-unit="MediaEditor"]')!;
  const video = document.querySelector<HTMLVideoElement>('video.mv-picture');
  return { clock: Number(main.getAttribute('data-verify-clock')), waiting: main.getAttribute('data-verify-waiting') === 'true', picture: video?.currentTime ?? null };
});

const PICTURE = '**/media/founder-talk/1/take';

it.each([[1, 2], [0, 1]])('previews a selected snip from %s to %s with the same excluded interval in picture and sound, without saving an edit', { timeout: TIMEOUT_MS }, async (from, to) => {
  const server = await startServer({ projectDir: reelWithPicture(), port: 0 });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.addInitScript(() => {
      const root = window as unknown as { starts: { offset: number; duration: number }[] };
      root.starts = [];
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function(when = 0, offset = 0, duration?: number) {
        root.starts.push({ offset, duration: duration ?? Infinity });
        Reflect.apply(start, this, duration === undefined ? [when, offset] : [when, offset, duration]);
      };
    });
    await openEditor(page, server.url);
    const tools = page.getByRole('toolbar', { name: 'Timeline tools' });
    await tools.getByRole('button', { name: 'Snip', exact: true }).click();
    const footage = page.locator('[data-role="main"] .native-lane-bars');
    await footage.scrollIntoViewIfNeeded();
    const box = (await footage.boundingBox())!;
    await page.mouse.move(box.x + Math.max(2, box.width * from / 3), box.y + 15);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * to / 3, box.y + 15, { steps: 5 });
    await page.mouse.up();
    await expect.poll(async () => (await sample(page)).picture).toBeGreaterThan(to - 0.1);
    await tools.getByRole('button', { name: 'Snip', exact: true }).focus();
    await page.keyboard.press('Space');
    await expect.poll(async () => (await sample(page)).clock, { timeout: 5000 }).toBeGreaterThan(to + 0.1);
    const starts = await page.evaluate(() => (window as unknown as { starts: { offset: number; duration: number }[] }).starts);
    // Picture buffering can restart a sound segment. Every restart must still exclude the selected source interval.
    expect(starts.length).toBeGreaterThanOrEqual(from ? 2 : 1);
    expect(starts[0]!.offset).toBe(from ? 0 : to);
    expect(starts[0]!.duration).toBeCloseTo(from || 3 - to, 2);
    const after = starts.filter((segment) => segment.offset >= to - 0.01);
    expect(after.length).toBeGreaterThanOrEqual(1);
    expect(after[0]!.offset).toBeCloseTo(to, 2);
    for (const segment of starts) {
      expect(segment.offset < from || segment.offset >= to - 0.01).toBe(true);
      if (segment.offset < from) expect(segment.offset + segment.duration).toBeCloseTo(from, 2);
      else expect(segment.offset + segment.duration).toBeCloseTo(3, 2);
    }
    const now = await sample(page);
    expect(Math.abs(now.picture! - now.clock)).toBeLessThan(SYNC_TOLERANCE);
    expect((await server.project.readEditList(REEL)).operations).toEqual([]);
  } finally { await browser.close(); await server.close(); }
});

it('keeps the picture on the sound clock while playing', { timeout: TIMEOUT_MS }, async () => {
  const server = await startServer({ projectDir: reelWithPicture(), port: 0 });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await openEditor(page, server.url);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(async () => (await sample(page)).clock).toBeGreaterThan(0.2);
    const offsets: number[] = [];
    while (offsets.length < 20) {
      const now = await sample(page);
      if (now.clock >= 2.8) break;
      if (!now.waiting && now.picture !== null) offsets.push(Math.abs(now.picture - now.clock));
      await page.waitForTimeout(50);
    }
    expect(offsets.length).toBeGreaterThan(10);
    expect(Math.max(...offsets)).toBeLessThan(SYNC_TOLERANCE);
  } finally {
    await browser.close();
    await server.close();
  }
});

it('holds sound and clock while the picture cannot keep up, then resumes from the same moment (AM36)', { timeout: TIMEOUT_MS }, async () => {
  const server = await startServer({ projectDir: reelWithPicture(), port: 0 });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const held: Route[] = [];
    let holding = true;
    await page.route(PICTURE, (route) => (holding ? void held.push(route) : void route.continue()));
    await openEditor(page, server.url);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Waiting for picture…' }).waitFor();
    await page.waitForTimeout(HOLD_WATCH_MS);
    const during = await sample(page);
    expect(during.waiting).toBe(true);
    expect(during.clock).toBeLessThan(0.05);

    holding = false;
    for (const route of held.splice(0)) await route.continue();
    await expect.poll(async () => (await sample(page)).clock, { timeout: 20_000 }).toBeGreaterThan(0.5);
    expect((await sample(page)).waiting).toBe(false);
    await expect.poll(() => page.getByRole('status').filter({ hasText: 'Waiting for picture…' }).count()).toBe(0);
  } finally {
    await browser.close();
    await server.close();
  }
});

it('stops with Retry when the picture cannot be loaded, and plays after a successful retry', { timeout: TIMEOUT_MS }, async () => {
  const server = await startServer({ projectDir: reelWithPicture(), port: 0 });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    let failing = true;
    await page.route(PICTURE, (route) => (failing ? void route.abort() : void route.continue()));
    await openEditor(page, server.url);
    const failure = page.locator('.rv-frame').getByRole('status').filter({ hasText: 'The picture for Take could not be loaded.' });
    await failure.waitFor();
    // A failed picture is not played around: sound does not run on alone while it is missing.
    expect(await page.getByRole('button', { name: 'Play', exact: true }).isDisabled()).toBe(true);
    expect((await sample(page)).clock).toBe(0);

    failing = false;
    await page.getByRole('button', { name: /^Retry picture for / }).first().click();
    await expect.poll(() => failure.count()).toBe(0);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(async () => (await sample(page)).clock, { timeout: 20_000 }).toBeGreaterThan(0.5);
  } finally {
    await browser.close();
    await server.close();
  }
});

it('retries a failed still on its clip with a fresh request, and keeps its note inside the affected span', { timeout: TIMEOUT_MS }, async () => {
  const dir = copyFixture('footage-project');
  const reel = join(dir, 'reels', REEL);
  const generated = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=160x90', '-frames:v', '1', join(reel, 'v1/still.png')], { encoding: 'utf8' });
  expect(generated.status, generated.stderr).toBe(0);
  const plan = (root: string) => ({ title: 'Still', duration: 3, sections: [{ id: 'all', name: 'All', start: 0, end: 3 }], clips: [], media: {
    schema: 1, sources: [{ id: 'still', name: 'Still', kind: 'image', path: `${root}still.png`, duration: 0 }],
    placements: [{ id: 'picture', role: 'main', source: 'still', in: 0, out: 0, duration: 1 }, { id: 'gap', role: 'gap', duration: 2 }], sequence: ['picture', 'gap'],
  } });
  writeFileSync(join(reel, 'plan.json'), JSON.stringify(plan('v1/')));
  writeFileSync(join(reel, 'v1/plan.json'), JSON.stringify(plan('')));
  writeFileSync(join(reel, 'v1/shots.json'), JSON.stringify({ contract: 1, duration: 3, sections: [{ id: 'all', name: 'All', start: 0, end: 3 }], shots: [] }));
  const server = await startServer({ projectDir: dir, port: 0 });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    let failing = true;
    const requests: string[] = [];
    await page.route('**/media/founder-talk/1/still*', (route) => { requests.push(route.request().url()); return failing ? route.abort() : route.continue(); });
    await openEditor(page, server.url);
    const note = page.locator('.rv-frame').getByText('The picture for Still could not be loaded.', { exact: true });
    await note.waitFor();
    const retry = page.getByRole('button', { name: 'Retry picture for picture', exact: true });
    await retry.waitFor();
    await page.getByLabel('Playhead', { exact: true }).fill('2');
    expect(await note.count()).toBe(0);
    expect(await retry.count()).toBe(1);
    await page.getByLabel('Playhead', { exact: true }).fill('0');
    await note.waitFor();
    failing = false;
    await retry.click();
    await expect.poll(() => page.locator('img.mv-picture').evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(160);
    expect(await note.count()).toBe(0);
    expect(await retry.count()).toBe(0);
    expect(requests.some((url) => url.endsWith('?retry=1'))).toBe(true);
  } finally { await browser.close(); await server.close(); }
});
