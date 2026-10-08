import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { expect, it } from 'vitest';
import { startServer } from '../../server/main.ts';
import { copyFixture } from '../helpers/project.ts';
import { inspectGraphic } from '../helpers/review-rail.ts';

const REEL = 'product-showreel';

it('keeps moving named elements in a code-only reel once it has sound in the shared mix', { timeout: 90_000 }, async () => {
  const dir = copyFixture('showreel-project');
  const tone = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', join(dir, 'sound.wav')], { encoding: 'utf8' });
  expect(tone.status, tone.stderr).toBe(0);
  const server = await startServer({ projectDir: dir, port: 0 });
  const browser = await chromium.launch();
  try {
    // v3 is the authored page with a sound placement, so Review opens the media editor for it.
    await server.project.addOperation(REEL, { kind: 'placement-add', source: { id: 'sound', kind: 'audio', path: '../../../sound.wav', duration: 2 }, placement: { id: 'sound-use', role: 'audio', source: 'sound', at: 0, in: 0, out: 2 } });
    expect(await server.project.saveEdits(REEL)).toEqual({ version: 3 });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(server.url);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: /Product showreel/ }).click();
    await page.getByRole('navigation', { name: 'Phase' }).getByRole('button', { name: 'Review' }).click();
    await page.locator('[data-verify-unit="MediaEditor"]').waitFor();
    const frame = page.frameLocator('iframe[title="Authored graphics"]');
    const start = Number(await frame.locator('[data-scene="cube-lands"]').getAttribute('data-start'));
    await page.getByLabel('Playhead', { exact: true }).fill(String(start + 0.5));
    const cube = frame.locator('[data-scene="cube-lands"] [data-el="cube"]');
    await expect.poll(async () => (await cube.boundingBox())?.width ?? 0).toBeGreaterThan(0);
    const box = (await cube.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await server.project.readEditList(REEL)).operations).toEqual([expect.objectContaining({ kind: 'element-offset', clip: 'cube-lands', element: 'cube' })]);
  } finally {
    await browser.close();
    await server.close();
  }
});

it('reattaches a graphic to the pass of a looping voice under the playhead (A2)', { timeout: 90_000 }, async () => {
  const dir = copyFixture('footage-project');
  const reel = join('reels', 'founder-talk');
  for (const [args, file] of [
    [['-f', 'lavfi', '-i', 'color=c=lime:s=160x90:r=30:d=6', '-c:v', 'libx264'], 'take.mp4'],
    [['-f', 'lavfi', '-i', 'sine=frequency=440:duration=2'], 'voice.wav'],
  ] as const) {
    const run = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args, join(dir, file)], { encoding: 'utf8' });
    expect(run.status, run.stderr).toBe(0);
  }
  const plan = (root: string) => ({
    title: 'Loop', duration: 6, sections: [{ id: 'all', name: 'All', start: 0, end: 6 }],
    clips: [{ id: '01', title: 'Card', clip: 'card.html', kind: 'full', placement: 'voice', in: 0.5, out: 1.5 }],
    media: { schema: 1, sources: [{ id: 'a', kind: 'video', path: `${root}take.mp4`, duration: 6, audio: false, words: [] }, { id: 'v', name: 'Voice', kind: 'audio', path: `${root}voice.wav`, duration: 2, words: [{ text: 'again', start: 0.5, end: 1 }] }],
      placements: [{ id: 'take', role: 'main', source: 'a', in: 0, out: 6 }, { id: 'voice', role: 'audio', source: 'v', at: 1, in: 0, out: 2, duration: 5, loop: true, speech: true }], sequence: ['take'] },
  });
  writeFileSync(join(dir, reel, 'plan.json'), JSON.stringify(plan('../../')));
  writeFileSync(join(dir, reel, 'v1/plan.json'), JSON.stringify(plan('../../../')));
  writeFileSync(join(dir, reel, 'v1/shots.json'), JSON.stringify({ contract: 1, duration: 6, sections: [{ id: 'all', name: 'All', start: 0, end: 6 }], shots: [] }));
  writeFileSync(join(dir, reel, 'v1/index.html'), '<!doctype html><html class="alpha"><script>window.DURATION=6;window.seek=()=>{};</script>');
  const server = await startServer({ projectDir: dir, port: 0 });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(server.url);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Founder talk: going local-first' }).click();
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    const graphics = await inspectGraphic(page);
    await graphics.getByText(/attachment is missing or interrupted/).waitFor();
    // The second pass of the loop runs from 3 s; 3.5 s is 0.5 s into the voice.
    await page.getByLabel('Playhead', { exact: true }).fill('3.5');
    await graphics.getByRole('button', { name: 'Attach to Voice (pass 2) at playhead' }).click();
    await expect.poll(async () => (await server.project.readEditList('founder-talk')).operations).toEqual([expect.objectContaining({ kind: 'clip-attachment', clip: '01', placement: 'voice', in: 0.5, out: 1.5, cycle: 1 })]);
    await expect.poll(() => graphics.getByText(/attachment is missing or interrupted/).count()).toBe(0);
    await graphics.getByText('Card · 3.50–4.50s').waitFor();
  } finally {
    await browser.close();
    await server.close();
  }
});
