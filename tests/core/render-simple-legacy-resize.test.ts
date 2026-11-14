import { spawnSync } from 'node:child_process';
import { cpSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { expect, it } from 'vitest';
import { startServer } from '../../server/main.ts';
import { copyFixture } from '../helpers/project.ts';

it('Simple legacy cut resize preserves anchored scale, aligns join with piece boundary, and avoids overlap', { timeout: 60_000 }, async () => {
  const dir = copyFixture('footage-project');
  const generated = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=30:d=12', '-c:v', 'libx264', join(dir, 'take.mp4')], { encoding: 'utf8' });
  expect(generated.status, generated.stderr).toBe(0);

  cpSync(join(dir, 'take.mp4'), join(dir, 'media/talk.mp4'));
  writeFileSync(join(dir, 'motion/plan.json'), JSON.stringify({
    title: 'Legacy diagnosis',
    video: '../media/talk.mp4',
    duration: 12,
    pieces: [{ in: 0, out: 12 }],
    captions: true,
    clips: [],
  }));

  const server = await startServer({ projectDir: dir, port: 0 });
  await server.project.addOperation('founder-talk', { kind: 'snip', from: 3, to: 6 });

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.addInitScript(() => {
      localStorage.setItem('kinotta-simple-profile-v1', JSON.stringify({
        name: 'Alex', handle: '@alex', makes: 'Vlogs', language: 'English', destination: 'TikTok', finish: 'MP4', music: 'No music',
      }));
    });

    await page.goto(`${server.url}/#founder-talk`);
    const timeline = page.getByRole('region', { name: 'Simple timeline' });
    await timeline.waitFor();
    await page.waitForTimeout(500);

    const handles = page.getByRole('slider');
    expect(await handles.count()).toBe(2);

    // Resize end of cut by pressing ArrowRight (from 6 to 6.1s)
    await handles.last().press('ArrowRight');
    await page.waitForTimeout(600);

    const sample = await page.evaluate(() => {
      const bars = [...document.querySelectorAll<HTMLElement>('.sm-clip-video')].map((e) => {
        const rect = e.getBoundingClientRect();
        return {
          leftStyle: e.style.left,
          widthStyle: e.style.width,
          left: rect.left,
          right: rect.right,
          width: rect.width,
        };
      });
      const join = document.querySelector<HTMLElement>('.sm-cut');
      const joinRect = join?.getBoundingClientRect();
      const joinCenter = joinRect ? joinRect.left + joinRect.width / 2 : undefined;
      const tick5 = [...document.querySelectorAll<HTMLElement>('.sm-tick')].find((e) => e.textContent?.includes('00:05'));
      const tick5Rect = tick5?.getBoundingClientRect();
      const ruler = document.querySelector<HTMLElement>('.sm-ruler-wrap');
      const rulerRect = ruler?.getBoundingClientRect();

      return {
        bars,
        joinCenter,
        tick5Left: tick5Rect?.left,
        rulerLeft: rulerRect?.left,
        rulerWidth: rulerRect?.width,
      };
    });

    expect(sample.bars).toHaveLength(2);
    const bar0 = sample.bars[0]!;
    const bar1 = sample.bars[1]!;

    // 1. Verify pieces do not overlap (bar 0 right edge matches bar 1 left edge)
    expect(bar0.right).toBeCloseTo(bar1.left, 0);

    // 2. Join marker must sit on the piece boundary
    expect(sample.joinCenter).toBeDefined();
    expect(sample.joinCenter!).toBeCloseTo(bar1.left, 0);

    // 3. Ruler scale must stay anchored to previous scale (~9s), NOT rescaled to 12s source:
    const tick5Relative = (sample.tick5Left! - sample.rulerLeft!) / sample.rulerWidth!;
    expect(tick5Relative).toBeGreaterThan(0.50);
  } finally {
    await browser.close();
    await server.close();
  }
});
