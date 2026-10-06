import { access, mkdir, rename, rm } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { requireVersionDir } from './approval.ts';
import { KinottaError } from './errors.ts';
import { readReelFootage } from './footage.ts';
import { versionIssues } from './footage-issues.ts';
import { pageInfo, probeFootage, renderOverFootage, renderPage, type RenderedPage } from './runner.ts';
import type { RenderJob, RenderPreset, RenderRequest } from './types.ts';
import { APPROVAL_FILE, readVersion } from './version.ts';

/** Where a reel's renders go, beside its versions (R7). */
export const RENDERS_DIR = 'renders';
const PAGE_FILE = 'index.html';
/** A version's own plan (E14): the one its pieces come from. */
const VERSION_PLAN_FILE = 'plan.json';
const PRESET_NAMES: Record<RenderPreset, string> = { draft: 'a Draft', final: 'a Final', overlay: 'an Overlay' };
const PRESETS: readonly RenderPreset[] = ['draft', 'final', 'overlay'];
/** A code-only page has no source to take a frame rate from, so this is its source rate. */
const CODE_ONLY_FPS = '30';

/** R2's defaults: Draft is a half-size check, Final the source at full quality, Overlay the page alone with alpha. */
const PRESET_DEFAULTS: Record<RenderPreset, { size: number; crf: number; blur: boolean }> = {
  draft: { size: 0.5, crf: 28, blur: false },
  final: { size: 1, crf: 16, blur: true },
  overlay: { size: 1, crf: 16, blur: true },
};

/** A request that has been checked, with the folders it renders from and into. */
export interface RenderTask {
  request: RenderRequest;
  reelDir: string;
  versionDir: string;
  /** Code-only reels: the page is the whole picture. */
  codeOnly: boolean;
}

const exists = (path: string): Promise<boolean> => access(path).then(() => true, () => false);

/**
 * Why a version can't be a deliverable (R6, R10, R13): it isn't approved; a footage version has no plan of its own, so its
 * pieces could drift with later edits; or it has contract issues, footage ones included. Empty when it can.
 */
async function gateReasons(projectDir: string, request: RenderRequest, versionDir: string, codeOnly: boolean): Promise<string[]> {
  const reasons: string[] = [];
  if (!(await exists(join(versionDir, APPROVAL_FILE)))) reasons.push("it isn't approved (the owner approves it in Kinotta)");
  // A code-only reel has no plan: its page is the whole picture, frozen with the version.
  if (!codeOnly && !(await exists(join(versionDir, VERSION_PLAN_FILE)))) reasons.push('it was built before plans were kept');
  const issues = versionIssues(await readVersion(projectDir, request.reel, request.version));
  if (issues.length > 0) {
    reasons.push(`it has ${issues.length} contract ${issues.length === 1 ? 'issue' : 'issues'}: ${issues.map((issue) => issue.message).join('; ')}`);
  }
  return reasons;
}

/**
 * Checks that a render can be made before it is queued. Throws `not-found` for an unknown reel or version, and `invalid`
 * for an unknown preset, a Final or Overlay the gate refuses (naming every reason; a Draft skips the gate), or an Overlay
 * of a code-only page that isn't transparent (R11).
 */
export async function prepareRender(projectDir: string, request: RenderRequest): Promise<RenderTask> {
  if (!PRESETS.includes(request.preset)) throw new KinottaError('invalid', `Unknown preset "${request.preset}". Use draft, final or overlay.`);
  const { reelDir, versionDir } = await requireVersionDir(projectDir, request.reel, request.version);
  const codeOnly = (await readReelFootage(projectDir, reelDir)) === null;
  if (request.preset !== 'draft') {
    const reasons = await gateReasons(projectDir, request, versionDir, codeOnly);
    if (reasons.length > 0) throw new KinottaError('invalid', `v${request.version} can't be rendered as ${PRESET_NAMES[request.preset]}: ${reasons.join('; ')}.`);
  }
  if (codeOnly && request.preset === 'overlay' && !(await pageInfo(join(versionDir, PAGE_FILE))).alpha) {
    throw new KinottaError('invalid', `v${request.version} has no transparent background, so it has no Overlay. Render a Final instead.`);
  }
  return { request, reelDir, versionDir, codeOnly };
}

/** An even number of pixels, as H.264 at 4:2:0 needs. */
const even = (pixels: number): number => Math.max(2, Math.round(pixels / 2) * 2);

/** A frame rate for a file name: `30`, `29.97`. */
function fpsLabel(fps: string): string {
  const [num, den = '1'] = fps.split('/');
  return String(Math.round((Number(num) / Number(den)) * 100) / 100);
}

/** `<reel>-v<n>-<preset>-<height>p<fps>[-hardcuts].<ext>` (R7, R18). */
function renderName({ reel, version, preset, audio }: RenderRequest, height: number, fps: string, ext: string): string {
  return `${reel}-v${version}-${preset}-${height}p${fpsLabel(fps)}${audio === 'hard' ? '-hardcuts' : ''}.${ext}`;
}

/**
 * Renders a checked request into the reel's renders/ folder and returns the file, relative to the project. It is written
 * under a temp name and renamed when complete, replacing a render with the same settings; a failure leaves nothing.
 */
export async function runRender(projectDir: string, task: RenderTask, job: RenderJob, report: (done: number, frames: number) => void): Promise<string> {
  const { request, versionDir } = task;
  const defaults = PRESET_DEFAULTS[request.preset];
  const ext = request.preset === 'overlay' ? 'mov' : 'mp4';
  const dir = join(task.reelDir, RENDERS_DIR);
  await mkdir(dir, { recursive: true });
  const temp = join(dir, `.render-${job.id}.${ext}`);
  try {
    const page = join(versionDir, PAGE_FILE);
    const info = await pageInfo(page);
    let fps = CODE_ONLY_FPS;
    let rendered: RenderedPage;
    if (task.codeOnly) {
      const height = even(info.height * defaults.size);
      const codec = request.preset === 'overlay' ? 'prores' : 'h264';
      rendered = await renderPage({ page, out: temp, fps, scale: height / info.height, crf: defaults.crf, blur: defaults.blur, codec }, report);
    } else {
      // The original, not the browser's playback copy of an HEVC or ProRes file.
      const footage = (await readReelFootage(projectDir, task.reelDir))?.file ?? null;
      if (footage === null || !(await exists(footage))) throw new Error("The reel's footage file is missing.");
      const source = await probeFootage(footage);
      fps = source.fps;
      const height = even(source.height * defaults.size);
      const pageJob = { page, fps, scale: height / info.height, crf: defaults.crf, blur: defaults.blur };
      if (request.preset === 'overlay') {
        rendered = await renderPage({ ...pageJob, out: temp, codec: 'prores' }, report);
      } else {
        // The version's own pieces through the plan resolver (E14, R13), never the reel's current sources.
        const { pieces = [] } = await readVersion(projectDir, request.reel, request.version);
        if (pieces.length === 0) throw new Error(`v${request.version} has no pieces of the footage to render.`);
        const width = even(source.width * defaults.size);
        const audio = source.audio ? (request.audio ?? 'smooth') : null;
        rendered = await renderOverFootage(pageJob, { footage, pieces, fps, width, height, crf: defaults.crf, audio, out: temp }, report);
        rendered = { ...rendered, height };
      }
    }
    const file = join(dir, renderName(request, rendered.height, fps, ext));
    await rename(temp, file);
    return relative(projectDir, file).split(sep).join('/');
  } catch (err) {
    await rm(temp, { force: true });
    throw err;
  }
}
