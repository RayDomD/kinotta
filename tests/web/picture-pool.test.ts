import { expect, it } from 'vitest';
import { browserHarness } from './browser.ts';

it('reuses the source video through a same-file cut and reorder, and preloads another source', async () => {
  const { page, close } = await browserHarness();
  try {
    await page.evaluate(() => (window as any).mountPicture({ upcoming: [
      { id: 'second', role: 'main', source: 'fixture', in: 4, out: 8.8, at: 4, duration: 4.8 },
    ] }));
    await page.waitForFunction(() => document.querySelector('video')!.readyState >= 2);
    expect(await page.locator('video').count()).toBe(1);
    await page.evaluate(() => { (window as any).originalVideo = document.querySelector('video'); });
    for (const [id, start] of [['second', 4], ['take', 0]] as const) {
      await page.evaluate(({ id, start }) => (window as any).mountPicture({ time: 4,
        pictures: [{ id, role: 'main', source: 'fixture', in: start, out: start + 4, at: 4, duration: 4 }],
      }), { id, start });
      await expect.poll(() => page.locator('[data-verify-unit="PictureLayer"]').getAttribute('data-verify-id')).toBe(id);
      expect(await page.evaluate(() => document.querySelector('video') === (window as any).originalVideo)).toBe(true);
      expect(await page.locator('video').count()).toBe(1);
    }
    await page.evaluate(() => (window as any).mountPicture({
      upcoming: [{ id: 'next', role: 'main', source: 'other', in: 2, out: 4, at: 2, duration: 2 }],
      sources: [{ id: 'fixture', kind: 'video', path: '', duration: 8.8 }, { id: 'other', kind: 'video', path: '', duration: 8.8 }],
    }));
    await page.waitForFunction(() => document.querySelector('[data-verify-id="next"] video')?.getAttribute('preload') === 'auto');
    await expect.poll(() => page.locator('[data-verify-id="next"]').getAttribute('data-verify-ready')).toBe('true');
    expect(await page.locator('[data-verify-id="next"]').isVisible()).toBe(false);
  } finally { await close(); }
}, 30_000);

it('adds an independent decoder only during simultaneous uses and releases it afterwards', async () => {
  const { page, close } = await browserHarness();
  try {
    await page.evaluate(() => (window as any).mountPicture({ pictures: [
      { id: 'take', role: 'main', source: 'fixture', in: 0, out: 3, at: 0, duration: 3 },
      { id: 'inset', role: 'insert', source: 'fixture', in: 4, out: 7, at: 0, duration: 3 },
    ], time: 1 }));
    await expect.poll(() => page.locator('video').count()).toBe(2);
    await page.waitForFunction(() => [...document.querySelectorAll('video')].every((video) => video.readyState >= 2 && !video.seeking));
    expect(await page.locator('[data-verify-id="take"] video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeCloseTo(1, 1);
    expect(await page.locator('[data-verify-id="inset"] video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeCloseTo(5, 1);
    await page.evaluate(() => (window as any).mountPicture({ time: 2 }));
    await expect.poll(() => page.locator('video').count()).toBe(1);
  } finally { await close(); }
}, 30_000);
