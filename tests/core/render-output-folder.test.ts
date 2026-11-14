import { existsSync, mkdirSync, readdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { copyFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { listRenders, renderPath, revealRender } from '../../server/core/_internal/past-renders.ts';
import { renderPage, revealInFolder } from '../../server/core/_internal/runner.ts';
import { prepareRender, runRender } from '../../server/core/_internal/render.ts';
import type { RenderJob, RenderPreset } from '../../server/core/index.ts';
import { copyFixture } from '../helpers/project.ts';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, rename: vi.fn(actual.rename), copyFile: vi.fn(actual.copyFile) };
});

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

it('copies then removes the temporary file when rename crosses filesystems', async () => {
  const dir = copyFixture('showreel-project');
  vi.mocked(rename).mockRejectedValueOnce(Object.assign(new Error('cross-device'), { code: 'EXDEV' }));
  const file = await render(dir, 'final');
  expect(readFileSync(join(dir, file), 'utf8')).toBe('finished video');
  expect(copyFile).toHaveBeenCalledWith(join(rendersDir(dir), `.render-${JOB.id}.mp4`), join(dir, file));
  expect(readdirSync(rendersDir(dir))).toEqual([]);
});

it.each([false, true])('cleans a failed Final publication, preserving a pre-existing output folder (%s)', async (existing) => {
  const dir = copyFixture('showreel-project');
  if (existing) mkdirSync(outputDir(dir), { recursive: true });
  vi.mocked(rename).mockRejectedValueOnce(Object.assign(new Error('access denied'), { code: 'EACCES' }));
  await expect(render(dir, 'final')).rejects.toThrow('access denied');
  expect(readdirSync(rendersDir(dir))).toEqual([]);
  expect(existsSync(outputDir(dir))).toBe(existing);
});

it.each(['cancel', 'fail'])('cleans temporary files and work folders when a Final stops: %s', async (reason) => {
  const dir = copyFixture('showreel-project');
  const task = await prepareRender(dir, { reel: REEL, version: 1, preset: 'final' });
  const stop = new AbortController();
  vi.mocked(renderPage).mockImplementationOnce(async ({ out }) => {
    writeFileSync(out, 'partial');
    mkdirSync(join(rendersDir(dir), `.work-${JOB.id}`));
    writeFileSync(join(rendersDir(dir), `.work-${JOB.id}`, 'segment.mp4'), 'partial segment');
    if (reason === 'cancel') {
      stop.abort();
      stop.signal.throwIfAborted();
    }
    throw new Error('render failed');
  });
  await expect(runRender(dir, task, JOB, () => {}, stop.signal, 1)).rejects.toBeDefined();
  expect(readdirSync(rendersDir(dir))).toEqual([]);
  expect(existsSync(outputDir(dir))).toBe(false);
});

it('removes the output folder it created when Final publication is cancelled', async () => {
  const dir = copyFixture('showreel-project');
  const task = await prepareRender(dir, { reel: REEL, version: 1, preset: 'final' });
  const stop = new AbortController();
  vi.mocked(rename).mockImplementationOnce(async () => {
    expect(existsSync(outputDir(dir))).toBe(true);
    stop.abort();
    stop.signal.throwIfAborted();
  });
  await expect(runRender(dir, task, JOB, () => {}, stop.signal, 1)).rejects.toMatchObject({ name: 'AbortError' });
  expect(readdirSync(rendersDir(dir))).toEqual([]);
  expect(readdirSync(join(dir, 'output'))).not.toContain(REEL);
  expect(existsSync(outputDir(dir))).toBe(false);
});

it('lists a duplicate filename once, preferring output metadata even when the legacy file is newer', async () => {
  const dir = copyFixture('showreel-project');
  const file = `${REEL}-v1-final-180p30.mp4`;
  mkdirSync(rendersDir(dir), { recursive: true });
  mkdirSync(outputDir(dir), { recursive: true });
  writeFileSync(join(rendersDir(dir), file), 'legacy final');
  writeFileSync(join(outputDir(dir), file), 'output');
  const outputAt = new Date('2026-10-01');
  const legacyAt = new Date('2026-10-03');
  utimesSync(join(outputDir(dir), file), outputAt, outputAt);
  utimesSync(join(rendersDir(dir), file), legacyAt, legacyAt);
  expect(await listRenders(dir, REEL)).toEqual([
    { file, version: 1, preset: 'final', bytes: 6, at: outputAt.toISOString() },
  ]);
  expect(await renderPath(dir, REEL, file)).toBe(join(outputDir(dir), file));
});
