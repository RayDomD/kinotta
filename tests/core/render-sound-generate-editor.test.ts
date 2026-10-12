import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect as browserExpect } from 'playwright/test';
import { expect, it } from 'vitest';
import { startServer } from '../../server/main.ts';
import { invariants } from '../../web/src/review/_internal/SoundGenerate.verify.ts';
import { copyFixture } from '../helpers/project.ts';

it('generates in the Sound tab with nothing selected, can cancel, and adds the result on the Music track', { timeout: 120_000 }, async () => {
  const dir = copyFixture('footage-project');
  const made = join(dir, 'made.wav');
  const bed = join(dir, 'bed.wav');
  for (const [file, level, seconds] of [[made, 0.1, 3], [bed, 0.2, 4]] as const) {
    const run = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `aevalsrc=${level}:s=48000:d=${seconds}`, file], { encoding: 'utf8' });
    expect(run.status, run.stderr).toBe(0);
  }
  const reel = join(dir, 'reels/founder-talk');
  const media = (prefix: string) => ({ schema: 1, tracks: [{ id: 'music', name: 'Music', order: 0, gain: 1, mute: false }], sources: [{ id: 'bed', name: 'bed.wav', kind: 'audio', path: `${prefix}bed.wav`, duration: 4 }], placements: [{ id: 'song', role: 'audio', source: 'bed', track: 'music', at: 0, in: 0, out: 4 }], sequence: [] });
  writeFileSync(join(reel, 'plan.json'), JSON.stringify({ duration: 4, clips: [], media: media('../../') }));
  writeFileSync(join(reel, 'v1/plan.json'), JSON.stringify({ duration: 4, clips: [], media: media('../../../') }));
  const server = await startServer({ projectDir: dir, port: 0 });
  const entry = await (await fetch(`${server.url}/api/media?name=generated-test.wav`, { method: 'POST', body: readFileSync(made) })).json();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const requests: unknown[] = [];
    await page.route('**/api/media/generate', async (route) => {
      requests.push(route.request().postDataJSON());
      await gate;
      // The cancelled first request is already gone by the time the gate opens.
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...entry, prompt: 'Warm synth bed', seconds: 3, seed: 42 }) }).catch(() => {});
    });
    await page.goto(server.url);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Founder talk: going local-first' }).click();
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    await page.getByRole('tab', { name: 'Sound', exact: true }).click();
    const panel = page.getByRole('group', { name: 'Generate sound' });
    const verify = async () => { for (const invariant of invariants) expect(await panel.evaluate(invariant.check), invariant.description).toBe(true); };
    await expect.poll(() => panel.getAttribute('data-verify-status')).toBe('idle');
    await expect.poll(() => panel.getAttribute('data-verify-installed')).not.toBe('unknown');
    await verify();
    await browserExpect(panel.getByRole('button', { name: 'Generate', exact: true })).toBeDisabled();
    await panel.getByLabel('Sound prompt').fill('Warm synth bed');
    await panel.getByLabel('Sound length in seconds').fill('3');
    await panel.getByLabel('Sound seed').fill('42');
    if (await panel.getAttribute('data-verify-installed') === 'false') {
      // Without the model packages the panel says so and cannot start. The rest needs them.
      await verify();
      expect(await panel.getAttribute('data-verify-can-generate')).toBe('false');
      return;
    }
    await verify();
    await page.screenshot({ path: join(tmpdir(), 'kinotta-sound-generate.png') });
    await panel.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect.poll(() => panel.getAttribute('data-verify-status')).toBe('running');
    expect(requests).toEqual([{ prompt: 'Warm synth bed', seconds: 3, seed: 42 }]);
    await verify();
    await panel.getByRole('button', { name: 'Cancel' }).click();
    await expect.poll(() => panel.getAttribute('data-verify-status')).toBe('idle');
    await verify();
    await panel.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect.poll(() => panel.getAttribute('data-verify-status')).toBe('running');
    release();
    await expect.poll(() => panel.getAttribute('data-verify-status')).toBe('ready');
    await verify();
    await browserExpect(panel.getByText('seed 42')).toBeVisible();
    await panel.getByRole('button', { name: 'Add on Music at playhead' }).click();
    await browserExpect(page.getByRole('region', { name: 'Media timeline' }).getByRole('button', { name: /^generated-test.wav, audio,/ })).toBeVisible();
    await expect.poll(() => panel.getAttribute('data-verify-status')).toBe('idle');
    await verify();
  } finally {
    await browser.close();
    await server.close();
  }
});
