import { expect, it } from 'vitest';
import { browserHarness } from './browser.ts';
import type { Page } from 'playwright';
import type { EditList } from '../../web/src/api/index.ts';
import type { Operation } from '../../server/core/model.ts';

const media = { schema: 1, sources: [{ id: 'source', kind: 'video', path: 'source.mp4', duration: 10, audio: false }],
  placements: [{ id: 'take', role: 'main', source: 'source', in: 0, out: 10 }], sequence: ['take'] };
const version = { number: 1, isNewest: true, duration: 10, media, clips: [], transcript: [], sections: [] };
const initial = { base: 1, operations: [], canUndo: false, canRedo: false };

it('useEdits shows a valid edit before its reply and rolls back with the server reason', async () => {
  const { page, close } = await browserHarness();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  try {
    await page.route('**/api/reels/test/**', async (route) => {
      if (route.request().method() === 'POST') { await gate; await route.fulfill({ status: 409, json: { error: 'The source changed on disk.' } }); }
      else await route.fulfill({ json: route.request().url().endsWith('/edits') ? initial : route.request().url().endsWith('/working') ? version : { media, duration: 10 } });
    });
    await page.evaluate(() => (window as any).mountEdits());
    await page.waitForFunction(() => !!(window as any).edits.list);
    await page.evaluate(() => { void (window as any).edits.add({ kind: 'placement-change', placement: 'take', changes: { out: 8 } }); });
    await expect.poll(() => page.evaluate(() => (window as any).edits.list.operations.length)).toBe(1);
    expect(await page.evaluate(() => (window as any).edits.busy)).toBe(true);
    await page.evaluate(() => (window as any).refreshEdits());
    expect(await page.evaluate(() => (window as any).edits.list.operations.length)).toBe(1);
    expect(await page.evaluate(() => (window as any).edits.busy)).toBe(true);
    release();
    await page.waitForFunction(() => !(window as any).edits.busy);
    expect(await page.evaluate(() => (window as any).edits.list.operations)).toEqual([]);
    expect(await page.evaluate(() => (window as any).edits.error)).toBe('The source changed on disk.');
  } finally { release(); await close(); }
}, 30_000);

/** HTTP journal boundary, with replies held explicitly instead of relying on timing. */
async function journal(page: Page, failCall = 0, seed: EditList = initial) {
  let list: EditList = seed; const undo: EditList[] = seed.canUndo ? [initial] : []; const redo: EditList[] = [];
  const gates: Promise<void>[] = []; const requests: { method: string; body: any; path: string }[] = [];
  await page.route('**/api/reels/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (method === 'GET') {
      const body = path.endsWith('/edits') ? list : path.endsWith('/working') ? version : { media, duration: 10 };
      await route.fulfill({ json: body }); return;
    }
    const body = route.request().postDataJSON();
    requests.push({ method, body, path });
    const call = requests.length;
    await gates.shift();
    if (call === failCall) { await route.fulfill({ status: 409, json: { error: 'The second edit was refused.' } }); return; }
    const before = list;
    if (path.endsWith('/undo')) { list = undo.pop()!; redo.push(before); }
    else if (path.endsWith('/redo')) { list = redo.pop()!; undo.push(before); }
    else {
      undo.push(before); redo.length = 0;
      const operations = method === 'DELETE' ? before.operations.filter((op) => op.id !== decodeURIComponent(path.split('/').at(-1)!))
        : [...before.operations, { ...body, id: `persisted-${call}`, by: 'you' } as Operation];
      list = { ...before, operations };
    }
    list = { ...list, canUndo: undo.length > 0, canRedo: redo.length > 0 };
    await route.fulfill({ json: list });
  });
  await page.evaluate(() => (window as any).mountEdits());
  await page.waitForFunction(() => !!(window as any).edits.list);
  return { requests, hold() { let release!: () => void; gates.push(new Promise<void>((resolve) => { release = resolve; })); return release; } };
}

it('previews remove, undo and redo immediately using acknowledged session history', async () => {
  const { page, close } = await browserHarness();
  let release = () => {};
  try {
    const server = await journal(page);
    await page.evaluate(async () => { await (window as any).edits.add({ kind: 'placement-change', placement: 'take', changes: { out: 8 } }); });
    for (const [action, count] of [['remove', 0], ['undo', 1], ['redo', 0]] as const) {
      release = server.hold();
      await page.evaluate((action) => { void (window as any).edits[action](action === 'remove' ? 'persisted-1' : undefined); }, action);
      await expect.poll(() => page.evaluate(() => (window as any).edits.list.operations.length)).toBe(count);
      expect(await page.evaluate(() => (window as any).edits.busy)).toBe(true);
      release(); await page.waitForFunction(() => !(window as any).edits.busy);
    }
  } finally { release(); await close(); }
}, 30_000);

