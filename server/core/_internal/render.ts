import { mkdir, rename, rm } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { requireVersionDir } from './approval.ts';
import { KinottaError } from './errors.ts';
import { readReelFootage } from './footage.ts';
import { renderPage } from './runner.ts';
import type { RenderJob, RenderPreset, RenderRequest } from './types.ts';

/** Where a reel's renders go, beside its versions (R7). */
export const RENDERS_DIR = 'renders';
const PAGE_FILE = 'index.html';
const PRESETS: readonly RenderPreset[] = ['draft', 'final', 'overlay'];
/** A code-only page has no source to take a frame rate from, so this is its source rate. */
const CODE_ONLY_FPS = 30;
/** R2: half size, CRF 28, no motion blur. */
const DRAFT = { scale: 0.5, crf: 28, blur: false } as const;

/** A request that has been checked, with the folders it renders from and into. */
export interface RenderTask {
  request: RenderRequest;
  reelDir: string;
  versionDir: string;
}

/**
 * Checks that a render can be made before it is queued. Throws `not-found` for an unknown reel or version, and `invalid`
 * for an unknown preset or a render this build doesn't make yet: Final, Overlay and footage reels come later.
 */
export async function prepareRender(projectDir: string, request: RenderRequest): Promise<RenderTask> {
  if (!PRESETS.includes(request.preset)) throw new KinottaError('invalid', `Unknown preset "${request.preset}". Use draft, final or overlay.`);
  const { reelDir, versionDir } = await requireVersionDir(projectDir, request.reel, request.version);
  if (request.preset !== 'draft') throw new KinottaError('invalid', 'Final and Overlay renders are not available yet. Render a Draft.');
  if ((await readReelFootage(projectDir, reelDir)) !== null) throw new KinottaError('invalid', 'Footage reels cannot be rendered yet. Only a code-only reel renders, as a Draft.');
  return { request, reelDir, versionDir };
}

/** `<reel>-v<n>-<preset>-<height>p<fps>.mp4` (R7). */
const renderName = ({ reel, version, preset }: RenderRequest, height: number, fps: number): string => `${reel}-v${version}-${preset}-${height}p${fps}.mp4`;

/**
 * Renders a checked request into the reel's renders/ folder and returns the file, relative to the project. It is written
 * under a temp name and renamed when complete, replacing a render with the same settings; a failure leaves nothing.
 */
export async function runRender(projectDir: string, task: RenderTask, job: RenderJob, report: (done: number, frames: number) => void): Promise<string> {
  const dir = join(task.reelDir, RENDERS_DIR);
  await mkdir(dir, { recursive: true });
  const temp = join(dir, `.render-${job.id}.mp4`);
  try {
    const page = await renderPage({ page: join(task.versionDir, PAGE_FILE), out: temp, fps: CODE_ONLY_FPS, ...DRAFT, codec: 'h264' }, report);
    const file = join(dir, renderName(task.request, page.height, CODE_ONLY_FPS));
    await rename(temp, file);
    return relative(projectDir, file).split(sep).join('/');
  } catch (err) {
    await rm(temp, { force: true });
    throw err;
  }
}
