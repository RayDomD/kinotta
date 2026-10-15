import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import type { Route } from 'playwright';
import { expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { startServer } from '../../server/main.ts';
import { emptyProject } from '../helpers/project.ts';
import { inspectPlacement } from '../helpers/review-rail.ts';
import { invariants } from '../../web/src/review/_internal/PictureLayers.verify.ts';

function ffmpeg(args: string[]) {
  const run = spawnSync('ffmpeg', ['-v', 'error', ...args], { maxBuffer: 64 * 1024 * 1024 });
  expect(run.status, run.stderr.toString()).toBe(0);
  return run.stdout;
}
function fixture() {
  const dir = emptyProject(); const reel = join(dir, 'reels/demo'); const version = join(reel, 'v1');
  mkdirSync(version, { recursive: true });
  for (const [name, color] of [['red', 'red'], ['blue', 'blue']] as const) {
    ffmpeg(['-y', '-f', 'lavfi', '-i', `color=c=${color}:s=160x90:r=30:d=3`, '-c:v', 'libx264', join(version, `${name}.mp4`)]);
  }
  ffmpeg(['-y', '-f', 'lavfi', '-i', 'color=c=yellow:s=80x80', '-frames:v', '1', join(version, 'photo.png')]);
  ffmpeg(['-y', '-f', 'lavfi', '-i', 'aevalsrc=0.1:s=48000:d=3', join(version, 'music.wav')]);
  const plan = (root: string) => ({ title: 'Regions', duration: 3, clips: [], captions: false, sections: [{ id: 'all', name: 'All', start: 0, end: 3 }], media: {
    schema: 1, tracks: [{ id: 'music', name: 'Music', order: 0, gain: 0.5, mute: false }],
    sources: [{ id: 'red', name: 'Red', kind: 'video', path: `${root}red.mp4`, duration: 3, audio: false }, { id: 'blue', name: 'Blue', kind: 'video', path: `${root}blue.mp4`, duration: 3, audio: false }, { id: 'photo', name: 'Photo', kind: 'image', path: `${root}photo.png`, duration: 0 }, { id: 'music', kind: 'audio', path: `${root}music.wav`, duration: 3 }],
    placements: [{ id: 'main', role: 'main', source: 'red', in: 0, out: 3, region: { x: 0, y: 0, width: 0.5, height: 1 } }, { id: 'side', role: 'insert', source: 'blue', in: 1, out: 3, at: 0.5, region: { x: 0.5, y: 0, width: 0.5, height: 1 } }, { id: 'inset', role: 'insert', source: 'photo', in: 0, out: 0, at: 1.5, duration: 1, region: { x: 0.4, y: 0.4, width: 0.2, height: 0.2 }, framing: { mode: 'fit' } }, { id: 'bed', role: 'audio', source: 'music', track: 'music', in: 0, out: 3, at: 0, gain: 0.5 }], sequence: ['main'],
  } });
  writeFileSync(join(reel, 'reel.json'), JSON.stringify({ title: 'Regions' }));
  writeFileSync(join(reel, 'plan.json'), JSON.stringify(plan('v1/')));
  writeFileSync(join(version, 'plan.json'), JSON.stringify(plan('')));
  writeFileSync(join(reel, 'transcript.json'), JSON.stringify({ words: [] }));
  writeFileSync(join(version, 'index.html'), '<!doctype html><html class="alpha"><style>html,body{margin:0;background:transparent}#stage{width:160px;height:90px}</style><div id="stage"></div><script>window.DURATION=3;window.seek=()=>{};</script>');
  writeFileSync(join(version, 'shots.json'), JSON.stringify({ contract: 1, duration: 3, sections: [{ id: 'all', name: 'All', start: 0, end: 3 }], shots: [] }));
  return { dir, reel, version };
}

it('renders independent regions, timed overlap, Fit bars and the authored track mix in single and segmented renders', { timeout: 180_000 }, async () => {
  const { dir, version } = fixture();
  for (const segments of [1, 2]) {
    const project = openProject(dir, { renderSegments: segments });
    const job = await project.whenRendered((await project.render({ reel: 'demo', version: 1, preset: 'draft', size: 'source', fps: 30 })).id);
    expect(job.error).toBeUndefined();
    const file = join(dir, job.output!);
    for (const [frame, x, y, color] of [[7, 120, 45, [0, 0, 0]], [30, 40, 45, [253, 0, 0]], [30, 120, 45, [0, 0, 254]], [60, 80, 45, [253, 253, 0]], [60, 65, 45, [0, 0, 0]], [83, 120, 45, [0, 0, 0]]] as const) {
      const rgb = ffmpeg(['-i', file, '-vf', `select=eq(n\\,${frame})`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
      color.forEach((value, c) => expect(Math.abs(rgb[(y * 160 + x) * 3 + c]! - value), `segments ${segments}, frame ${frame}, (${x},${y})`).toBeLessThan(12));
    }
    const raw = ffmpeg(['-i', file, '-af', 'pan=mono|c0=FL', '-f', 'f32le', '-']);
    const audio = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
    expect(audio.slice(48000, 48480).reduce((s, v) => s + v, 0) / 480).toBeCloseTo(0.025, 3);
  }
  // A main picture can also sit in front of the inserts without changing sequence timing.
  const plan = JSON.parse(readFileSync(join(version, 'plan.json'), 'utf8'));
  plan.media.placements[0].region = { x: 0, y: 0, width: 1, height: 1 };
  plan.media.placements[0].layer = 10;
  writeFileSync(join(version, 'plan.json'), JSON.stringify(plan));
  const project = openProject(dir, { renderSegments: 1 });
  const job = await project.whenRendered((await project.render({ reel: 'demo', version: 1, preset: 'draft', size: 'source', fps: 30 })).id);
  expect(job.error).toBeUndefined();
  const rgb = ffmpeg(['-i', join(dir, job.output!), '-vf', 'select=eq(n\\,60),scale=1:1', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  expect(rgb[0]).toBeGreaterThan(240); expect(rgb[1]).toBeLessThan(10); expect(rgb[2]).toBeLessThan(10);
});

it('holds the shared sound clock when a secondary picture stalls, then resumes all source clocks together', { timeout: 60_000 }, async () => {
  const { dir } = fixture();
  const server = await startServer({ projectDir: dir, port: 0 }); const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const held: Route[] = []; let holding = true;
    await page.route('**/media/demo/1/blue', (route) => holding ? void held.push(route) : void route.continue());
    await page.goto(server.url);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Regions', exact: true }).click();
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    const editor = page.locator('[data-verify-unit="MediaEditor"]');
    await editor.waitFor(); await page.getByLabel('Playhead', { exact: true }).fill('1');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(() => editor.getAttribute('data-verify-waiting')).toBe('true');
    await page.waitForTimeout(500);
    expect(Number(await editor.getAttribute('data-verify-clock'))).toBeLessThan(1.1);
    holding = false; for (const route of held.splice(0)) await route.continue();
    await expect.poll(async () => Number(await editor.getAttribute('data-verify-clock')), { timeout: 10_000 }).toBeGreaterThan(1.3);
    const clocks = await page.evaluate(() => ({ time: Number(document.querySelector('[data-verify-unit="MediaEditor"]')!.getAttribute('data-verify-clock')), pictures: [...document.querySelectorAll<HTMLVideoElement>('.mv-picture')].map((v) => ({ id: v.parentElement!.getAttribute('data-verify-id'), time: v.currentTime })) }));
    expect(clocks.pictures).toHaveLength(2);
    clocks.pictures.forEach((p) => expect(Math.abs(p.time - clocks.time - (p.id === 'side' ? 0.5 : 0))).toBeLessThan(0.1));
  } finally { await browser.close(); await server.close(); }
});

it('edits custom regions, drags/resizes, undoes, saves frozen history and plays simultaneous pictures on independent source clocks', { timeout: 120_000 }, async () => {
  const { dir, version } = fixture(); const before = readFileSync(join(version, 'plan.json'), 'utf8');
  const server = await startServer({ projectDir: dir, port: 0 }); const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(server.url);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Regions', exact: true }).click();
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    await page.locator('[data-verify-unit="MediaEditor"]').waitFor();
    await page.getByLabel('Playhead', { exact: true }).fill('2');
    const layers = page.locator('[data-verify-unit="PictureLayers"]');
    await expect.poll(() => layers.getAttribute('data-verify-count')).toBe('3');
    const verdicts = await layers.evaluate((root, checks) => checks.map((code) => new Function('root', `return (${code})(root)`)(root)), invariants.map((i) => i.check.toString()));
    expect(verdicts.every(Boolean)).toBe(true);
    await layers.evaluate((root) => root.setAttribute('data-verify-count', '99'));
    expect(await layers.evaluate((root, code) => new Function('root', `return (${code})(root)`)(root), invariants[1]!.check.toString())).toBe(false);
    await page.getByLabel('Playhead', { exact: true }).fill('1');
    const settings = await inspectPlacement(page, /^Blue, insert/);
    await settings.getByLabel('Picture layout for side').selectOption('inset');
    await expect.poll(async () => (await server.project.readEditList('demo')).operations.length).toBe(1);
    await page.getByRole('tab', { name: /^Edits/ }).click();
    await page.getByRole('button', { name: /^Undo/ }).click();
    await expect.poll(() => layers.locator('[data-verify-id="side"]').getAttribute('data-verify-region')).toBe(JSON.stringify({ x: 0.5, y: 0, width: 0.5, height: 1 }));
    await inspectPlacement(page, /^Blue, insert/);
    await settings.getByLabel('Picture layout for side').selectOption('inset');
    await page.getByLabel('Resize picture region', { exact: true }).waitFor();
    await page.getByLabel('Resize picture region', { exact: true }).scrollIntoViewIfNeeded();
    const grip = (await page.getByLabel('Resize picture region', { exact: true }).boundingBox())!;
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2); await page.mouse.down(); await page.mouse.move(grip.x - 12, grip.y - 12); await page.mouse.up();
    await expect.poll(async () => (await server.project.readEditList('demo')).operations.length).toBe(2);
    await page.getByLabel('Move picture region', { exact: true }).scrollIntoViewIfNeeded();
    const handle = (await page.getByLabel('Move picture region', { exact: true }).boundingBox())!;
    await page.mouse.move(handle.x + 10, handle.y + 8); await page.mouse.down(); await page.mouse.move(handle.x - 15, handle.y - 12); await page.mouse.up();
    await expect.poll(async () => (await server.project.readEditList('demo')).operations.length).toBe(3);
    await page.screenshot({ path: join(dir, 'free-layout.png') });
    await page.setViewportSize({ width: 1024, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByLabel('Move picture region', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(dir, 'free-layout-1024.png') });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('tab', { name: /^Edits/ }).click();
    expect(await server.project.freezeEdits('demo')).toEqual({ version: 2 });
    await expect.poll(async () => (await server.project.listVersions('demo')).length, { timeout: 10_000 }).toBe(2);
    const saved = await server.project.readVersion('demo', 2);
    expect(saved.media!.placements.find((p) => p.id === 'side')).toHaveProperty('region.width');
    expect(saved.media!.tracks).toEqual([{ id: 'music', name: 'Music', order: 0, gain: 0.5, mute: false }]);
    expect(readFileSync(join(version, 'plan.json'), 'utf8')).toBe(before);
    // Reopen the saved version and ensure every video follows its own source offset.
    await page.reload(); await page.getByRole('button', { name: 'Review', exact: true }).click();
    await page.getByLabel('Playhead', { exact: true }).fill('1');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(() => page.locator('[data-verify-unit="MediaEditor"]').getAttribute('data-verify-clock')).not.toBe('1');
    const clocks = await page.evaluate(() => ({ time: Number(document.querySelector('[data-verify-unit="MediaEditor"]')!.getAttribute('data-verify-clock')), pictures: [...document.querySelectorAll<HTMLVideoElement>('.mv-picture')].map((v) => ({ id: v.parentElement!.getAttribute('data-verify-id'), time: v.currentTime })) }));
    expect(clocks.pictures).toHaveLength(2);
    clocks.pictures.forEach((p) => expect(Math.abs(p.time - clocks.time - (p.id === 'side' ? 0.5 : 0))).toBeLessThan(0.1));
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    expect(await page.locator('[data-verify-unit="MediaEditor"]').getAttribute('data-verify-playing')).toBe('false');
  } finally { await browser.close(); await server.close(); }
});
