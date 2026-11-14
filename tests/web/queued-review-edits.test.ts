import { expect, it } from 'vitest';
import { browserHarness } from './browser.ts';
import type { Operation } from '../../server/core/model.ts';

it('Edits panel accepts local history and removal while saving, but waits to cancel hand-off', async () => {
  const { page, close } = await browserHarness();
  try {
    await page.evaluate(() => {
      (window as any).editActions = [];
      (window as any).mountEditsPanel({ editable: true, commentCount: 0, comments: null, edits: {
        busy: true, error: null, list: { base: 1, canUndo: true, canRedo: true,
          handedOff: { reason: 'Waiting for the agent.' },
          operations: [{ id: 'saved', by: 'you', kind: 'caption-position', x: 0.5, y: 0.7 }],
        },
      } });
    });
    const undo = page.getByRole('button', { name: /^Undo/ });
    const redo = page.getByRole('button', { name: /^Redo/ });
    const remove = page.getByRole('button', { name: 'Remove edit 1', exact: true });
    await undo.waitFor();
    expect(await undo.isEnabled()).toBe(true);
    expect(await redo.isEnabled()).toBe(true);
    expect(await remove.isEnabled()).toBe(true);
    expect(await page.getByRole('button', { name: 'Cancel hand-off' }).isDisabled()).toBe(true);
    await undo.click(); await redo.click(); await remove.click();
    expect(await page.evaluate(() => (window as any).editActions)).toEqual(['undo', 'redo', 'remove:saved']);
  } finally { await close(); }
}, 30_000);

it('Review previews two quick graphic edits while the first saves, then saves both in order', async () => {
  const { page, close } = await browserHarness();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const requests: any[] = [];
  const operations: Operation[] = [];
  const media = { schema: 1, sources: [], placements: [], sequence: [] };
  const clips = [{ id: '02', in: 3, out: 6 }, { id: '03', in: 6, out: 9 }];
  const version = { number: 1, isNewest: true, duration: 12, media, clips, transcript: [], shots: [], overlays: [], sections: [] };
  try {
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() === 'POST' && path.endsWith('/edits')) {
        const body = route.request().postDataJSON(); requests.push(body);
        if (requests.length === 1) await gate;
        operations.push({ ...body, id: `saved-${requests.length}`, by: 'you' });
        await route.fulfill({ json: { base: 1, operations, canUndo: true, canRedo: false } });
      } else await route.fulfill({ json: path.endsWith('/edits') ? { base: 1, operations: [], canUndo: false, canRedo: false }
        : path.endsWith('/working') ? version : path.endsWith('/media-model') ? { media, clips, duration: 12 } : path.endsWith('/overload') ? { spans: [] } : [] });
    });
    await page.evaluate((version) => (window as any).mountReviewEdits(version), version);
    const graphic = (id: string) => page.locator(`.editorial-graphic[data-graphic="${id}"]`);
    await graphic('03').waitFor();
    const drag = async (id: string, end: boolean, pixels: number) => {
      const box = (await graphic(id).boundingBox())!;
      const x = end ? box.x + box.width - 3 : box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y); await page.mouse.down();
      await page.mouse.move(x + pixels, y, { steps: 5 }); await page.mouse.up();
    };
    const before = (await graphic('02').boundingBox())!;
    await drag('03', false, 40);
    await page.waitForFunction(() => (window as any).edits.list.operations.length === 1);
    expect(await page.evaluate(() => (window as any).edits.busy)).toBe(true);
    await drag('02', true, -50);
    await expect.poll(() => page.evaluate(() => (window as any).edits.list.operations.length)).toBe(2);
    expect((await graphic('02').boundingBox())!.width).toBeLessThan(before.width - 30);
    expect(requests).toHaveLength(1);
    release();
    await page.waitForFunction(() => !(window as any).edits.busy);
    expect(requests.map(({ kind, clip }) => ({ kind, clip }))).toEqual([
      { kind: 'clip-slide', clip: '03' }, { kind: 'clip-trim', clip: '02' },
    ]);
    expect(await page.evaluate(() => (window as any).edits.list.operations.map((op: any) => op.id))).toEqual(['saved-1', 'saved-2']);
  } finally { release(); await close(); }
}, 30_000);
