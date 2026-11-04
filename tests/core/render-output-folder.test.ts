import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareRender, runRender } from '../../server/core/_internal/render.ts';
import type { RenderJob, RenderPreset } from '../../server/core/index.ts';
import { copyFixture } from '../helpers/project.ts';

vi.mock('../../server/core/_internal/runner.ts', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../server/core/_internal/runner.ts')>(),
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
