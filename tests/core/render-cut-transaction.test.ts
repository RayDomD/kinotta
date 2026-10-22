import { chromium } from 'playwright';
import { expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startServer } from '../../server/main.ts';
import { copyFixture } from '../helpers/project.ts';
import { openDetailedEditor } from '../helpers/review-rail.ts';

for (const mode of ['accepted-playing', 'refused-playing', 'refused-paused'] as const) {
  it(`a cut is a playback and viewport transaction: ${mode}`, { timeout: 60_000 }, async () => {
    const dir = copyFixture('footage-project');
    const generated = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=lime:s=160x90:r=30:d=4', '-c:v', 'libx264', join(dir, 'take.mp4')], { encoding: 'utf8' });
    expect(generated.status, generated.stderr).toBe(0);
    const media = (prefix: string) => ({ schema: 1, sources: [{ id: 'take', kind: 'video', audio: false, duration: 4, path: `${prefix}take.mp4` }],
      placements: ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'].map((id) => ({ id, role: 'main', source: 'take', in: 0, out: 4 })), sequence: ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'] });
    const reel = join(dir, 'reels/founder-talk');
    writeFileSync(join(reel, 'plan.json'), JSON.stringify({ duration: 24, clips: [], media: media('../../') }));
    writeFileSync(join(reel, 'v1/plan.json'), JSON.stringify({ duration: 24, clips: [], media: media('../../../') }));
    const server = await startServer({ projectDir: dir, port: 0 });
    const browser = await chromium.launch();
    let release = () => {};
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      await openDetailedEditor(page, server.url);
      await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Founder talk: going local-first' }).click();
      await page.getByRole('button', { name: 'Review', exact: true }).click();
      const editor = page.locator('[data-verify-unit="MediaEditor"]');
      const lanes = page.locator('[data-verify-unit="NativeLanes"]');
      await expect.poll(() => page.getByRole('button', { name: 'Add track', exact: true }).isEnabled()).toBe(true);
      await expect.poll(() => editor.getAttribute('data-verify-loading')).toBe('false');
      await page.getByRole('button', { name: 'Zoom in timeline', exact: true }).click();
      await page.getByRole('button', { name: 'Zoom in timeline', exact: true }).click();
      await page.getByLabel('Pan timeline', { exact: true }).fill('9');
      await page.getByLabel('Playhead', { exact: true }).fill('10');
      await lanes.locator('[data-placement="first"]').press('Enter');
      const playing = mode !== 'refused-paused';
      if (playing) await page.getByRole('button', { name: 'Play', exact: true }).click();
      await expect.poll(() => editor.getAttribute('data-verify-playing')).toBe(String(playing));
      const before = { start: await lanes.getAttribute('data-verify-window-start'), length: await lanes.getAttribute('data-verify-window-length'),
        time: Number(await editor.getAttribute('data-verify-clock')) };
      const gate = new Promise<void>((resolve) => { release = resolve; });
      let requested = false;
      await page.route('**/api/reels/founder-talk/edits', async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        requested = true;
        await gate;
        if (mode === 'accepted-playing') await route.continue();
        else await route.fulfill({ status: 409, json: { error: 'This cut was refused.' } });
      });
      const reply = page.waitForResponse((response) => response.url().endsWith('/edits') && response.request().method() === 'POST');
      await page.getByRole('toolbar', { name: 'Timeline tools' }).getByRole('button', { name: 'Select', exact: true }).focus();
      await page.keyboard.press('Delete');
      await expect.poll(() => requested).toBe(true);
      await expect.poll(() => lanes.getAttribute('data-verify-window-start')).toBe('5');
      await expect.poll(() => editor.getAttribute('data-verify-playing')).toBe(String(playing));
      release();
      await reply;
      await expect.poll(() => page.getByRole('button', { name: 'Add track', exact: true }).isEnabled(), { timeout: 10_000 }).toBe(true);
      if (mode === 'accepted-playing') {
        await expect.poll(() => editor.getAttribute('data-verify-playing')).toBe('true');
        expect(Number(await editor.getAttribute('data-verify-clock'))).toBeGreaterThan(before.time - 4);
        expect((await server.project.readEditList('founder-talk')).operations).toHaveLength(1);
      } else {
        await expect.poll(() => lanes.getAttribute('data-verify-window-start')).toBe(before.start);
        expect(await lanes.getAttribute('data-verify-window-length')).toBe(before.length);
        const restored = Number(await editor.getAttribute('data-verify-clock'));
        expect(Math.abs(restored - before.time)).toBeLessThan(0.5);
        expect(await editor.getAttribute('data-verify-playing')).toBe(String(playing));
        expect((await server.project.readEditList('founder-talk')).operations).toEqual([]);
        await expect.poll(() => page.getByRole('alert').filter({ hasText: 'This cut was refused.' }).count()).toBeGreaterThan(0);
      }
    } finally { release(); await browser.close(); await server.close(); }
  });
}
