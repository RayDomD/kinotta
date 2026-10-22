import { browserHarness } from './browser.ts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { syncPicture } from '../../web/src/review/_internal/PictureLayers.tsx';

function picture(time: number, paused = false) {
  let current = time;
  const writes: number[] = [];
  const element = {
    get currentTime() { return current; },
    set currentTime(value: number) { writes.push(value); current = value; },
    paused, playbackRate: 1,
    pause() { this.paused = true; },
  };
  return { element: element as HTMLVideoElement, writes };
}

afterEach(() => vi.useRealTimers());

describe('picture sync', () => {
  it('pulls a late picture forward without seeking', () => {
    const { element, writes } = picture(4);
    expect(syncPicture(element, 4.04, true, true)).toBe(false);
    expect(element.playbackRate).toBeCloseTo(1.08);
    expect(writes).toEqual([]);
  });

  it('slows an early picture without seeking and clamps both directions', () => {
    const early = picture(4.2);
    syncPicture(early.element, 4, true, true);
    expect(early.element.playbackRate).toBeCloseTo(0.9);
    expect(early.writes).toEqual([]);
    const late = picture(4);
    syncPicture(late.element, 4.2, true, true);
    expect(late.element.playbackRate).toBeCloseTo(1.1);
    expect(late.writes).toEqual([]);
  });

  it('returns to normal speed within one frame', () => {
    const { element, writes } = picture(4);
    element.playbackRate = 1.1;
    syncPicture(element, 4.01, true, true);
    expect(element.playbackRate).toBe(1);
    expect(writes).toEqual([]);
  });

  it('seeks large drift and resets the rate', () => {
    const { element, writes } = picture(4);
    element.playbackRate = 1.1;
    expect(syncPicture(element, 4.3, true, true)).toBe(true);
    expect(writes).toEqual([4.3]);
    expect(element.playbackRate).toBe(1);
  });

  it('keeps paused scrubbing on the requested frame', () => {
    const { element, writes } = picture(4);
    element.playbackRate = 0.9;
    expect(syncPicture(element, 4.02, false, true)).toBe(true);
    expect(writes).toEqual([4.02]);
    expect(element.paused).toBe(true);
    expect(element.playbackRate).toBe(1);
  });

  it('preserves the start/resume seek and leaves a parked frame alone', () => {
    const { element, writes } = picture(4, true);
    expect(syncPicture(element, 4.04, true, false)).toBe(true);
    expect(writes).toEqual([4.04]);
    expect(syncPicture(element, 4.05, true, false)).toBe(false);
    expect(writes).toEqual([4.04]);
  });

  it('does not seek again while a playing decoder is not ready', () => {
    const { element, writes } = picture(4);
    element.playbackRate = 1.1;
    expect(syncPicture(element, 5, true, false)).toBe(false);
    expect(writes).toEqual([]);
    expect(element.playbackRate).toBe(1);
  });
});


describe('decoded picture readiness', () => {
  it('is ready before play and stays ready after pause and paused seeking', async () => {
    const { page, close } = await browserHarness();
    try {
      await page.evaluate(() => (window as any).mountPicture());
      await page.waitForFunction(() => document.querySelector('video')!.readyState >= 2);
      expect(await page.locator('[data-verify-unit="PictureLayer"]').getAttribute('data-verify-ready')).toBe('true');
      await page.evaluate(() => (window as any).mountPicture({ playing: true }));
      await page.waitForFunction(() => !document.querySelector('video')!.paused);
      await page.evaluate(() => (window as any).mountPicture({ playing: false, time: 2 }));
      await page.waitForFunction(() => !document.querySelector('video')!.seeking && document.querySelector('video')!.currentTime > 1.9);
      expect(await page.locator('[data-verify-unit="PictureLayer"]').getAttribute('data-verify-ready')).toBe('true');
    } finally { await close(); }
  }, 30_000);
});

it('keeps the previous decoded picture visible until the next source decodes', async () => {
  const { page, close } = await browserHarness();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  try {
    await page.route('**/*next-picture*', async (route) => { await gate; await route.continue(); });
    await page.evaluate(() => (window as any).mountPicture());
    await page.waitForFunction(() => document.querySelector('video')!.readyState >= 2);
    await page.evaluate(() => (window as any).mountPicture({
      pictures: [{ id: 'next', role: 'main', source: 'next', in: 0, out: 8.8, at: 0, duration: 8.8 }],
      sources: [{ id: 'fixture', kind: 'video', path: '', duration: 8.8 }, { id: 'next', kind: 'video', path: '', duration: 8.8 }],
      sourceUrl: (id: string) => '/tests/fixtures/playback-stutter-4k50.mp4' + (id === 'next' ? '?next-picture' : ''),
    }));
    await page.waitForFunction(() => !!document.querySelector('[data-verify-id="next"]'));
    expect(await page.locator('[data-verify-id="take"]').isVisible()).toBe(true);
    expect(await page.locator('[data-verify-id="next"]').isVisible()).toBe(false);
    release();
    await page.waitForFunction(() => document.querySelector('[data-verify-id="next"]')?.getAttribute('data-verify-ready') === 'true');
    expect(await page.locator('[data-verify-id="next"]').isVisible()).toBe(true);
  } finally { release(); await close(); }
}, 30_000);
