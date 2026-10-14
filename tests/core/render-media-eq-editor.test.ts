import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { expect, it } from 'vitest';
import { startServer } from '../../server/main.ts';
import { copyFixture } from '../helpers/project.ts';

it('edits EQ on a shared track, bypasses it, undoes it, saves it and includes its boost in overload measurement', { timeout: 120_000 }, async () => {
  const dir = copyFixture('footage-project');
  const run = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'aevalsrc=0.3*sin(2*PI*1000*t):s=48000:d=2', join(dir, 'tone.wav')], { encoding: 'utf8' });
  expect(run.status, run.stderr).toBe(0);
  const reel = join(dir, 'reels/founder-talk');
  const media = (prefix: string) => ({ schema: 1, sources: [{ id: 'tone', kind: 'audio', name: 'Tone', path: `${prefix}tone.wav`, duration: 2 }], tracks: [{ id: 'music', name: 'Music', order: 0, gain: 1, mute: false }], placements: [0, 2].map((at) => ({ id: `tone-${at}`, role: 'audio', source: 'tone', track: 'music', in: 0, out: 2, at })), sequence: [] });
  writeFileSync(join(reel, 'plan.json'), JSON.stringify({ duration: 4, clips: [], media: media('../../') }));
  writeFileSync(join(reel, 'v1/plan.json'), JSON.stringify({ duration: 4, clips: [], media: media('../../../') }));
  const server = await startServer({ projectDir: dir, port: 0 });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.addInitScript(() => {
      const connect = AudioNode.prototype.connect;
      const root = window as unknown as { eqMeter?: AnalyserNode };
      AudioNode.prototype.connect = function(this: AudioNode, destination: AudioNode | AudioParam, output?: number, input?: number) {
        if (destination === this.context.destination) {
          if (!root.eqMeter || root.eqMeter.context !== this.context) {
            root.eqMeter = this.context.createAnalyser();
            Reflect.apply(connect, root.eqMeter, [destination]);
          }
          return Reflect.apply(connect, this, [root.eqMeter]);
        }
        return Reflect.apply(connect, this, destination instanceof AudioParam ? [destination, output ?? 0] : [destination, output ?? 0, input ?? 0]);
      } as typeof connect;
    });
    const heard = () => page.evaluate(() => {
      const meter = (window as unknown as { eqMeter?: AnalyserNode }).eqMeter;
      if (!meter) return 0;
      const data = new Float32Array(meter.fftSize); meter.getFloatTimeDomainData(data);
      return Math.sqrt(data.reduce((sum, n) => sum + n * n, 0) / data.length);
    });
    await page.goto(server.url);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Founder talk: going local-first' }).click();
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    await page.getByRole('region', { name: 'Media timeline' }).getByRole('button', { name: /^Tone, audio, 0.00/ }).click();
    await page.getByRole('tab', { name: 'Sound', exact: true }).click();
    const sound = page.getByRole('region', { name: 'Sound settings' });
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(heard).toBeCloseTo(0.3 / Math.sqrt(2), 2);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await sound.getByLabel('EQ preset').selectOption('speech');
    await expect.poll(() => sound.getAttribute('data-verify-eq-count')).toBe('2');
    await page.getByRole('region', { name: 'Media timeline' }).getByRole('button', { name: /^Tone, audio, 2.00/ }).click();
    await expect.poll(() => sound.getAttribute('data-verify-eq-count')).toBe('2');
    expect(await sound.getByText('Applies to all 2 clips on Music.').count()).toBe(1);
    await sound.getByLabel('Bypass EQ').click();
    await expect.poll(() => sound.getAttribute('data-verify-eq-bypass')).toBe('true');
    await page.getByRole('toolbar', { name: 'Timeline tools' }).getByRole('button', { name: 'Select', exact: true }).focus();
    await page.keyboard.press('Control+z');
    await expect.poll(() => sound.getAttribute('data-verify-eq-bypass')).toBe('false');
    await sound.getByLabel('EQ preset').selectOption('flat');
    await expect.poll(() => sound.getAttribute('data-verify-eq-count')).toBe('0');
    await sound.getByRole('button', { name: 'Add filter', exact: true }).click();
    await expect.poll(() => sound.getAttribute('data-verify-eq-count')).toBe('1');
    await sound.getByLabel('EQ filter 1 gain', { exact: true }).fill('12');
    await sound.getByLabel('EQ filter 1 gain', { exact: true }).press('Tab');
    await expect.poll(async () => (await server.project.mixOverload('founder-talk')).spans.length).toBeGreaterThan(0);
    await page.getByLabel('Playhead', { exact: true }).fill('0.3');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(heard).toBeCloseTo(0.3 / Math.sqrt(2) * 10 ** (12 / 20), 2);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.screenshot({ path: join(tmpdir(), 'kinotta-eq-sidebar.png') });
    await sound.getByLabel('EQ filter 1 enabled').click();
    await expect.poll(() => sound.getByLabel('EQ filter 1 enabled').isChecked()).toBe(false);
    await expect.poll(async () => (await server.project.mixOverload('founder-talk')).spans.length).toBe(0);
    await sound.getByLabel('EQ filter 1 enabled').click();
    await expect.poll(async () => (await server.project.mixOverload('founder-talk')).spans.length).toBeGreaterThan(0);
    await sound.getByLabel('Bypass EQ').click();
    await expect.poll(async () => (await server.project.mixOverload('founder-talk')).spans.length).toBe(0);
    await sound.getByLabel('Bypass EQ').click();
    await expect.poll(() => sound.getAttribute('data-verify-eq-bypass')).toBe('false');
    await sound.getByLabel('EQ filter 1 gain', { exact: true }).fill('6');
    await sound.getByLabel('EQ filter 1 gain', { exact: true }).press('Tab');
    await expect.poll(() => sound.getByLabel('EQ filter 1 gain', { exact: true }).inputValue()).toBe('6');
    await page.getByRole('tab', { name: /^Edits/ }).click();
    expect(await server.project.freezeEdits('founder-talk')).toEqual({ version: 2 });
    const version = await server.project.readVersion('founder-talk', 2);
    expect(version.media!.tracks![0]).toMatchObject({ eq: [{ type: 'peaking', frequency: 1000, gain: 6 }], eqBypass: false });
    expect((await server.project.readVersion('founder-talk', 1)).media!.tracks![0]).not.toHaveProperty('eq');
    const job = await server.project.whenRendered((await server.project.render({ reel: 'founder-talk', version: 2, preset: 'draft', size: 'source', fps: 30 })).id);
    expect(job.error).toBeUndefined();
    const decoded = spawnSync('ffmpeg', ['-v', 'error', '-i', join(dir, job.output!), '-map', '0:a', '-af', 'pan=mono|c0=FL', '-ar', '48000', '-f', 'f32le', '-'], { maxBuffer: 8 * 1024 * 1024 });
    expect(decoded.status, decoded.stderr.toString()).toBe(0);
    const samples = new Float32Array(decoded.stdout.buffer, decoded.stdout.byteOffset, decoded.stdout.length / 4);
    for (const at of [0.5, 2.5]) {
      const window = samples.slice(at * 48000, (at + 0.1) * 48000);
      expect(window).toHaveLength(4800);
      const rms = Math.sqrt(window.reduce((sum, n) => sum + n * n, 0) / window.length);
      expect(rms).toBeCloseTo(0.3 / Math.sqrt(2) * 10 ** (6 / 20), 2);
    }
  } finally { await browser.close(); await server.close(); }
});
