import { cpSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { composePlan, makeFootage } from '../helpers/engine.ts';

let browser: Browser;
beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
afterAll(async () => { await browser?.close(); });

function compose(plan: object): string {
  const dir = mkdtempSync(join(tmpdir(), 'kinotta-templates-'));
  writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan));
  const output = join(dir, 'page.html');
  composePlan(join(dir, 'plan.json'), output);
  return output;
}

describe('effect templates on the footage timeline', () => {
  it('awaits embedded template video seeks before returning a first or backward still', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kinotta-template-video-'));
    cpSync(resolve('skill/kinotta/templates/effects/floating-cards/r1'), join(dir, 'shot'), { recursive: true });
    makeFootage(join(dir, 'shot/assets/clip.mp4'), 2);
    const html = readFileSync(join(dir, 'shot/shot.html'), 'utf8')
      .replace(/<img src="assets\/clip-1.svg" alt="">/, '<video src="assets/clip.mp4" muted preload="metadata"></video>');
    writeFileSync(join(dir, 'shot/shot.html'), html);
    const file = compose({ clips: [{ id: '01', template: 'floating-cards', clip: join(dir, 'shot'), in: 0, out: 4 }] });
    const page = await browser.newPage();
    try {
      await page.goto(pathToFileURL(file).href, { waitUntil: 'domcontentloaded' });
      for (const t of [1.3, 0.2, 1.3, 3.9]) {
        const video = await page.evaluate(async t => {
          await (window as unknown as { seek(t: number): unknown }).seek(t);
          const video = document.querySelector('video')!;
          return { time: video.currentTime, seeking: video.seeking, ready: video.readyState, paused: video.paused };
        }, t);
        expect(video.time).toBeCloseTo(Math.min(t, 2), 2);
        expect(video.seeking).toBe(false);
        expect(video.ready).toBeGreaterThanOrEqual(2);
        expect(video.paused).toBe(true);
      }
    } finally { await page.close(); }
  });
  it('maps source fill times across snips and drops an item spoken in removed footage', async () => {
    const file = compose({ pieces: [{ in: 10, out: 12 }, { in: 14, out: 19 }], clips: [
      { id: '01', template: 'chip-tally', in: 11, out: 18, fill: { chips: [
        { text: 'First', at: 11.5 }, { text: 'Snipped', at: 13 }, { text: 'After cut', at: 15 },
      ] } },
    ] });
    const page = await browser.newPage();
    try {
      await page.goto(pathToFileURL(file).href);
      expect(await page.locator('.chip').allTextContents()).toEqual(['First', 'After cut']);
      expect(await page.locator('.chip').evaluateAll(els => els.map(el => el.getAttribute('data-at')))).toEqual(['0.5', '2.0']);
      await page.evaluate(() => (window as unknown as { seek(t: number): void }).seek(3.1));
      expect(await page.locator('.chip:visible').count()).toBe(2);
    } finally { await page.close(); }
  });

  it('keeps a named scalar element hidden when its source moment was snipped', async () => {
    const file = compose({ pieces: [{ in: 0, out: 1 }, { in: 2, out: 5 }], clips: [
      { id: '01', template: 'annotate', in: 0, out: 5, fill: { 'label-keep': { text: 'Snipped label', at: 1.5 } } },
    ] });
    const page = await browser.newPage();
    try {
      await page.goto(pathToFileURL(file).href);
      await page.evaluate(async () => { await (window as unknown as { seek(t: number): unknown }).seek(2); });
      expect(await page.locator('[data-el="label-keep"]').evaluate(el => getComputedStyle(el).opacity)).toBe('0');
    } finally { await page.close(); }
  });

  it('loads brand fonts for the first still, embeds bytes and applies tokens and curves once', async () => {
    const file = compose({ brand: {
      fonts: [{ family: 'Test Brand', weight: '100 900', file: resolve('skill/kinotta/engine/fonts/Geist-Variable.woff2') }],
      curves: { rise: [0, 0, 1, 1], state: [0, 0, 1, 1], sink: [0, 0, 1, 1] },
      tokens: { 'fx-font': '"Test Brand"', 'fx-accent': 'rgb(10, 20, 30)' },
    }, clips: [{ id: '01', template: 'chip-tally', in: 0, out: 5 }] });
    const page = await browser.newPage();
    try {
      await page.goto(pathToFileURL(file).href);
      const first = await page.evaluate(async () => {
        await (window as unknown as { seek(t: number): unknown }).seek(0.55);
        const chip = document.querySelector('.chip')!;
        const type = document.createElement('span');
        type.className = 'type-body';
        document.body.append(type);
        return { loaded: document.fonts.check('600 30px "Test Brand"'), family: getComputedStyle(chip).fontFamily,
          typeFamily: getComputedStyle(type).fontFamily,
          opacity: Number((chip as HTMLElement).style.opacity), accent: getComputedStyle(chip.querySelector('.tick')!).stroke };
      });
      expect(first.loaded).toBe(true);
      expect(first.family).toContain('Test Brand');
      expect(first.typeFamily).toContain('Test Brand');
      expect(first.opacity).toBeCloseTo(0.5, 4);
      expect(first.accent).toBe('rgb(10, 20, 30)');
      expect(readFileSync(file, 'utf8').match(/Effect tokens\./g)).toHaveLength(1);
      expect(readFileSync(file, 'utf8')).not.toContain('Geist-Variable.woff2');
    } finally { await page.close(); }
  });

  it('composes every template without a plate, requires a matte and supports an edited shot folder', async () => {
    const effects = resolve('skill/kinotta/templates/effects');
    const dir = mkdtempSync(join(tmpdir(), 'kinotta-edited-template-'));
    cpSync(join(effects, 'section-tag/r1'), join(dir, 'custom'), { recursive: true });
    writeFileSync(join(dir, 'custom/shot.html'), readFileSync(join(dir, 'custom/shot.html'), 'utf8').replace(/section-tag/g, 'renamed-shot'));
    writeFileSync(join(dir, 'custom/shot.css'), readFileSync(join(dir, 'custom/shot.css'), 'utf8').replace(/section-tag/g, 'renamed-shot'));
    writeFileSync(join(dir, 'custom/shot.js'), readFileSync(join(dir, 'custom/shot.js'), 'utf8').replace(/section-tag/g, 'renamed-shot'));
    expect(() => compose({ clips: [{ id: 'bad', template: 'text-behind', in: 0, out: 4 }] })).toThrow(/matte/);
    const clips = readdirSync(effects, { withFileTypes: true }).filter(e => e.isDirectory()).map((e, i) => ({
      id: String(i), template: e.name, in: i * 4, out: i * 4 + 4,
      ...(e.name === 'text-behind' ? { fill: { subject: { src: 'assets/subject.svg' } } } : {}),
    }));
    const file = compose({ clips: [...clips, { id: 'custom', template: 'section-tag', clip: join(dir, 'custom'), in: 70, out: 74 }] });
    const page = await browser.newPage();
    try {
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(pathToFileURL(file).href);
      for (const t of [...clips.map(c => c.in + 1), 71]) await page.evaluate(async t => {
        await (window as unknown as { seek(t: number): unknown }).seek(t);
      }, t);
      expect(errors).toEqual([]);
      expect(await page.locator('[data-el="plate"]').count()).toBe(0);
      expect(await page.locator('[data-el="subject"]').count()).toBe(1);
      expect(await page.locator('[data-scene="custom"] [data-el="label"]').textContent()).toBe('Text behind you');
    } finally { await page.close(); }
  });

  it('keeps supplied plates on request and seeks every template backward to the same frame', async () => {
    const effects = resolve('skill/kinotta/templates/effects');
    const clips = readdirSync(effects, { withFileTypes: true }).filter(e => e.isDirectory()).map((e, i) => ({
      id: String(i), template: e.name, keepLayers: ['plate'], in: i * 4, out: i * 4 + 4,
      ...(e.name === 'text-behind' ? { fill: { subject: { src: 'assets/subject.svg' } } } : {}),
    }));
    const file = compose({ clips });
    const page = await browser.newPage();
    try {
      await page.goto(pathToFileURL(file).href);
      for (const clip of clips) {
        const state = (t: number) => page.evaluate(async ({ t, id }) => {
          await (window as unknown as { seek(t: number): unknown }).seek(t);
          return document.querySelector(`[data-scene="${id}"]`)!.innerHTML;
        }, { t, id: clip.id });
        for (const local of [0.15, 1.2, 3.9]) {
          const first = await state(clip.in + local);
          await state(clip.in + 3.95);
          expect(await state(clip.in + local), `${clip.template} at ${local}`).toBe(first);
        }
      }
      expect(await page.locator('[data-el="plate"]').count()).toBeGreaterThan(0);
      expect(await page.locator('img').evaluateAll(els => els.every(el => el.getAttribute('src')?.startsWith('data:')))).toBe(true);
    } finally { await page.close(); }
  });

  it('uses the sourced B1 entrance and bounded state defaults while keeping explicit springs', async () => {
    const file = compose({ clips: [{ id: '01', template: 'chip-tally', in: 0, out: 5 }] });
    const page = await browser.newPage();
    try {
      await page.goto(pathToFileURL(file).href);
      const values = await page.evaluate(() => {
        const M = (window as unknown as { M: {
          vis(t: number, tin: number, tout: number | null): { o: number; s: number; blur: number; y: number };
          track(start: number, keys: number[][], preset?: number[]): (t: number) => number;
          ctrack(start: string, keys: [number, string][]): (t: number) => string;
        } }).M;
        return { start: M.vis(0, 0, null), settled: M.vis(0.5, 0, null),
          state: M.track(0, [[0, 1]])(0.267), color: M.ctrack('#000000', [[0, '#ffffff']])(0.267),
          explicit: M.track(0, [[0, 1]], [15, 0.84])(0.267),
          display: getComputedStyle(document.documentElement).getPropertyValue('--type-display').trim() };
      });
      expect(values.start).toMatchObject({ o: 0, s: 1.07, blur: 20, y: 26 });
      expect(values.settled).toMatchObject({ o: 1, s: 1, blur: 0, y: 0 });
      expect(values.state).toBe(1);
      expect(values.color).toBe('rgb(255,255,255)');
      expect(values.explicit).not.toBe(1);
      expect(values.display).toBe('80px');
    } finally { await page.close(); }
  });
  it('composes two independent chip tallies, fills their copy and seeks reversibly', async () => {
    const file = compose({ duration: 12, clips: [
      { id: '01', template: 'chip-tally', in: 2, out: 7, fill: { chips: [{ text: 'PhD <Stanford>', at: 3 }, { text: 'Teacher', at: 4 }] } },
      { id: '02', template: 'chip-tally', in: 7, out: 12, fill: { chips: [{ text: 'Second clip', at: 8 }] } },
    ] });
    const page = await browser.newPage();
    try {
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(`${pathToFileURL(file).href}?render`);
      expect(await page.locator('[data-el="plate"]').count()).toBe(0);
      expect(await page.locator('[data-scene="01"] .chip').allTextContents()).toEqual(['PhD <Stanford>', 'Teacher']);
      expect(await page.locator('[data-scene="01"] .tick').count()).toBe(2);
      const at = async (t: number) => page.evaluate(async t => {
        await (window as unknown as { seek(t: number): unknown }).seek(t);
        return [...document.querySelectorAll('[data-scene]')].map(el => ({ class: el.className, html: el.innerHTML }));
      }, t);
      for (const t of [2.5, 3.15, 4.5, 6.9, 8.5]) {
        const forward = await at(t);
        await at(11.9);
        await at(t);
        // Compare the active scene; inactive scenes may retain their last drawn frame.
        expect((await at(t)).filter(s => s.class.includes('active'))).toEqual(forward.filter(s => s.class.includes('active')));
      }
      await at(3.5);
      expect(await page.locator('[data-scene="01"] .chip:visible').count()).toBe(1);
      await at(4.5);
      expect(await page.locator('[data-scene="01"] .chip:visible').count()).toBe(2);
      expect(errors).toEqual([]);
    } finally { await page.close(); }
  });
});
