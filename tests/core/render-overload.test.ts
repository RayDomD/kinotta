import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { startServer } from '../../server/main.ts';
import { copyFixture } from '../helpers/project.ts';
import { inspectPlacement } from '../helpers/review-rail.ts';

const REEL = 'founder-talk';
const RENDER_TIMEOUT_MS = 180_000;
const LAUNCHER = resolve(import.meta.dirname, '../../bin/kinotta.mjs');

/** A footage-project reel whose saved v1 plays a 0.6 sine that rises to twice its level at 1 s: over full scale from about 0.97 s. */
function overloadedVersion(): string {
  const dir = copyFixture('footage-project');
  const reel = join(dir, 'reels', REEL);
  const tone = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'aevalsrc=0.6*sin(2*PI*440*t):s=48000:d=2', join(reel, 'v1/tone.wav')], { encoding: 'utf8' });
  expect(tone.status, tone.stderr).toBe(0);
  writeFileSync(join(reel, 'v1/plan.json'), JSON.stringify({
    title: 'Loud', duration: 2, sections: [{ id: 'all', name: 'All', start: 0, end: 2 }], clips: [],
    media: { schema: 1, sources: [{ id: 'tone', kind: 'audio', path: 'tone.wav', duration: 2 }], placements: [{ id: 'twice', role: 'audio', source: 'tone', at: 0, in: 0, out: 2, volume: [{ at: 0.9, gain: 1 }, { at: 1, gain: 2 }] }], sequence: [] },
  }));
  writeFileSync(join(reel, 'v1/shots.json'), JSON.stringify({ contract: 1, duration: 2, sections: [{ id: 'all', name: 'All', start: 0, end: 2 }], shots: [] }));
  writeFileSync(join(reel, 'v1/index.html'), '<!doctype html><html class="alpha"><style>html,body{margin:0;background:transparent;width:160px;height:90px}</style><script>window.DURATION=2;window.seek=()=>{};</script>');
  return dir;
}

it('refuses to render an overloaded mix until the owner accepts it, and never changes its levels (AM38)', { timeout: RENDER_TIMEOUT_MS }, async () => {
  const dir = overloadedVersion();
  const project = openProject(dir);

  for (const preset of ['draft', 'final'] as const) {
    await expect(project.render({ reel: REEL, version: 1, preset })).rejects.toMatchObject({ code: 'invalid', message: expect.stringMatching(/above full scale at 0\.9\d–2\.00s \(peak \+1\.6 dB\)/) });
  }
  expect(project.renderJobs()).toEqual([]);

  const job = await project.whenRendered((await project.render({ reel: REEL, version: 1, preset: 'draft', size: 'source', fps: 30, acceptOverload: true })).id);
  expect(job.error).toBeUndefined();
  // Rendered as it is: the passage before the overload keeps its level, so no limiter or normalization acted on the mix.
  // FFmpeg's AAC encoder then avoids clipping inside the overloaded passage by itself, so only its onset passes full scale.
  const raw = spawnSync('ffmpeg', ['-v', 'error', '-i', join(dir, job.output!), '-map', '0:a', '-af', 'pan=mono|c0=FL', '-ar', '48000', '-f', 'f32le', '-'], { maxBuffer: 64 * 1024 * 1024 }).stdout;
  const samples = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
  const peak = (from: number, to: number): number => samples.slice(from * 48_000, to * 48_000).reduce((most, value) => Math.max(most, Math.abs(value)), 0);
  expect(peak(0.2, 0.8)).toBeCloseTo(0.6, 1);
  expect(peak(1.1, 1.9)).toBeGreaterThan(0.9);
});