it('keeps persisted history server-first until its snapshot is known, then previews Redo', async () => {
  const { page, close } = await browserHarness(); let release = () => {};
  try {
    const saved: Operation = { id: 'saved', by: 'you', kind: 'placement-change', placement: 'take', changes: { out: 8 } };
    const server = await journal(page, 0, { ...initial, operations: [saved], canUndo: true });
    release = server.hold();
    await page.evaluate(() => { void (window as any).edits.undo(); });
    expect(await page.evaluate(() => (window as any).edits.list.operations.length)).toBe(1);
    expect(await page.evaluate(() => (window as any).edits.busy)).toBe(true);
    release(); await page.waitForFunction(() => !(window as any).edits.busy);
    release = server.hold();
    await page.evaluate(() => { void (window as any).edits.redo(); });
    await expect.poll(() => page.evaluate(() => (window as any).edits.list.operations[0]?.id)).toBe('saved');
    release(); await page.waitForFunction(() => !(window as any).edits.busy);
  } finally { release(); await close(); }
}, 30_000);

it('does not let a late reply publish into another reel', async () => {
  const { page, close } = await browserHarness(); let release = () => {};
  try {
    const server = await journal(page); release = server.hold();
    await page.evaluate(() => { (window as any).oldReply = false; void (window as any).edits.add({ kind: 'placement-change', placement: 'take', changes: { out: 8 } }).then(() => { (window as any).oldReply = true; }); });
    await page.waitForFunction(() => (window as any).edits.list.operations.length === 1);
    await page.evaluate(() => (window as any).mountEdits('other'));
    await page.waitForFunction(() => (window as any).edits.list?.operations.length === 0);
    release(); await page.waitForFunction(() => (window as any).oldReply);
    expect(await page.evaluate(() => (window as any).edits.list.operations)).toEqual([]);
    expect(await page.evaluate(() => (window as any).edits.error)).toBeNull();
  } finally { release(); await close(); }
}, 30_000);

it('rebases a later preview onto the first reply and rolls back only the refused queued edit', async () => {
  const { page, close } = await browserHarness();
  let first = () => {}; let second = () => {};
  try {
    const server = await journal(page, 2); first = server.hold(); second = server.hold();
    await page.evaluate(() => {
      void (window as any).edits.add({ kind: 'placement-change', placement: 'take', changes: { out: 8 } });
      void (window as any).edits.add({ kind: 'placement-change', placement: 'take', changes: { out: 6 } });
    });
    await expect.poll(() => page.evaluate(() => (window as any).edits.list.operations.length)).toBe(2);
    first();
    await expect.poll(() => page.evaluate(() => (window as any).edits.list.operations[0].id)).toBe('persisted-1');
    expect(await page.evaluate(() => (window as any).edits.list.operations.length)).toBe(2);
    second(); await page.waitForFunction(() => !(window as any).edits.busy);
    expect(await page.evaluate(() => (window as any).edits.list.operations.map((op: any) => op.id))).toEqual(['persisted-1']);
    expect(await page.evaluate(() => (window as any).edits.error)).toBe('The second edit was refused.');
  } finally { first(); second(); await close(); }
}, 30_000);

it('rebinds a queued split-child target to the server identity', async () => {
  const { page, close } = await browserHarness(); let release = () => {};
  try {
    const server = await journal(page); release = server.hold();
    await page.evaluate(() => { void (window as any).edits.add({ kind: 'placement-split', placement: 'take', at: 5 }); });
    await page.waitForFunction(() => (window as any).edits.list.operations.length === 1);
    await page.evaluate(() => {
      const split = (window as any).edits.list.operations[0];
      void (window as any).edits.add({ kind: 'placement-change', placement: `take~${split.id}`, changes: { out: 9 } });
    });
    await expect.poll(() => page.evaluate(() => (window as any).edits.list.operations.length)).toBe(2);
    release(); await page.waitForFunction(() => !(window as any).edits.busy);
    expect(server.requests[1]!.body.placement).toBe('take~persisted-1');
    expect(await page.evaluate(() => (window as any).edits.list.operations[1].placement)).toBe('take~persisted-1');
  } finally { release(); await close(); }
}, 30_000);
