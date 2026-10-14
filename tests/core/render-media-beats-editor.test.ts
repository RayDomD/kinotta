import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, expect as browserExpect } from 'playwright/test';
import { expect, it } from 'vitest';
import { startServer } from '../../server/main.ts';
import { copyFixture } from '../helpers/project.ts';
import { invariants as soundChecks } from '../../web/src/review/_internal/SoundSettings.verify.ts';
import { invariants as laneChecks } from '../../web/src/review/_internal/NativeLanes.verify.ts';
const PYTHON = process.platform === 'win32' ? 'python' : 'python3';
const HAS_LIBROSA = spawnSync(PYTHON, ['-c', 'import importlib.util,sys;sys.exit(0 if importlib.util.find_spec("librosa") else 1)']).status === 0;

it.skipIf(!HAS_LIBROSA)('shows trimmed loop beats, toggles their display and snapping, and freezes detected timing on Save', { timeout: 120_000 }, async () => {
  const dir = copyFixture('footage-project');
  const tone = join(dir, 'music.wav');
  const make = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', "aevalsrc='if(lt(mod(t,0.5),0.015),if(lt(mod(t,2),0.015),0.8,0.2)*sin(2*PI*1000*t),0)':s=22050:d=4", tone], { encoding: 'utf8' });
  expect(make.status, make.stderr).toBe(0);
  const reel = join(dir, 'reels/founder-talk');
  const media = (prefix: string) => ({ schema: 1, sources: [
    { id: 'bed', kind: 'audio', name: 'Bed', path: `${prefix}music.wav`, duration: 4, beats: { tempo: 120, beats: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], downbeats: [0, 2] } },
    { id: 'effect', kind: 'audio', name: 'Effect', path: `${prefix}music.wav`, duration: 4 },
  ], tracks: [{ id: 'music', name: 'Music', order: 0, gain: 1, mute: false }, { id: 'sfx', name: 'Effects', order: 1, gain: 1, mute: false }], placements: [
    { id: 'music', role: 'audio', source: 'bed', track: 'music', in: 1, out: 3, at: 2, loop: true, duration: 5 },
    { id: 'effect', role: 'audio', source: 'effect', track: 'sfx', in: 0, out: 0.2, at: 4.47 },
  ], sequence: [] });
  const card = '<div data-slot="world"><div data-el="card">Music cut</div></div><!--/world--><script>M.scene({W:1920,H:1080,T:8,bg:"#000",center:[960,540],intro:null,SH:{still:{w:100,h:100}},start:"still",SEQ:[],layers:[]});</script>';
  writeFileSync(join(reel, 'card.html'), card); writeFileSync(join(reel, 'v1/card.html'), card);
  const plan = { title: 'Music cut', duration: 8, sections: [{ id: 'all', name: 'Music cut', start: 0, end: 8 }], clips: [{ id: 'card', title: 'Music cut', clip: 'card.html', kind: 'full', in: 0, out: 8, section: 'all' }] };
  writeFileSync(join(reel, 'plan.json'), JSON.stringify({ ...plan, media: media('../../') }));
  writeFileSync(join(reel, 'v1/plan.json'), JSON.stringify({ ...plan, media: media('../../../') }));
  const server = await startServer({ projectDir: dir, port: 0 }); const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(server.url);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Founder talk: going local-first' }).click();
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    const lane = page.getByRole('region', { name: 'Media timeline' });
    await browserExpect(lane.locator('.native-beat')).toHaveCount(10);
    expect(await lane.locator('.native-beat').evaluateAll((ticks) => ticks.every((tick) => getComputedStyle(tick).position === 'absolute'))).toBe(true);
    expect(await lane.locator('.native-beat[data-downbeat="true"]').count()).toBe(2);
    expect(await lane.locator('.native-beat').evaluateAll((ticks) => ticks.map((tick) => Number(tick.getAttribute('data-at'))))).toEqual([2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5]);
    const bed = lane.getByRole('button', { name: /^Bed, audio,/ });
    await bed.click(); await page.getByRole('tab', { name: 'Sound', exact: true }).click();
    const sound = page.getByRole('region', { name: 'Sound settings' });
    const verify = async () => {
      for (const invariant of soundChecks) expect(await sound.evaluate(invariant.check), invariant.description).toBe(true);
      for (const invariant of laneChecks) expect(await lane.evaluate(invariant.check), invariant.description).toBe(true);
    };
    await verify();
    await sound.getByLabel('Show beat ticks').click(); await browserExpect(lane.locator('.native-beat')).toHaveCount(0);
    await verify();
    await sound.getByLabel('Show beat ticks').click(); await browserExpect(lane.locator('.native-beat')).toHaveCount(10);
    await sound.getByLabel('Emphasize downbeats').click(); await browserExpect(lane.locator('.native-beat.downbeat')).toHaveCount(0);
    await sound.getByLabel('Emphasize downbeats').click(); await browserExpect(lane.locator('.native-beat.downbeat')).toHaveCount(2);
    const effect = lane.getByRole('button', { name: /^Effect, audio,/ });
    await effect.click(); await effect.press('ArrowRight');
    await verify();
    await browserExpect.poll(async () => (await server.project.readEditList('founder-talk')).operations.at(-1)).toMatchObject({ kind: 'placement-change', placement: 'effect', changes: { at: 4.5 } });
    await effect.press('Control+z');
    await browserExpect.poll(async () => (await server.project.readEditList('founder-talk')).operations.length).toBe(0);
    const snap = page.getByRole('toolbar', { name: 'Timeline tools' }).getByRole('button', { name: 'Snap', exact: true });
    await snap.click(); await browserExpect(lane).toHaveAttribute('data-verify-beat-snap', 'false');
    await effect.press('ArrowRight');
    await browserExpect.poll(async () => (await server.project.readEditList('founder-talk')).operations.at(-1)).toMatchObject({ kind: 'placement-change', placement: 'effect', changes: { at: 4.57 } });
    await effect.press('Control+z');
    await browserExpect.poll(async () => (await server.project.readEditList('founder-talk')).operations.length).toBe(0);
    await snap.click();
    await sound.getByLabel('Snap edits to beats').click();
    await effect.press('ArrowRight');
    await browserExpect.poll(async () => (await server.project.readEditList('founder-talk')).operations.at(-1)).toMatchObject({ kind: 'placement-change', placement: 'effect', changes: { at: 4.57 } });
    await bed.click();
    await page.route('**/beats?*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Beat detection needs librosa.' }) });
    });
    await sound.getByRole('button', { name: 'Detect again', exact: true }).click();
    await browserExpect(sound).toHaveAttribute('data-verify-beat-status', 'detecting'); await verify();
    await browserExpect(sound).toHaveAttribute('data-verify-beat-status', 'error'); await verify();
    await browserExpect(sound.getByRole('alert')).toContainText('librosa');
    await page.unroute('**/beats?*');
    const detected = page.waitForResponse((response) => response.url().includes('/beats?') && response.request().method() === 'POST');
    await sound.getByRole('button', { name: 'Detect again', exact: true }).click();
    await browserExpect(sound).toHaveAttribute('data-verify-beat-status', 'detecting');
    await verify();
    await browserExpect(sound.getByRole('button', { name: 'Detecting beats…' })).toBeDisabled();
    expect((await detected).status()).toBe(200);
    await browserExpect(sound).toHaveAttribute('data-verify-beat-status', 'ready');
    await verify();
    await browserExpect.poll(async () => (await server.project.readEditList('founder-talk')).operations.at(-1)?.kind).toBe('source-beats');
    await sound.getByRole('heading', { name: 'Beats', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(tmpdir(), 'kinotta-beats-sidebar.png') });
    await page.getByRole('tab', { name: /^Edits/ }).click();
    expect(await server.project.freezeEdits('founder-talk')).toEqual({ version: 2 });
    const version = await server.project.readVersion('founder-talk', 2);
    expect(version.media!.sources[0].beats!.beats.length).toBeGreaterThan(4);
    expect(version.media!.sources[0].beats!.tempo).toBeCloseTo(120, 0);
    expect((await server.project.readVersion('founder-talk', 1)).media!.sources[0].beats!.beats).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
    const checked = spawnSync(process.execPath, [resolve('bin/kinotta.mjs'), 'check', 'founder-talk', 'v2', '--project', dir], { encoding: 'utf8', timeout: 20_000 });
    expect(checked.status, checked.stderr + checked.stdout).toBe(0);
    expect(checked.stdout).toContain('founder-talk v2: no contract issues');
  } finally { await browser.close(); await server.close(); }
});
