import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { expect, it } from 'vitest';
import { startServer } from '../../server/main.ts';
import { copyFixture } from '../helpers/project.ts';

const REEL = 'founder-talk';

it('retypes one use of a repeated phrase through the caption handle, leaving the other use, and saves it (S2)', { timeout: 90_000 }, async () => {
  const dir = copyFixture('footage-project');
  const reel = join(dir, 'reels', REEL);
  const generated = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=lime:s=160x90:r=30:d=2', '-c:v', 'libx264', join(dir, 'take.mp4')], { encoding: 'utf8' });
  expect(generated.status, generated.stderr).toBe(0);
  const words = [{ text: 'hello', start: 0.2, end: 0.6 }, { text: 'there', start: 0.7, end: 1.1 }];
  const plan = { title: 'Retype', duration: 4, captions: true, sections: [{ id: 'all', name: 'All', start: 0, end: 4 }], clips: [], media: { schema: 1, sources: [{ id: 'a', name: 'Take', kind: 'video', path: '../../take.mp4', duration: 2, audio: false, words }], placements: [{ id: 'first', role: 'main', source: 'a', in: 0, out: 2 }, { id: 'repeat', role: 'main', source: 'a', in: 0, out: 2 }], sequence: ['first', 'repeat'] } };
  writeFileSync(join(reel, 'plan.json'), JSON.stringify(plan));
  writeFileSync(join(reel, 'v1/plan.json'), JSON.stringify({ ...plan, media: { ...plan.media, sources: [{ ...plan.media.sources[0], path: '../../../take.mp4' }] } }));
  const built = spawnSync(process.platform === 'win32' ? 'python' : 'python3', [resolve('skill/kinotta/engine/build.py'), '--plan', join(reel, 'v1/plan.json'), join(reel, 'v1/index.html')], { encoding: 'utf8' });
  expect(built.status, built.stderr).toBe(0);
  const server = await startServer({ projectDir: dir, port: 0 });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(server.url);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Founder talk: going local-first' }).click();
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    await page.getByLabel('Playhead', { exact: true }).fill('2.3');
    const frame = page.frameLocator('iframe[title="Authored graphics"]');
    await expect.poll(() => frame.locator('[data-caption].active').getAttribute('data-placement')).toBe('repeat');

    await page.getByRole('button', { name: /press Enter to edit its text/ }).press('Enter');
    const field = page.getByLabel('Caption text', { exact: true });
    await expect.poll(() => field.inputValue()).toBe('hello there');
    await field.fill('hi friend');
    await field.press('Enter');

    await expect.poll(() => frame.locator('[data-caption][data-placement="repeat"] .caption').textContent()).toBe('hi friend');
    expect(await frame.locator('[data-caption][data-placement="first"] .caption').textContent()).toBe('hello there');
    expect((await server.project.readEditList(REEL)).operations).toEqual([expect.objectContaining({ kind: 'phrase-text', placement: 'repeat', from: 0.2, to: 1.1, text: 'hi friend', was: 'hello there' })]);

    const saved = page.waitForResponse((response) => response.url().endsWith('/save'));
    await page.getByRole('tab', { name: /^Edits/ }).click();
    await page.getByRole('button', { name: /^Save as v2/ }).click();
    expect((await saved).status()).toBe(200);
    const builtPage = readFileSync(join(reel, 'v2/index.html'), 'utf8');
    expect(builtPage).toContain('>hi<');
    expect(builtPage).toContain('>hello<');
  } finally {
    await browser.close();
    await server.close();
  }
});
