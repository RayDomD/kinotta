import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../server/main.ts';
import { openProject } from '../server/core/index.ts';
import { copyFixture } from '../tests/helpers/project.ts';

const dir = copyFixture('footage-project');
const reel = join(dir, 'reels/founder-talk');
const original = JSON.parse(readFileSync(join(dir, 'motion/plan.json'), 'utf8'));
const words = JSON.parse(readFileSync(join(reel, 'transcript.json'), 'utf8')).words;
const tone = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=12', join(dir, 'tone.wav')]);
if (tone.status !== 0) throw new Error(tone.stderr.toString());
const media = (prefix: string) => ({
  schema: 1,
  sources: [
    { id: 'take', name: 'Founder talk', kind: 'video', path: `${prefix}media/talk.mp4`, duration: 12, audio: false, words },
    { id: 'tone', name: 'Music bed', kind: 'audio', path: `${prefix}tone.wav`, duration: 12 },
  ],
  tracks: [
    { id: 'speech', name: 'Speech', order: 0, gain: 1, mute: false },
    { id: 'voice', name: 'Voiceover', order: 1, gain: 1, mute: false },
    { id: 'music', name: 'Music', order: 2, gain: 0.5, mute: false },
  ],
  placements: [
    { id: 'footage', role: 'main', source: 'take', in: 0, out: 12 },
    { id: 'speech-use', role: 'audio', source: 'tone', track: 'speech', at: 0, in: 0, out: 12, gain: 0.8 },
    { id: 'voice-use', role: 'audio', source: 'tone', track: 'voice', at: 2, in: 0, out: 5, gain: 0.4 },
    { id: 'sound', role: 'audio', source: 'tone', track: 'music', at: 0, in: 0, out: 12, fadeIn: 0.5, fadeOut: 0.5 },
  ],
  sequence: ['footage'],
});
const plan = (prefix: string) => ({ ...original, video: undefined, pieces: undefined, captions: true, media: media(prefix), clips: original.clips.map((clip: object) => ({ ...clip, placement: 'footage' })) });
writeFileSync(join(dir, 'motion/plan.json'), JSON.stringify(plan('../')));
const project = openProject(dir);
await project.addOperation('founder-talk', { kind: 'track-change', track: 'music', changes: { gain: 0.55 } });
await project.saveEdits('founder-talk');
const output = resolve('docs/session-summaries/2026-10-08-review-media-editor-audit/completion-verified');
mkdirSync(output, { recursive: true });
const server = await startServer({ projectDir: dir, port: 0 });
const browser = await chromium.launch();
const measurements: object[] = [];
try {
  const page = await browser.newPage({ viewport: { width: 1272, height: 1000 } });
  // tsx preserves function names with this helper when serializing nested functions into Chromium.
  await page.addInitScript('window.__name = (fn) => fn;');
  await page.goto(server.url);
  await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: /Founder talk/ }).click();
  await page.getByRole('navigation', { name: 'Phase' }).getByRole('button', { name: 'Review', exact: true }).click();
  await page.locator('[data-verify-unit="TimelineOverview"]').waitFor({ timeout: 5000 }).catch(async (error) => {
    process.stdout.write(await page.locator('body').innerText()); throw error;
  });
  await page.getByLabel('Playhead', { exact: true }).fill('0.5');
  await page.locator('[data-placement="sound"]').first().press('Enter');
  for (const theme of ['dark', 'light']) {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('navigation', { name: 'Settings categories' }).getByRole('button', { name: 'Appearance' }).click();
    await page.getByLabel('Theme', { exact: true }).selectOption(theme);
    await page.getByRole('button', { name: 'Close Settings', exact: true }).click();
    for (const width of [390, 768, 1024, 1272, 1600]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const open of [false, true]) {
        const workspace = page.locator('[data-verify-unit="EditorWorkspace"]');
        if ((await workspace.getAttribute('data-verify-rail-open') === 'true') !== open) {
          if (open) await page.getByRole('tab', { name: 'Media rail', exact: true }).click();
          else await page.getByRole('tablist', { name: 'Reel and Media' }).getByRole('tab', { selected: true }).click();
        }
        const mediaTab = page.getByRole('tab', { name: 'Media rail', exact: true });
        if (open && await mediaTab.getAttribute('aria-selected') !== 'true') await mediaTab.click();
        if ((await workspace.getAttribute('data-verify-rail-open') === 'true') !== open) throw new Error('Requested rail state was not reached');
        await page.locator('.rv-main').scrollIntoViewIfNeeded();
        await page.locator('.rv-main').evaluate((element) => { element.scrollTop = 0; });
        const caption = page.getByRole('button', { name: /^Move captions/ });
        if (await caption.isVisible()) await caption.hover();
        await page.evaluate(() => document.fonts.ready);
        const result = await page.evaluate(() => {
          type Color = [number, number, number, number];
          const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1;
          const context = canvas.getContext('2d', { willReadFrequently: true })!;
          const cache = new Map<string, Color>();
          const color = (value: string): Color => {
            if (cache.has(value)) return cache.get(value)!;
            // The browser converts modern color(srgb ...) and other resolved formats to actual sRGB pixels.
            context.clearRect(0, 0, 1, 1); context.fillStyle = value; context.fillRect(0, 0, 1, 1);
            const data = context.getImageData(0, 0, 1, 1).data;
            const parsed: Color = [data[0]!, data[1]!, data[2]!, data[3]! / 255];
            cache.set(value, parsed); return parsed;
          };
          const blend = (front: Color, back: Color): Color => [front[0] * front[3] + back[0] * (1 - front[3]), front[1] * front[3] + back[1] * (1 - front[3]), front[2] * front[3] + back[2] * (1 - front[3]), 1];
          const luminance = (value: Color) => value.slice(0, 3).map((channel) => { const c = channel / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index]!, 0);
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          const violations: object[] = [];
          let measured = 0;
          while (walker.nextNode()) {
            const node = walker.currentNode;
            const text = node.textContent?.trim();
            const element = node.parentElement;
            if (!text || !(element instanceof HTMLElement) || element.closest('script,style,button:disabled,input:disabled,select:disabled,textarea:disabled,[aria-disabled="true"],svg')) continue;
            const range = document.createRange(); range.selectNodeContents(node);
            const bounds = range.getBoundingClientRect();
            if (!bounds.width || !bounds.height) continue;
            const ancestors: HTMLElement[] = [];
            let hidden = false;
            let opacity = 1;
            for (let item: HTMLElement | null = element; item; item = item.parentElement) {
              ancestors.unshift(item);
              const style = getComputedStyle(item);
              opacity *= Number(style.opacity);
              if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) hidden = true;
              const box = item.getBoundingClientRect();
              if (['hidden', 'clip'].includes(style.overflowX) && (bounds.right <= box.left || bounds.left >= box.right)) hidden = true;
              if (['hidden', 'clip'].includes(style.overflowY) && (bounds.bottom <= box.top || bounds.top >= box.bottom)) hidden = true;
            }
            if (hidden) continue;
            let background: Color = [255, 255, 255, 1];
            for (const ancestor of ancestors) background = blend(color(getComputedStyle(ancestor).backgroundColor), background);
            const style = getComputedStyle(element);
            const ink = color(style.color); ink[3] *= opacity;
            const foreground = blend(ink, background);
            const a = luminance(foreground), b = luminance(background);
            const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
            const required = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700) ? 3 : 4.5;
            measured += 1;
            if (ratio < required - 0.01) violations.push({ text: text.slice(0, 100), ratio, required, element: element.className });
          }
          for (const element of document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')) {
            const bounds = element.getBoundingClientRect();
            if (!bounds.width || !bounds.height || element instanceof HTMLInputElement && ['range', 'checkbox', 'radio', 'file'].includes(element.type)) continue;
            const value = element instanceof HTMLSelectElement ? element.selectedOptions[0]?.textContent : element.value;
            const placeholder = !value && 'placeholder' in element ? element.placeholder : '';
            const text = value || placeholder;
            if (!text) continue;
            const ancestors: Element[] = [];
            let hidden = false;
            for (let item: Element | null = element; item; item = item.parentElement) {
              ancestors.unshift(item);
              const style = getComputedStyle(item);
              if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) hidden = true;
            }
            if (hidden) continue;
            let background: Color = [255, 255, 255, 1];
            for (const ancestor of ancestors) background = blend(color(getComputedStyle(ancestor).backgroundColor), background);
            const style = getComputedStyle(element, placeholder ? '::placeholder' : undefined);
            const ink = color(style.color); ink[3] *= Number(style.opacity);
            const a = luminance(blend(ink, background)), b = luminance(background);
            const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
            const required = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700) ? 3 : 4.5;
            measured += 1;
            if (ratio < required - 0.01) violations.push({ text, ratio, required, element: element.className, control: true });
          }
          return { viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, measured, violations };
        });
        measurements.push({ theme, width, open, ...result });
        await page.screenshot({ path: join(output, `${theme}-${width}-${open ? 'open' : 'closed'}.png`), fullPage: true });
      }
    }
  }
  writeFileSync(join(output, 'measurements.json'), JSON.stringify(measurements, null, 2));
  const failed = measurements.filter((item) => { const value = item as { viewport: number; documentWidth: number; violations: object[] }; return value.viewport !== value.documentWidth || value.violations.length; });
  process.stdout.write(JSON.stringify({ combinations: measurements.length, failureCount: failed.length, firstFailure: failed[0], output }) + '\n');
  if (failed.length) process.exitCode = 1;
} finally { await browser.close(); await server.close(); }
