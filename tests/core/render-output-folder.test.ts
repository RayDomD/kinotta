import { existsSync, mkdirSync, readdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { listRenders, renderPath, revealRender } from '../../server/core/_internal/past-renders.ts';
import { revealInFolder } from '../../server/core/_internal/runner.ts';
import { prepareRender, runRender } from '../../server/core/_internal/render.ts';
import type { RenderJob, RenderPreset } from '../../server/core/index.ts';
import { copyFixture } from '../helpers/project.ts';

vi.mock('../../server/core/_internal/runner.ts', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../server/core/_internal/runner.ts')>(),
  revealInFolder: vi.fn(),
  pageInfo: vi.fn(async () => ({ width: 320, height: 180, duration: 0.5, alpha: true })),
  renderPage: vi.fn(async ({ out }: { out: string }) => {
    writeFileSync(out, 'finished video');
    return { width: 320, height: 180, frames: 15 };
  }),
}));

const REEL = 'product-showreel';
const JOB = { id: 'abcdef12' } as RenderJob;
const rendersDir = (dir: string): string => join(dir, 'reels', REEL, 'renders');
const outputDir = (dir: string): string => join(dir, 'output', REEL);

afterEach(() => vi.restoreAllMocks());

async function render(dir: string, preset: RenderPreset, working = false): Promise<string> {
  const task = await prepareRender(dir, { reel: REEL, version: 1, preset, ...(working ? { working: true } : {}) });
  return runRender(dir, task, JOB, () => {}, new AbortController().signal, 1);
}

describe('render output folders', () => {
  it('writes a Final into output/<reel> and returns its project-relative path', async () => {
    const dir = copyFixture('showreel-project');
    const file = await render(dir, 'final');
    expect(file).toBe(`output/${REEL}/${REEL}-v1-final-180p30.mp4`);
    expect(readFileSync(join(dir, file), 'utf8')).toBe('finished video');
    expect(readdirSync(rendersDir(dir))).toEqual([]);
  });

  it.each([false, true])('keeps a Draft in renders/ (Working: %s)', async (working) => {
    const dir = copyFixture('showreel-project');
    const file = await render(dir, 'draft', working);
    const version = working ? `working-v1-${JOB.id}` : 'v1';
    expect(file).toBe(`reels/${REEL}/renders/${REEL}-${version}-draft-180p30.mp4`);
    expect(readFileSync(join(dir, file), 'utf8')).toBe('finished video');
    expect(existsSync(outputDir(dir))).toBe(false);
  });
});

it('writes an Overlay .mov into output/<reel>', async () => {
  const dir = copyFixture('showreel-project');
  const file = await render(dir, 'overlay');
  expect(file).toBe(`output/${REEL}/${REEL}-v1-overlay-180p30.mov`);
  expect(readFileSync(join(dir, file), 'utf8')).toBe('finished video');
  expect(readdirSync(rendersDir(dir))).toEqual([]);
});

it('lists both folders newest first, including legacy Finals, and skips dot names and directories', async () => {
  const dir = copyFixture('showreel-project');
  const entries = [
    { folder: rendersDir(dir), name: `${REEL}-v1-final-180p30.mp4`, preset: 'final', date: '2026-10-01' },
    { folder: outputDir(dir), name: `${REEL}-v1-overlay-180p30.mov`, preset: 'overlay', date: '2026-10-03' },
    { folder: rendersDir(dir), name: `${REEL}-v1-draft-180p30.mp4`, preset: 'draft', date: '2026-10-02' },
  ];
  for (const entry of entries) {
    mkdirSync(entry.folder, { recursive: true });
    const file = join(entry.folder, entry.name);
    writeFileSync(file, 'video');
    utimesSync(file, new Date(entry.date), new Date(entry.date));
    writeFileSync(join(entry.folder, '.render-temp.mp4'), 'partial');
    writeFileSync(join(entry.folder, 'notes.txt'), 'not a render');
    mkdirSync(join(entry.folder, `${REEL}-v2-final-180p30.mp4`), { recursive: true });
  }
  expect(await listRenders(dir, REEL)).toEqual([entries[1]!, entries[2]!, entries[0]!].map((entry) => ({
    file: entry.name, version: 1, preset: entry.preset, bytes: 5, at: new Date(entry.date).toISOString(),
  })));
});

it('looks up output first, falls back to legacy renders, and reveals the resolved file', async () => {
  const dir = copyFixture('showreel-project');
  mkdirSync(rendersDir(dir), { recursive: true });
  mkdirSync(outputDir(dir), { recursive: true });
  const final = `${REEL}-v1-final-180p30.mp4`;
  const draft = `${REEL}-v1-draft-180p30.mp4`;
  writeFileSync(join(rendersDir(dir), final), 'legacy');
  writeFileSync(join(rendersDir(dir), draft), 'draft');
  expect(await renderPath(dir, REEL, final)).toBe(join(rendersDir(dir), final));
  writeFileSync(join(outputDir(dir), final), 'new');
  expect(await renderPath(dir, REEL, final)).toBe(join(outputDir(dir), final));
  expect(await renderPath(dir, REEL, draft)).toBe(join(rendersDir(dir), draft));
  await revealRender(dir, REEL, final);
  expect(revealInFolder).toHaveBeenCalledWith(join(outputDir(dir), final));
  for (const name of ['..', '.', '.hidden.mp4', '../reel.json', '..\\reel.json', 'nested/file.mp4', 'nested\\file.mp4', 'missing.mp4']) {
    await expect(renderPath(dir, REEL, name)).rejects.toMatchObject({ code: 'not-found' });
  }
  await expect(renderPath(dir, 'unknown', final)).rejects.toMatchObject({ code: 'not-found' });
});
