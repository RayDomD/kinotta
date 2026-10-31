// Plan: docs/plans/2026-10-31-stressed-word-captions.md, step 6: set a caption word apart from the Simple timeline.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { expect, it } from 'vitest';
import { startServer } from '../../server/main.ts';
import { copyFixture } from '../helpers/project.ts';

it('sets a caption word apart and back from the Simple timeline, shown at once in the frame', { timeout: 90_000 }, async () => {
  const dir = copyFixture('footage-project');
  const generated = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=lime:s=160x90:r=30:d=4', '-c:v', 'libx264', join(dir, 'take.mp4')], { encoding: 'utf8' });
  expect(generated.status, generated.stderr).toBe(0);
  const reel = join(dir, 'reels/founder-talk');
  const media = (prefix: string) => ({
    schema: 1,
    sources: [{ id: 'take', name: 'Take', kind: 'video', duration: 4, audio: false, path: `${prefix}take.mp4`, words: [{ text: 'hello', start: 0.5, end: 0.9 }, { text: 'world', start: 1.2, end: 1.8 }] }],
    placements: [{ id: 'first', role: 'main', source: 'take', in: 0, out: 4 }],
    sequence: ['first'],
  });
  const plan = { title: 'Founder talk', duration: 4, captions: true, sections: [{ id: 'all', name: 'All', start: 0, end: 4 }], clips: [] };
  writeFileSync(join(reel, 'plan.json'), JSON.stringify({ ...plan, media: media('../../') }));
  writeFileSync(join(reel, 'v1/plan.json'), JSON.stringify({ ...plan, media: media('../../../') }));

  const server = await startServer({ projectDir: dir, port: 0 });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.addInitScript(() => {
      localStorage.setItem('kinotta-simple-profile-v1', JSON.stringify({ name: 'Alex', handle: '@alex', makes: 'Vlogs', language: 'English', destination: 'TikTok', finish: 'MP4', music: 'No music' }));
    });
    await page.goto(`${server.url}/#founder-talk`);
    const lane = page.getByRole('region', { name: 'Simple timeline' }).locator('[data-lane="captions"]');
    await lane.getByRole('button', { name: 'Open caption at 0.50', exact: true }).click({ timeout: 30_000 });

    const setApart = lane.getByRole('button', { name: 'Set apart: word world at 1.20 in first', exact: true });
    expect(await setApart.getAttribute('aria-pressed')).toBe('false');
    await setApart.click();
    await expect.poll(async () => (await server.project.readEditList('founder-talk')).operations.at(-1), { timeout: 10_000 })
      .toMatchObject({ kind: 'word-emphasis', placement: 'first', at: 1.2, on: true, was: 'world' });

    const putBack = lane.getByRole('button', { name: 'Put back in line: word world at 1.20 in first', exact: true });
    await putBack.waitFor();
    expect(await putBack.getAttribute('aria-pressed')).toBe('true');
    // The frame's caption marks the word straight away, with the style it needs.
    const frame = page.frameLocator('iframe[title="Authored graphics"]');
    await expect.poll(async () => frame.locator('[data-kind="key"]').allTextContents(), { timeout: 10_000 }).toEqual(['world']);
    expect(await frame.locator('#kinotta-caption-key').count()).toBe(1);

    await putBack.click();
    await expect.poll(async () => (await server.project.readEditList('founder-talk')).operations.at(-1), { timeout: 10_000 })
      .toMatchObject({ kind: 'word-emphasis', at: 1.2, on: false });
    await expect.poll(async () => frame.locator('[data-kind="key"]').count(), { timeout: 10_000 }).toBe(0);
  } finally {
    await browser.close();
    await server.close();
  }
});
