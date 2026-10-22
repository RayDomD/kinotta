import { openDetailedEditor } from '../helpers/review-rail.ts';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { expect, it } from 'vitest';
import { startServer } from '../../server/main.ts';
import { mixAt } from '../../server/core/model.ts';
import { invariants } from '../../web/src/review/_internal/SoundSettings.verify.ts';
import { copyFixture } from '../helpers/project.ts';

it('opens Sound beside an audio clip, applies ducking, undoes it and saves points that render like preview', { timeout: 120_000 }, async () => {
  const dir = copyFixture('footage-project');
  for (const [name, level] of [['bed', 0.2], ['voice', 0]] as const) {
    const run = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `aevalsrc=${level}:s=48000:d=4`, join(dir, `${name}.wav`)], { encoding: 'utf8' });
    expect(run.status, run.stderr).toBe(0);
  }
  const reel = join(dir, 'reels/founder-talk');
  const media = (prefix: string) => ({ schema: 1, tracks: [
    { id: 'music', name: 'Music', order: 0, gain: 1, mute: false }, { id: 'voice', name: 'Voice', order: 1, gain: 1, mute: false },
  ], sources: [
    { id: 'bed', name: 'bed.wav', kind: 'audio', path: `${prefix}bed.wav`, duration: 4 },
    { id: 'voice', name: 'voice.wav', kind: 'audio', path: `${prefix}voice.wav`, duration: 4, words: [{ text: 'Hello', start: 1, end: 2 }] },
  ], placements: [
    { id: 'song', role: 'audio', source: 'bed', track: 'music', at: 0, in: 0, out: 4, gain: 0.5, volume: [{ at: 3, gain: 0.4 }] },
    { id: 'narration', role: 'audio', source: 'voice', track: 'voice', at: 0, in: 0, out: 4, speech: true },
  ], sequence: [] });
  writeFileSync(join(reel, 'plan.json'), JSON.stringify({ duration: 4, clips: [], media: media('../../') }));
  writeFileSync(join(reel, 'v1/plan.json'), JSON.stringify({ duration: 4, clips: [], media: media('../../../') }));
  const server = await startServer({ projectDir: dir, port: 0 });
  const browser = await chromium.launch();
  let release = () => {};
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await openDetailedEditor(page, server.url);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Founder talk: going local-first' }).click();
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    await page.getByRole('tab', { name: 'Sound', exact: true }).click();
    const sound = page.getByRole('region', { name: 'Sound settings' });
    const verify = async () => { for (const invariant of invariants) expect(await sound.evaluate(invariant.check), invariant.description).toBe(true); };
    await expect.poll(() => sound.getAttribute('data-verify-status')).toBe('empty');
    await verify();
    await page.getByRole('region', { name: 'Media timeline' }).getByRole('button', { name: /^voice.wav, audio,/ }).click();
    await expect.poll(() => sound.getAttribute('data-verify-status')).toBe('unavailable');
    await verify();
    // Audio selection opens Clip by default, while an already open Sound tab follows the selection.
    await page.getByRole('tab', { name: /^Edits/ }).click();
    await page.getByRole('region', { name: 'Media timeline' }).getByRole('button', { name: /^bed.wav, audio,/ }).click();
    await expect.poll(() => page.getByRole('tab', { name: 'Clip', exact: true }).getAttribute('aria-selected')).toBe('true');
    await page.getByRole('tab', { name: 'Sound', exact: true }).click();
    await sound.getByLabel('Lower before speech', { exact: true }).fill('0');
    await expect.poll(() => sound.getAttribute('data-verify-status')).toBe('error');
    await verify();
    await sound.getByLabel('Lower before speech', { exact: true }).fill('0.15');
    await sound.getByLabel('Amount in dB').fill('20');
    await verify();
    await page.screenshot({ path: join(tmpdir(), 'kinotta-duck-sidebar.png') });
    const saving = new Promise<void>((resolve) => { release = resolve; });
    await page.route('**/edits', async (route) => {
      if (route.request().method() === 'POST') await saving;
      await route.continue();
    });
    await sound.getByRole('button', { name: 'Apply ducking' }).click();
    await expect.poll(() => sound.getAttribute('data-verify-point-count')).toBe('4');
    expect(await sound.getAttribute('data-verify-loading')).toBe('false');
    expect(await sound.getByRole('button', { name: 'Apply ducking' }).isEnabled()).toBe(true);
    expect((await server.project.readEditList('founder-talk')).operations).toHaveLength(0);
    await verify();
    release();
    await expect.poll(async () => (await server.project.readEditList('founder-talk')).operations.at(-1)?.kind).toBe('placement-duck');
    await expect.poll(() => sound.getByRole('button', { name: 'Apply ducking' }).isEnabled()).toBe(true);
    const markup = await sound.evaluate((el) => el.outerHTML);
    // Run the component's real DOM invariants in Chromium, without depending on React internals.
    await verify();
    // Prove the invariant actually rejects the inconsistent fixture.
    await sound.evaluate((el) => el.setAttribute('data-verify-loading', 'true'));
    expect(await sound.evaluate(invariants.find((check) => check.description === 'busy never enables Apply')!.check)).toBe(false);
    await sound.evaluate((el) => el.setAttribute('data-verify-loading', 'false'));
    expect(markup).toContain('Lower music under speech');
    await page.getByRole('toolbar', { name: 'Timeline tools' }).getByRole('button', { name: 'Select', exact: true }).focus();
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await server.project.readEditList('founder-talk')).operations.length).toBe(0);
    await expect.poll(() => sound.getAttribute('data-verify-point-count')).toBe('1');
    await sound.getByRole('button', { name: 'Apply ducking' }).click();
    await expect.poll(async () => (await server.project.readEditList('founder-talk')).operations.length).toBe(1);
    await page.getByRole('tab', { name: /^Edits/ }).click();
    expect(await server.project.freezeEdits('founder-talk')).toEqual({ version: 2 });
    const version = await server.project.readVersion('founder-talk', 2);
    const song = version.media!.placements.find((p) => p.id === 'song')!;
    expect(song.role !== 'gap' && song.volume?.length).toBe(4);
    expect(mixAt(version.media!, 1.5, 4).find((p) => p.placement === 'song')!.gain).toBeCloseTo(0.05);
    const job = await server.project.whenRendered((await server.project.render({ reel: 'founder-talk', version: 2, preset: 'draft', size: 'source', fps: 30 })).id);
    expect(job.error).toBeUndefined();
    const decoded = spawnSync('ffmpeg', ['-v', 'error', '-i', join(dir, job.output!), '-map', '0:a', '-af', 'pan=mono|c0=FL', '-ar', '48000', '-f', 'f32le', '-'], { maxBuffer: 8 * 1024 * 1024 });
    expect(decoded.status, decoded.stderr.toString()).toBe(0);
    const samples = new Float32Array(decoded.stdout.buffer, decoded.stdout.byteOffset, decoded.stdout.length / 4);
    for (const at of [0.5, 0.9, 1.5, 2.2, 3]) {
      const window = samples.slice(Math.round(at * 48000), Math.round(at * 48000) + 48);
      expect(window).toHaveLength(48);
      const heard = window.reduce((sum, value) => sum + value, 0) / window.length;
      const expected = mixAt(version.media!, at, 4).find((p) => p.placement === 'song')!.gain * 0.2;
      expect(heard, `render vs preview at ${at}s`).toBeCloseTo(expected, 3);
    }
  } finally { release(); await browser.close(); await server.close(); }
});
