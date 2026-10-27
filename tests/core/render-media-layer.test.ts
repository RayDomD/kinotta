import { openDetailedEditor } from '../helpers/review-rail.ts';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { expect, it } from 'vitest';
import { startServer } from '../../server/main.ts';
import { copyFixture } from '../helpers/project.ts';

it('brings an insert picture to front, sends it back, undoes it and saves the same drawing order', { timeout: 90_000 }, async () => {
  const dir = copyFixture('footage-project');
  for (const color of ['red', 'green']) {
    const generated = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${color}:s=160x90`, '-frames:v', '1', join(dir, `${color}.png`)], { encoding: 'utf8' });
    expect(generated.status, generated.stderr).toBe(0);
  }
  const reel = join(dir, 'reels/founder-talk');
  const media = (prefix: string) => ({ schema: 1, sources: ['red', 'green'].map((color) => ({ id: color, name: color, kind: 'image', duration: 0, path: `${prefix}${color}.png` })), placements: [{ id: 'gap', role: 'gap', duration: 3 }, ...['red', 'green'].map((color) => ({ id: color, role: 'insert', source: color, in: 0, out: 0, at: 0, duration: 3 }))], sequence: ['gap'] });
  writeFileSync(join(reel, 'plan.json'), JSON.stringify({ duration: 3, clips: [], media: media('../../') }));
  writeFileSync(join(reel, 'v1/plan.json'), JSON.stringify({ duration: 3, clips: [], media: media('../../../') }));
  const server = await startServer({ projectDir: dir, port: 0 });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await openDetailedEditor(page, server.url);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Founder talk: going local-first' }).click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    // Keep edits in flight long enough to catch waits that only check picture presence.
    await page.route('**/edits', async (route) => {
      if (route.request().method() === 'POST') await new Promise((resolve) => setTimeout(resolve, 200));
      await route.continue();
    });
    const frame = page.locator('.rv-frame');
    await frame.locator('[data-verify-unit="PictureLayer"]').first().waitFor();
    // Upcoming layers share this class but must not participate in visible drawing-order checks.
    await frame.evaluate((root) => {
      const upcoming = document.createElement('div');
      upcoming.className = 'mv-picture-layer';
      upcoming.dataset.verifyUnit = 'UpcomingPictureLayer';
      upcoming.dataset.verifyId = 'upcoming';
      upcoming.hidden = true;
      root.append(upcoming);
    });
    const front = () => frame.locator('[data-verify-unit="PictureLayer"]').last().getAttribute('data-verify-id');
    await expect.poll(front).toBe('green');
    // The picture paints before the edit journal is ready to accept keyboard selection.
    await expect.poll(() => page.getByRole('toolbar', { name: 'Timeline tools' }).getByRole('button', { name: 'Select', exact: true }).isEnabled()).toBe(true);
    // Keyboard selection also reaches a bar covered by an overlapping insert.
    await page.getByRole('region', { name: 'Media timeline' }).getByRole('button', { name: /^red, insert,/ }).press('Enter');
    const clip = page.getByRole('region', { name: 'Clip settings' });
    await clip.getByRole('button', { name: 'Bring to front', exact: true }).click();
    await expect.poll(front).toBe('red');
    await clip.getByRole('button', { name: 'Send to back', exact: true }).click();
    await expect.poll(front).toBe('green');
    await page.getByRole('toolbar', { name: 'Timeline tools' }).getByRole('button', { name: 'Select', exact: true }).focus();
    await page.keyboard.press('Control+z');
    await expect.poll(front).toBe('red');
    await page.getByRole('tab', { name: /^Edits/ }).click();
    expect(await server.project.freezeEdits('founder-talk')).toEqual({ version: 2 });
    await expect.poll(async () => (await server.project.readVersion('founder-talk', 2)).media?.placements.at(-1)?.id).toBe('red');
    await expect.poll(front).toBe('red');
    const job = await server.project.whenRendered((await server.project.render({ reel: 'founder-talk', version: 2, preset: 'draft', size: 'source', fps: 30 })).id);
    expect(job.error).toBeUndefined();
    const decoded = spawnSync('ffmpeg', ['-v', 'error', '-i', join(dir, job.output!), '-vf', 'scale=1:1', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
    expect(decoded.status, decoded.stderr.toString()).toBe(0);
    expect(decoded.stdout[0]).toBeGreaterThan(240);
    expect(decoded.stdout[1]).toBeLessThan(10);
    expect(decoded.stdout[2]).toBeLessThan(10);
  } finally { await browser.close(); await server.close(); }
});
