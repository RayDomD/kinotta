import { access, mkdir, rename, rm } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { requireVersionDir } from './approval.ts';
import { KinottaError } from './errors.ts';
import { readReelFootage } from './footage.ts';
import { versionIssues } from './footage-issues.ts';
import { readRenderSettings, requestSettings } from './render-settings.ts';
import { pageInfo, probeFootage, renderOverFootage, renderPage, type RenderedPage } from './runner.ts';
import type { RenderJob, RenderPreset, RenderRequest, RenderSettings } from './types.ts';
import { APPROVAL_FILE, readVersion } from './version.ts';

/** Where a reel's renders go, beside its versions (R7). */
export const RENDERS_DIR = 'renders';
const PAGE_FILE = 'index.html';
/** A version's own plan (E14): the one its pieces come from. */
const VERSION_PLAN_FILE = 'plan.json';
const PRESET_NAMES: Record<RenderPreset, string> = { draft: 'a Draft', final: 'a Final', overlay: 'an Overlay' };
const PRESETS: readonly RenderPreset[] = ['draft', 'final', 'overlay'];
/** Windows holds a killed process's files for a moment, so removing a cancelled render's files retries. */
const CLEANUP_RETRIES = 10;
const CLEANUP_RETRY_MS = 100;
/** A code-only page has no source to take a frame rate from, so this is its source rate. */
const CODE_ONLY_FPS = '30';

/**
 * What a preset fixes beyond the four settings (R2): the H.264 CRF at each quality, and motion blur. Draft is a quick
 * check without blur; Overlay's CRF is unused, since it writes ProRes.
 */
const PRESET_ENCODING: Record<RenderPreset, { crf: Record<RenderSettings['quality'], number>; blur: boolean }> = {
  draft: { crf: { standard: 28, high: 20 }, blur: false },
  final: { crf: { standard: 16, high: 10 }, blur: true },
  overlay: { crf: { standard: 16, high: 10 }, blur: true },
};
/** ProRes profiles: 4444 for Standard, 4444 XQ for High. */
const PRORES_PROFILE: Record<RenderSettings['quality'], string> = { standard: '4', high: '5' };
/** The short side of the 1080p and 4K sizes, in pixels. */
const SHORT_SIDE: Record<'1080p' | '4k', number> = { '1080p': 1080, '4k': 2160 };

