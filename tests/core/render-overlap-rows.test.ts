import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import type { Locator } from 'playwright';
import { expect, it } from 'vitest';
import { startServer } from '../../server/main.ts';
import { copyFixture } from '../helpers/project.ts';

async function separate(a: Locator, b: Locator) {
  const first = (await a.boundingBox())!;
  const second = (await b.boundingBox())!;
  expect(first.y + first.height <= second.y || second.y + second.height <= first.y).toBe(true);
}

it('separates overlapping files visually while touching clips reuse a row and sound retains its owner', { timeout: 90_000 }, async () => {
  const dir = copyFixture('footage-project');
  const made = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=lime:s=160x90:r=30:d=4', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-c:v', 'libx264', '-c:a', 'aac', join(dir, 'take.mp4')], { encoding: 'utf8' });
  expect(made.status, made.stderr).toBe(0);
  const media = (prefix: string) => ({ schema: 1, tracks: [{ id: 'speech', name: 'Speech', order: 0, gain: 1, mute: false }], sources: [{ id: 'take', name: 'Take', kind: 'video', audio: true, duration: 4, path: `${prefix}take.mp4`, words: [{ text: 'hello', start: 0.5, end: 0.52 }, { text: 'there', start: 0.55, end: 0.57 }, { text: 'later', start: 0.9, end: 1 }] }], placements: [{ id: 'main', role: 'main', source: 'take', track: 'speech', in: 0, out: 4 }, { id: 'sound', role: 'audio', source: 'take', track: 'speech', speech: true, at: 0, in: 0, out: 2 }, { id: 'next', role: 'audio', source: 'take', track: 'speech', at: 2, in: 0, out: 2 }], sequence: ['main'] });
  const plan = { duration: 4, captions: true, clips: [{ id: 'one', title: 'One', clip: 'card.html', placement: 'main', in: 0.5, out: 2, kind: 'overlay' }, { id: 'two', title: 'Two', clip: 'card.html', placement: 'main', in: 1, out: 3, kind: 'overlay' }] };
  const reel = join(dir, 'reels/founder-talk');
  writeFileSync(join(reel, 'plan.json'), JSON.stringify({ ...plan, media: media('../../') }));
  writeFileSync(join(reel, 'v1/plan.json'), JSON.stringify({ ...plan, media: media('../../../') }));
  const server = await startServer({ projectDir: dir, port: 0 });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
    await page.goto(server.url);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Founder talk: going local-first' }).click();
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    const sound = page.locator('[data-track="speech"]');
    await sound.locator('[data-placement="next"]').waitFor();
    await separate(sound.locator('[data-placement="main"]'), sound.locator('[data-placement="sound"]'));
    expect((await sound.locator('[data-placement="sound"]').boundingBox())!.y).toBe((await sound.locator('[data-placement="next"]').boundingBox())!.y);
    await separate(page.locator('[data-graphic="one"]'), page.locator('[data-graphic="two"]'));
    const captions = page.locator('[data-row="captions"] [data-caption]');
    expect(await captions.count()).toBe(2);
    await page.getByRole('button', { name: 'Open caption at 0.50', exact: true }).click();
    await separate(captions.nth(0), captions.nth(1));
    expect(await page.getByRole('button', { name: 'Mute Speech', exact: true }).count()).toBe(1);
    expect(await server.project.readEditList('founder-talk')).toMatchObject({ operations: [] });
  } finally { await browser.close(); await server.close(); }
});
