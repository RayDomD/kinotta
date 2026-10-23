import { openDetailedEditor } from '../helpers/review-rail.ts';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { chromium, expect as browserExpect } from 'playwright/test';
import { expect, it } from 'vitest';
import { startServer } from '../../server/main.ts';
import { copyFixture, emptyProject } from '../helpers/project.ts';
import { invariants } from '../../web/src/review/_internal/MediaLibrary.verify.ts';
import { revealReelRail } from '../helpers/review-rail.ts';

const decode = (file: string) => {
  const decoded = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:a', '-af', 'pan=mono|c0=c0', '-ar', '48000', '-f', 'f32le', '-'], { maxBuffer: 8 * 1024 * 1024 });
  expect(decoded.status, decoded.stderr.toString()).toBe(0);
  return new Float32Array(decoded.stdout.buffer, decoded.stdout.byteOffset, decoded.stdout.length / 4);
};

it('previews, searches and adds bundled sound at the playhead with reusable content and Undo/Save', { timeout: 90_000 }, async () => {
  const dir = copyFixture('footage-project');
  const reel = join(dir, 'reels/founder-talk');
  const plan = { duration: 4, clips: [], media: { schema: 1, sources: [], placements: [{ id: 'gap', role: 'gap', duration: 4 }], sequence: ['gap'] } };
  writeFileSync(join(reel, 'plan.json'), JSON.stringify(plan));
  writeFileSync(join(reel, 'v1/plan.json'), JSON.stringify(plan));
  const server = await startServer({ projectDir: dir, port: 0 });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    let catalogueFails = true;
    await page.route('**/api/sound-effects', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (catalogueFails) await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Effects catalogue unavailable.' }) });
      else await route.continue();
    });
    await openDetailedEditor(page, server.url);
    await revealReelRail(page);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Founder talk: going local-first' }).click();
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    await page.getByRole('tab', { name: 'Media rail', exact: true }).click();
    const library = page.getByRole('region', { name: 'Project media library' });
    await library.getByRole('tab', { name: 'Effects', exact: true }).click({ timeout: 3000 });
    const verify = async () => { for (const invariant of invariants) expect(await library.evaluate(invariant.check), invariant.description).toBe(true); };
    await browserExpect(library.getByRole('alert')).toContainText('Effects catalogue unavailable'); await verify();
    catalogueFails = false;
    await library.getByRole('button', { name: 'Retry effects', exact: true }).click();
    await browserExpect(library.getByRole('status')).toContainText('Loading effects'); await verify();
    await browserExpect(library.locator('[data-effect-id]')).toHaveCount(17);
    await verify();
    const invalidCount = await library.evaluate((root) => { const previous = root.getAttribute('data-verify-count')!; root.setAttribute('data-verify-count', '99'); return previous; });
    expect(await library.evaluate(invariants.find((rule) => rule.description === 'rows match their count')!.check)).toBe(false);
    await library.evaluate((root, count) => root.setAttribute('data-verify-count', count), invalidCount);
    await library.getByLabel('Search effects').fill('pop');
    await browserExpect(library.locator('[data-effect-id]')).toHaveCount(1);
    await library.getByRole('button', { name: 'Preview Pop', exact: true }).click();
    const preview = page.locator('[data-verify-unit="MediaPreview"]');
    const audio = preview.getByLabel('Preview of Pop');
    await browserExpect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.readyState)).toBeGreaterThan(0);
    await audio.evaluate((element: HTMLAudioElement) => element.play());
    await browserExpect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime)).toBeGreaterThan(0);
    expect(await server.project.listMedia()).toEqual([]);
    await page.getByRole('button', { name: 'Close media preview' }).click();
    await library.getByLabel('Search effects').fill('nonexistent sound');
    await browserExpect(library.getByText('No matching effects.')).toBeVisible(); await verify();
    await library.getByLabel('Search effects').fill('pop');
    await page.getByLabel('Playhead', { exact: true }).fill('1.25');
    let fail = true;
    await page.route('**/api/sound-effects/pop', async (route) => {
      if (!fail) return route.continue();
      await new Promise((resolve) => setTimeout(resolve, 250));
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Effect copy failed. Try again.' }) });
    });
    const add = library.getByRole('button', { name: 'Add Pop at playhead', exact: true });
    await add.click(); await browserExpect(add).toBeDisabled(); await verify();
    await browserExpect(library.getByRole('alert')).toContainText('Effect copy failed');
    expect((await server.project.readEditList('founder-talk')).operations).toEqual([]);
    fail = false; await add.click();
    const last = async () => (await server.project.readEditList('founder-talk')).operations.at(-1);
    await browserExpect.poll(last).toMatchObject({ kind: 'placement-add', placement: { role: 'audio', at: 1.25, gain: 0.35, fadeIn: 0, fadeOut: 0 } });
    const entry = (await server.project.listMedia())[0];
    expect(readFileSync(join(dir, entry.path))).toEqual(readFileSync(resolve('skill/kinotta/assets/sfx-synth/pop.wav')));
    const lane = page.getByRole('region', { name: 'Media timeline' });
    await browserExpect(lane.getByRole('button', { name: /^pop.wav, audio,/ })).toHaveCount(1);
    expect((await server.project.readEditList('founder-talk')).operations.find((op) => op.kind === 'track-add')).toMatchObject({ track: { name: 'Effects' } });
    await verify();
    await page.screenshot({ path: join(tmpdir(), 'kinotta-effects-shelf.png') });
    await add.click();
    await browserExpect(lane.getByRole('button', { name: /^pop.wav, audio,/ })).toHaveCount(2);
    expect(await server.project.listMedia()).toHaveLength(1);
    expect((await server.project.readEditList('founder-talk')).operations.filter((op) => op.kind === 'track-add')).toHaveLength(1);
    await lane.getByRole('button', { name: /^pop.wav, audio,/ }).last().press('Control+z');
    await browserExpect(lane.getByRole('button', { name: /^pop.wav, audio,/ })).toHaveCount(1);
    await lane.getByRole('button', { name: /^pop.wav, audio,/ }).click();
    await page.getByRole('tab', { name: 'Sound', exact: true }).click();
    await browserExpect(page.getByRole('region', { name: 'Sound settings' })).toBeVisible();
    await page.getByRole('tab', { name: /^Edits/ }).click();
    expect(await server.project.freezeEdits('founder-talk')).toEqual({ version: 2 });
    await browserExpect.poll(async () => (await server.project.listVersions('founder-talk')).length).toBe(2);
    const saved = await server.project.readVersion('founder-talk', 2);
    expect(saved.media!.tracks!.find((track) => track.name === 'Effects')).toBeDefined();
    expect(saved.media!.placements.find((clip) => clip.role === 'audio')).toMatchObject({ at: 1.25, gain: 0.35 });
    expect((await server.project.readVersion('founder-talk', 1)).media!.sources).toEqual([]);
    const job = await server.project.whenRendered((await server.project.render({ reel: 'founder-talk', version: 2, preset: 'draft', size: 'source', fps: 30 })).id);
    expect(job.error).toBeUndefined();
    const samples = decode(join(dir, job.output!));
    const original = decode(resolve('skill/kinotta/assets/sfx-synth/pop.wav'));
    const rms = (values: Float32Array) => Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
    expect(rms(samples.slice(0, 48000))).toBeLessThan(0.0001);
    expect(rms(samples.slice(60000, 60000 + original.length))).toBeCloseTo(rms(original) * 0.35, 3);
    expect(rms(samples.slice(144000))).toBeLessThan(0.0001);
    await revealReelRail(page);
    expect((await server.project.readVersion('founder-talk', 1)).number).toBe(1);
    await page.getByRole('tab', { name: 'Media rail', exact: true }).click();
    await library.getByRole('tab', { name: 'Effects', exact: true }).click();
    await verify();
  } finally { await browser.close(); await server.close(); }
});