/** A request that has been checked, with the folders it renders from and into. */
export interface RenderTask {
  request: RenderRequest;
  reelDir: string;
  versionDir: string;
  /** Code-only reels: the page is the whole picture. */
  codeOnly: boolean;
  /** The four settings this render uses: the request's over the reel's saved ones over the preset's defaults. */
  settings: RenderSettings;
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
 * for an unknown preset or setting, a Final or Overlay the gate refuses (naming every reason; a Draft skips the gate), or
 * an Overlay of a code-only page that isn't transparent (R11).
 */
export async function prepareRender(projectDir: string, request: RenderRequest): Promise<RenderTask> {
  if (!PRESETS.includes(request.preset)) throw new KinottaError('invalid', `Unknown preset "${request.preset}". Use draft, final or overlay.`);
  const { reelDir, versionDir } = await requireVersionDir(projectDir, request.reel, request.version);
  const settings = requestSettings((await readRenderSettings(projectDir, request.reel))[request.preset], request);
  const codeOnly = (await readReelFootage(projectDir, reelDir)) === null;
  if (request.preset !== 'draft') {
    const reasons = await gateReasons(projectDir, request, versionDir, codeOnly);
    if (reasons.length > 0) throw new KinottaError('invalid', `v${request.version} can't be rendered as ${PRESET_NAMES[request.preset]}: ${reasons.join('; ')}.`);
  }
  if (codeOnly && request.preset === 'overlay' && !(await pageInfo(join(versionDir, PAGE_FILE))).alpha) {
    throw new KinottaError('invalid', `v${request.version} has no transparent background, so it has no Overlay. Render a Final instead.`);
  }
  return { request, reelDir, versionDir, codeOnly, settings };
}

/** An even number of pixels, as H.264 at 4:2:0 needs. */
const even = (pixels: number): number => Math.max(2, Math.round(pixels / 2) * 2);

/** A frame rate for a file name: `30`, `29.97`. */
function fpsLabel(fps: string): string {
  const [num, den = '1'] = fps.split('/');
  return String(Math.round((Number(num) / Number(den)) * 100) / 100);
}

/** A picture's size at a size setting: the short side set, the long side keeping its aspect ratio, both even. */
function targetSize(source: { width: number; height: number }, size: RenderSettings['size']): { width: number; height: number } {
  const factor = size === 'source' ? 1 : size === 'half' ? 0.5 : SHORT_SIDE[size] / Math.min(source.width, source.height);
  return { width: even(source.width * factor), height: even(source.height * factor) };
}

/**
 * `<reel>-v<n>-<preset>-<height>p<fps>[-high][-hardcuts].<ext>` (R7, R18): a non-default quality, and Hard cuts in a
 * render with sound, get their own name so they don't replace the default render.
 */
function renderName({ reel, version, preset }: RenderRequest, settings: RenderSettings, sound: boolean, height: number, fps: string, ext: string): string {
  const high = settings.quality === 'high' ? '-high' : '';
  const hard = sound && settings.audio === 'hard' ? '-hardcuts' : '';
  return `${reel}-v${version}-${preset}-${height}p${fpsLabel(fps)}${high}${hard}.${ext}`;
}

/**
 * Renders a checked request into the reel's renders/ folder and returns the file, relative to the project. It is written
 * under a temp name and renamed when complete, replacing a render with the same settings. A failure, or `signal` aborting,
 * stops the render's processes and leaves nothing: no temp file and no `.work-<job>/` folder.
 */
export async function runRender(projectDir: string, task: RenderTask, job: RenderJob, report: (done: number, frames: number) => void, signal: AbortSignal): Promise<string> {
  const { request, versionDir, settings } = task;
  const encoding = PRESET_ENCODING[request.preset];
  const crf = encoding.crf[settings.quality];
  const proresProfile = PRORES_PROFILE[settings.quality];
  const ext = request.preset === 'overlay' ? 'mov' : 'mp4';
  const dir = join(task.reelDir, RENDERS_DIR);
  await mkdir(dir, { recursive: true });
  const temp = join(dir, `.render-${job.id}.${ext}`);
  try {
    const page = join(versionDir, PAGE_FILE);
    const info = await pageInfo(page);
    signal.throwIfAborted();
    let fps = settings.fps === 'source' ? CODE_ONLY_FPS : String(settings.fps);
    let sound = false;
    let rendered: RenderedPage;
    if (task.codeOnly) {
      const { height } = targetSize(info, settings.size);
      const codec = request.preset === 'overlay' ? 'prores' : 'h264';
      rendered = await renderPage({ page, out: temp, fps, scale: height / info.height, crf, blur: encoding.blur, codec, proresProfile }, report, signal);
    } else {
      // The original, not the browser's playback copy of an HEVC or ProRes file.
      const footage = (await readReelFootage(projectDir, task.reelDir))?.file ?? null;
      if (footage === null || !(await exists(footage))) throw new Error("The reel's footage file is missing.");
      const source = await probeFootage(footage);
      signal.throwIfAborted();
      if (settings.fps === 'source') fps = source.fps;
      const { width, height } = targetSize(source, settings.size);
      const pageJob = { page, fps, scale: height / info.height, crf, blur: encoding.blur, proresProfile };
      if (request.preset === 'overlay') {
        rendered = await renderPage({ ...pageJob, out: temp, codec: 'prores' }, report, signal);
      } else {
        // The version's own pieces through the plan resolver (E14, R13), never the reel's current sources.
        const { pieces = [] } = await readVersion(projectDir, request.reel, request.version);
        if (pieces.length === 0) throw new Error(`v${request.version} has no pieces of the footage to render.`);
        const audio = source.audio ? settings.audio : null;
        sound = audio !== null;
        rendered = await renderOverFootage(pageJob, { footage, pieces, fps, width, height, crf, audio, out: temp }, report, signal);
        rendered = { ...rendered, height };
      }
    }
    const file = join(dir, renderName(request, settings, sound, rendered.height, fps, ext));
    await rename(temp, file);
    return relative(projectDir, file).split(sep).join('/');
  } catch (err) {
    const cleanup = { force: true, maxRetries: CLEANUP_RETRIES, retryDelay: CLEANUP_RETRY_MS };
    await rm(temp, cleanup);
    await rm(join(dir, `.work-${job.id}`), { ...cleanup, recursive: true });
    throw err;
  }
}
