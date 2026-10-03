import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { buildClip, composePlan, exampleClip } from '../helpers/engine.ts';

// The broll-project sample: the engine's six-clip example composed into one page over stand-in footage.
const BROLL_SERVER = 'http://localhost:4390';
const VIEWPORT = { width: 1920, height: 1080 };

/** Two full-frame clips back to back that share element ids (shape, icSpark, cursor). */
const PAIR = [
  { id: '04', file: '04-master-prompt.html', in: 0, out: 10 },
  { id: '05', file: '05-low-vs-max.html', in: 10, out: 17.2 },
];

async function frameAt(page: Page, url: string, t: number): Promise<Buffer> {
  await page.goto(`${url}?render`);
  await page.evaluate(async (t) => {
    await document.fonts.ready;
    await (window as unknown as { seek(t: number): unknown }).seek(t);
  }, t);
  return page.screenshot();
}

test.describe('clips composed on one page', () => {
  test.use({ viewport: VIEWPORT });

  test('two clips with the same ids each draw exactly as they do alone, at their own time', async ({ page }) => {
    const dir = mkdtempSync(join(tmpdir(), 'kinotta-compose-'));
    const plan = join(dir, 'plan.json');
    writeFileSync(plan, JSON.stringify({ clips: PAIR.map((c) => ({ ...c, kind: 'full', clip: exampleClip(c.file) })) }));
    composePlan(plan, join(dir, 'page.html'));
    for (const c of PAIR) buildClip(exampleClip(c.file), join(dir, c.file));

    for (const c of PAIR) {
      for (const local of [0.6, 3.3, 6.1]) {
        const alone = await frameAt(page, pathToFileURL(join(dir, c.file)).href, local);
        const composed = await frameAt(page, pathToFileURL(join(dir, 'page.html')).href, c.in + local);
        expect(composed.equals(alone), `clip ${c.id} at ${local}s differs from the clip alone`).toBe(true);
      }
    }
  });
});

test.describe('the six-clip example in Kinotta', () => {
  test.use({ baseURL: BROLL_SERVER });

  const card = (page: Page, number: string): Locator => page.locator('.grid .shot').filter({ has: page.locator('.lbl .dot', { hasText: number }) });

  /** Mean colour of a small patch of a still on screen, at a fraction of its box. */
  async function seenColour(page: Page, still: Locator, fx: number, fy: number): Promise<number[]> {
    const box = (await still.boundingBox())!;
    const png = (await page.screenshot({ clip: { x: box.x + box.width * fx - 2, y: box.y + box.height * fy - 2, width: 4, height: 4 } })).toString('base64');
    return page.evaluate(async (png) => {
      const img = new Image();
      img.src = `data:image/png;base64,${png}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, img.width, img.height).data;
      const sum = [0, 0, 0];
      for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) sum[c]! += data[i + c]!;
      return sum.map((s) => Math.round(s / (data.length / 4)));
    }, png);
  }

  /** The footage's own colour at a fraction of the frame, drawn through a canvas. */
  async function footageColour(still: Locator, fx: number, fy: number): Promise<number[]> {
    return still.locator('video').evaluate(
      (v: HTMLVideoElement, { fx, fy }) => {
        const canvas = document.createElement('canvas');
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(v, 0, 0);
        const data = ctx.getImageData(Math.round(v.videoWidth * fx) - 2, Math.round(v.videoHeight * fy) - 2, 4, 4).data;
        const sum = [0, 0, 0];
        for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) sum[c]! += data[i + c]!;
        return sum.map((s) => Math.round(s / (data.length / 4)));
      },
      { fx, fy },
    );
  }

  const distance = (a: number[], b: number[]): number => Math.max(...a.map((v, i) => Math.abs(v - b[i]!)));

  test('it opens as a footage reel with every still drawn and no contract issues', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Storyboard, v1');
    const shots = page.locator('.grid .shot');
    await expect(shots).toHaveCount(8);
    await expect(page.getByText(/contract issue/i)).toHaveCount(0);
    for (const number of ['01', '02a', '02b', '02c', '03', '04', '05', '06']) {
      const still = card(page, number).locator('.still');
      await still.scrollIntoViewIfNeeded();
      await expect(still).toHaveAttribute('data-state', 'ready');
      // Drawn, not just present: the shape is fully in at the shot's time.
      await expect(still.frameLocator('iframe').locator('[data-scene].active [data-el="shape"]')).toHaveCSS('opacity', '1');
    }
  });

  test('a card that is one state of its clip says which part it is', async ({ page }) => {
    await page.goto('/');

    await expect(card(page, '02b').locator('.part')).toHaveText('2 of 3');
    await expect(card(page, '02b').locator('.part i.on')).toHaveCount(1);
    await expect(card(page, '02b').locator('.part i').nth(1)).toHaveClass(/on/);
    await expect(card(page, '01').locator('.part')).toHaveCount(0);
  });

  test("the enlarged state shows its clip's states under the frame, and clicking one opens it", async ({ page }) => {
    await page.goto('/');
    await card(page, '02b').getByRole('button').click();
    const sheet = page.getByRole('dialog');
    const states = sheet.getByRole('group', { name: 'States of clip 02' });

    await expect(states.getByRole('button')).toHaveText(['02a Folder → Claude Code', '02b Four builds', '02c Cost, time, tokens']);
    await expect(states.getByRole('button', { name: /^02b / })).toHaveAttribute('aria-current', 'true');
    // Between the frame and the element chips.
    const order = await sheet.evaluate((el) => [...el.querySelectorAll('.well, .states, .pinrow')].map((n) => n.className.split(' ')[0]));
    expect(order).toEqual(['well', 'states', 'pinrow']);

    await states.getByRole('button', { name: /^02c / }).click();
    await expect(sheet.locator('.lbl .dot')).toHaveText('02c');
    await expect(states.getByRole('button', { name: /^02c / })).toHaveAttribute('aria-current', 'true');

    // Arrow keys still step through every shot, out of the clip too.
    await sheet.focus();
    await page.keyboard.press('ArrowRight');
    await expect(sheet.locator('.lbl .dot')).toHaveText('03');
    await expect(sheet.locator('.states')).toHaveCount(0);
  });

  test('the panel still shows the footage around the clip', async ({ page }) => {
    await page.goto('/');
    const still = card(page, '02a').locator('.still');
    await still.scrollIntoViewIfNeeded();
    await expect(still).toHaveAttribute('data-state', 'ready');
    await expect(still.locator('video')).toHaveAttribute('data-footage', 'ready');

    // Near the left edge, clear of the panel the clip centres in the empty area.
    const at = { fx: 0.04, fy: 0.5 };
    const shape = await still.frameLocator('iframe').locator('[data-scene].active [data-el="shape"]').evaluate((el) => {
      const b = el.getBoundingClientRect();
      return { left: b.left / innerWidth, right: b.right / innerWidth };
    });
    expect(at.fx < shape.left || at.fx > shape.right).toBe(true);

    const seen = await seenColour(page, still, at.fx, at.fy);
    const footage = await footageColour(still, at.fx, at.fy);
    expect(distance(seen, footage), `seen ${seen}, footage ${footage}`).toBeLessThan(40);
  });
});