it('opens and renders a frozen reel from its copied MP3 after the catalogue switches to WAV', { timeout: 90_000 }, async () => {
  const dir = emptyProject();
  const version = join(dir, 'reels/legacy/v1');
  mkdirSync(join(version, 'assets'), { recursive: true });
  copyFileSync(resolve('tests/fixtures/legacy-effect.mp3'), join(version, 'assets/pop.mp3'));
  const plan = { duration: 2, clips: [], media: {
    schema: 1,
    tracks: [{ id: 'sfx', name: 'Effects', order: 0, gain: 1, mute: false }],
    sources: [{ id: 'pop', kind: 'audio', path: 'assets/pop.mp3', duration: 0.4 }],
    placements: [
      { id: 'gap', role: 'gap', duration: 2 },
      { id: 'legacy-pop', role: 'audio', source: 'pop', track: 'sfx', in: 0, out: 0.4, at: 0.5, gain: 0.35 },
    ], sequence: ['gap'],
  } };
  writeFileSync(join(dir, 'reels/legacy/reel.json'), JSON.stringify({ title: 'Legacy MP3 reel' }));
  writeFileSync(join(version, 'plan.json'), JSON.stringify(plan));
  writeFileSync(join(version, 'shots.json'), JSON.stringify({ schema: 1, shots: [] }));
  writeFileSync(join(version, 'index.html'), '<!doctype html><style>html,body{margin:0;width:160px;height:90px;background:transparent}</style><script>window.DURATION=2;window.seek=()=>{};</script>');
  const before = readFileSync(join(version, 'plan.json'));
  const original = readFileSync(join(version, 'assets/pop.mp3'));
  const server = await startServer({ projectDir: dir, port: 0 });
  try {
    expect(await server.project.soundEffects()).toContainEqual(expect.objectContaining({ id: 'pop', file: 'pop.wav', duration: 0.1 }));
    // The old identity overlaps the new catalogue; the saved source must still win.
    const response = await fetch(`${server.url}/api/reels/legacy/versions/1`);
    expect(response.status).toBe(200);
    expect((await response.json()).media).toEqual(plan.media);
    expect((await server.project.readWorkingVersion('legacy')).media).toEqual(plan.media);
    const media = await server.project.mediaFile('pop', { reel: 'legacy', version: 1 });
    expect(readFileSync(media!)).toEqual(original);
    const job = await server.project.whenRendered((await server.project.render({ reel: 'legacy', version: 1, preset: 'draft', size: 'source', fps: 30 })).id);
    expect(job.error).toBeUndefined();
    const rendered = decode(join(dir, job.output!));
    const reference = decode(join(version, 'assets/pop.mp3'));
    const start = 24000; // The saved placement starts at 0.5 s at 48 kHz.
    const rms = (values: Float32Array) => Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
    const aacFrameSamples = 1024;
    expect(rms(rendered.slice(0, start - aacFrameSamples))).toBeLessThan(0.0001);
    expect(rms(rendered.slice(start + reference.length + aacFrameSamples))).toBeLessThan(0.0001);
    // Compare the waveform against the saved MP3, allowing the render's AAC encoding loss.
    let signal = 0;
    let error = 0;
    reference.forEach((sample, i) => {
      const expected = sample * 0.35;
      signal += expected * expected;
      error += (rendered[start + i]! - expected) ** 2;
    });
    expect(signal).toBeGreaterThan(0);
    expect(error / signal).toBeLessThan(0.02);
    expect(readFileSync(join(version, 'plan.json'))).toEqual(before);
    expect(readFileSync(join(version, 'assets/pop.mp3'))).toEqual(original);
  } finally { await server.close(); }
});