it('warns of a pending overload in the editor and asks before rendering one', { timeout: RENDER_TIMEOUT_MS }, async () => {
  const dir = copyFixture('footage-project');
  const reel = join(dir, 'reels', REEL);
  const tone = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'aevalsrc=0.6*sin(2*PI*440*t):s=48000:d=2', join(dir, 'tone.wav')], { encoding: 'utf8' });
  expect(tone.status, tone.stderr).toBe(0);
  const media = (path: string) => ({ schema: 1, sources: [{ id: 'tone', kind: 'audio', path, duration: 2 }], placements: [{ id: 'loud', role: 'audio', source: 'tone', at: 0, in: 0, out: 2, gain: 2 }], sequence: [] });
  writeFileSync(join(reel, 'plan.json'), JSON.stringify({ title: 'Loud', duration: 2, sections: [{ id: 'all', name: 'All', start: 0, end: 2 }], clips: [], media: media('../../tone.wav') }));
  writeFileSync(join(reel, 'v1/plan.json'), JSON.stringify({ title: 'Loud', duration: 2, sections: [{ id: 'all', name: 'All', start: 0, end: 2 }], clips: [], media: media('../../../tone.wav') }));
  writeFileSync(join(reel, 'v1/shots.json'), JSON.stringify({ contract: 1, duration: 2, sections: [{ id: 'all', name: 'All', start: 0, end: 2 }], shots: [] }));
  writeFileSync(join(reel, 'v1/index.html'), '<!doctype html><html class="alpha"><style>html,body{margin:0;background:transparent;width:160px;height:90px}</style><script>window.DURATION=2;window.seek=()=>{};</script>');
  const server = await startServer({ projectDir: dir, port: 0 });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(server.url);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Founder talk: going local-first' }).click();
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    const warning = page.getByRole('region', { name: 'Mix overload' });
    await warning.getByText(/above full scale at 0\.00–2\.00s \(peak \+1\.6 dB\)/).waitFor();

    // Lowering the level in the editor clears the warning; Undo brings it back. The level is never lowered for the owner.
    await inspectPlacement(page, /^tone\.wav, audio/);
    await page.getByLabel('Volume for loud').fill('0.5');
    await page.getByLabel('Volume for loud').press('Tab');
    await expect.poll(() => warning.count()).toBe(0);
    await page.getByRole('toolbar', { name: 'Timeline tools' }).getByRole('button', { name: 'Select', exact: true }).press('Control+z');
    await warning.waitFor();
    expect((await server.project.readEditList(REEL)).operations).toEqual([]);

    await page.getByRole('group', { name: 'Version actions' }).getByRole('button', { name: 'Render v1' }).click();
    const form = page.getByRole('dialog', { name: 'Render v1' });
    await form.getByRole('alert').filter({ hasText: 'above full scale at 0.00–2.00s' }).waitFor();
    expect(await form.getByRole('button', { name: 'Render', exact: true }).isDisabled()).toBe(true);
    await form.getByRole('checkbox', { name: 'Render with the overload' }).check();
    await form.getByRole('button', { name: 'Render', exact: true }).click();
    await form.getByRole('status').filter({ hasText: 'v1 Draft queued.' }).waitFor();
    for (const job of server.project.renderJobs()) await server.project.cancelRender(job.id);
  } finally {
    await browser.close();
    await server.close();
  }
});

it('kinotta render refuses an overloaded mix with where it overloads, and renders it with --accept-overload', { timeout: RENDER_TIMEOUT_MS }, () => {
  const dir = overloadedVersion();
  const render = (...flags: string[]) => spawnSync(process.execPath, [LAUNCHER, 'render', REEL, 'v1', '--preset', 'draft', ...flags], { cwd: dir, encoding: 'utf8', timeout: RENDER_TIMEOUT_MS });

  const refused = render();
  expect(refused.status).toBe(1);
  expect(refused.stderr).toMatch(/above full scale at 0\.9\d–2\.00s/);
  const accepted = render('--accept-overload');
  expect(accepted.stderr).toBe('');
  expect(accepted.status).toBe(0);
  expect(accepted.stdout).toContain('Rendered');
});
