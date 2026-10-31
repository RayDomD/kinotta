// Plan: docs/plans/2026-10-31-keep-manual-fixes.md. A word transcribed since the newest version is fixed in the Simple
// timeline: the editor shows the cached words, and the core used to refuse the fix ("There is no word that starts there").
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { expect, it } from 'vitest';
import { startServer } from '../../server/main.ts';
import { copyFixture } from '../helpers/project.ts';

it('fixes a freshly transcribed word in the Simple timeline and saves it', { timeout: 90_000 }, async () => {
  const dir = copyFixture('footage-project');
  const generated = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=lime:s=160x90:r=30:d=4', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4',
    '-c:v', 'libx264', '-c:a', 'aac', '-shortest', join(dir, 'take.mp4')], { encoding: 'utf8' });
  expect(generated.status, generated.stderr).toBe(0);

  const reel = join(dir, 'reels/founder-talk');
  // No words in the plan: they come from the transcriber once the editor asks for them.
  const media = (prefix: string) => ({
    schema: 1,
    sources: [{ id: 'take', name: 'Take', kind: 'video', duration: 4, path: `${prefix}take.mp4` }],
    placements: [{ id: 'first', role: 'main', source: 'take', in: 0, out: 4 }],
    sequence: ['first'],
  });
  const plan = { title: 'Founder talk', duration: 4, captions: true, sections: [{ id: 'all', name: 'All', start: 0, end: 4 }], clips: [] };
  writeFileSync(join(reel, 'plan.json'), JSON.stringify({ ...plan, media: media('../../') }));
  writeFileSync(join(reel, 'v1/plan.json'), JSON.stringify({ ...plan, media: media('../../../') }));

  const server = await startServer({ projectDir: dir, port: 0, transcriber: async () => [{ text: 'hello', start: 0.5, end: 0.9 }, { text: 'world', start: 1.2, end: 1.8 }] });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.addInitScript(() => {
      localStorage.setItem('kinotta-simple-profile-v1', JSON.stringify({ name: 'Alex', handle: '@alex', makes: 'Vlogs', language: 'English', destination: 'TikTok', finish: 'MP4', music: 'No music' }));
    });
    await page.goto(`${server.url}/#founder-talk`);
    const captionsLane = page.getByRole('region', { name: 'Simple timeline' }).locator('[data-lane="captions"]');

    await captionsLane.getByRole('button', { name: 'Open caption at 0.50', exact: true }).click({ timeout: 30_000 });
    await captionsLane.getByRole('button', { name: 'Edit word hello at 0.50 in first', exact: true }).click();
    const input = captionsLane.getByLabel('Word at 0.50 in first', { exact: true });
    await input.fill('howdy');
    await input.press('Enter');

    await expect.poll(async () => (await server.project.readEditList('founder-talk')).operations.at(-1), { timeout: 10_000 })
      .toMatchObject({ kind: 'word-text', placement: 'first', at: 0.5, text: 'howdy' });
    expect(await page.getByRole('alert').count()).toBe(0);

    await server.project.freezeEdits('founder-talk');
    expect((await server.project.readVersion('founder-talk', 2)).transcript?.map((w) => w.text)).toEqual(['howdy', 'world']);
  } finally {
    await browser.close();
    await server.close();
  }
});
