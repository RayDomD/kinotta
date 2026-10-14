import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, posix, relative, resolve, sep } from 'node:path';
import type { Operation, Plan, PlanClip } from './edit-model.ts';
import { KinottaError } from './errors.ts';
import { mediaPlanTimeline } from './edit-model.ts';
import { buildPage, buildShots } from './runner.ts';
import type { TranscriptWord } from './types.ts';
import { preserveMedia } from './media-preservation.ts';
import { graphicPreserver } from './graphic-preservation.ts';
import { assembleParts } from './parts-assembler.ts';
import type { PartsInputs } from './parts-assembler.ts';
import { checkPartsManifest } from './parts.ts';
import { scanPage, checkShotsAgainstPage } from './contract.ts';
import { EDITS_CSS, MEDIA_SIDECAR_FILE } from './code-edits.ts';
import type { PartsManifest } from './types.ts';
import type { MediaPlan } from './media-model.ts';

/** Where a version is built before it exists: not a `v<n>` folder, and hidden from the watcher. */
export const STAGE_DIR = '.save';
const SHOTS_STAGE = 'shots.stage.json';
const PUBLISHED_TRANSCRIPT = 'transcript.json';

const writeJson = (file: string, value: unknown): Promise<void> => writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');

/** The file a clip's fragment is in, relative to the plan: its "clip" path, else the engine's `clips/<id>-*.html` or `<id>-*.html`. */
async function clipPath(planDir: string, clip: PlanClip): Promise<string | undefined> {
  if (typeof clip.clip === 'string') return clip.clip;
  for (const folder of ['clips', '']) {
    try {
      const found = (await readdir(join(planDir, folder))).filter((f) => f.startsWith(`${clip.splitFrom ?? clip.id}-`) && f.endsWith('.html')).sort()[0];
      if (found) return posix.join(folder, found);
    } catch {
      // no such folder
    }
  }
  return undefined;
}

/**
 * The plan as a version folder keeps it. The plan sits in `planDir` (the reel's folder, or the project's `motion/`) and
 * the version one level below the reel's, so the paths the plan holds relative to itself (the video and each clip's
 * fragment) are rewritten to point at the same files from the version folder; the transcript is the version's own copy.
 */
async function versionPlan(planDir: string, versionDir: string, plan: Plan, freezeSources = false, referenceVideo = false): Promise<Plan> {
  const rebase = (path: string): string => (isAbsolute(path) ? path : relative(versionDir, resolve(planDir, path)).split(sep).join('/'));
  const copy: Plan = { ...plan };
  if (copy.media) copy.media = await preserveMedia(planDir, versionDir, copy.media, referenceVideo);
  if (typeof copy.video === 'string') {
    const available = await stat(resolve(planDir, copy.video)).then((entry) => entry.isFile(), () => false);
    if (!available) throw new KinottaError('invalid', 'The footage source is missing. Relink it before freezing Working.');
    copy.video = rebase(copy.video);
  }
  if (copy.transcript !== undefined) copy.transcript = PUBLISHED_TRANSCRIPT;
  if (Array.isArray(copy.clips)) {
    const preserveGraphic = graphicPreserver(versionDir, freezeSources && !plan.media);
    const clips = [];
    // Dependency names follow manifest order, independent of filesystem read completion order.
    for (const clip of copy.clips) {
      const path = await clipPath(planDir, clip);
      clips.push(path === undefined ? clip : { ...clip, clip: copy.media || freezeSources ? await preserveGraphic(resolve(planDir, path)) : rebase(path) });
    }
    copy.clips = clips;
  }
  return copy;
}

/** Older agent builds may have no metadata copies. Freeze their source ranges and words before first native conversion. */
export async function snapshotLegacyVersion(planDir: string, versionDir: string, plan: Plan, transcript: Record<string, unknown>): Promise<void> {
  if (plan.media) return;
  const planFile = join(versionDir, 'plan.json');
  if (!(await stat(planFile).then(() => true, () => false))) await writeJson(planFile, await versionPlan(planDir, versionDir, plan));
  const transcriptFile = join(versionDir, PUBLISHED_TRANSCRIPT);
  if (!(await stat(transcriptFile).then(() => true, () => false))) await writeJson(transcriptFile, transcript);
}

export interface StagedVersion {
  /** Absolute path of the finished stage. */
  dir: string;
}

export interface VersionInput {
  /** Working captures preserve graphics against later authored edits. Legacy footage stays in the project. */
  freezeSources?: boolean;
  /** Drafts reference project footage while capturing the plan and graphics. */
  referenceVideo?: boolean;
  /** The folder the plan sits in: its relative paths are relative to it. */
  planDir: string;
  /** The reel's plan with every edit already in it. */
  plan: Plan;
  /** The reel's transcript words with every edit already in them. */
  words: TranscriptWord[];
  /** The reel's transcript as it was written, so fields beside `words` survive; `words` replaces its own. */
  transcript?: Record<string, unknown>;
  /** Who made the version: `you`, or an agent's name. */
  builtBy: string;
  /** From the second version on. */
  changedSections?: string[];
  /** The operations this version applied (edits.json), when it applied any. */
  operations?: { base: number; list: readonly Operation[] };
}

/**
 * Builds a version into a stage folder: its own plan and transcript, the page, then `edits.json`, and `shots.json`
 * last, since its appearing is what tells everyone the version is ready (K12). Nothing outside the stage changes;
 * a failure removes the stage and throws the reason.
 */
export async function stageVersion(reelDir: string, input: VersionInput): Promise<StagedVersion> {
  const broken = mediaPlanTimeline(input.plan).clips?.find((c) => c.attachmentBroken);
  if (broken) throw new KinottaError('invalid', `Graphic ${broken.id} has a broken footage attachment. Trim, split or reattach it before Save.`);
  const dir = join(reelDir, STAGE_DIR);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir);
  try {
    const planFile = join(dir, 'plan.json');
    await writeJson(planFile, await versionPlan(input.planDir, dir, input.plan, input.freezeSources, input.referenceVideo));
    await writeJson(join(dir, PUBLISHED_TRANSCRIPT), { ...input.transcript, words: input.words });
    await buildPage(planFile, join(dir, 'index.html'));
    await buildShots(planFile, join(dir, SHOTS_STAGE));
    const shots = JSON.parse(await readFile(join(dir, SHOTS_STAGE), 'utf8')) as Record<string, unknown>;
    if (input.operations) await writeJson(join(dir, 'edits.json'), { base: input.operations.base, operations: input.operations.list });
    await rm(join(dir, SHOTS_STAGE));
    await writeJson(join(dir, 'shots.json'), { ...shots, ...(input.changedSections ? { changedSections: input.changedSections } : {}), builtBy: input.builtBy });
    return { dir };
  } catch (err) {
    await rm(dir, { recursive: true, force: true });
    throw err;
  }
}

/** A parts stage contains the manifest and generated page, retaining the reel's frozen offsets and sound mix. */
export async function stagePartsVersion(reelDir: string, manifest: PartsManifest, inputs: PartsInputs, builtBy: string, previousDir?: string): Promise<StagedVersion> {
  const html = assembleParts(manifest, inputs);
  const scan = scanPage(html);
  const issues = [...scan.issues, ...checkShotsAgainstPage(checkPartsManifest(manifest as unknown as Record<string, unknown>).shots, scan.scenes)];
  if (issues.length) throw new KinottaError('invalid', issues.map((issue) => `${issue.message} [${issue.code}]`).join('\n'));
  for (const shot of manifest.shots) for (const alternate of shot.alternates ?? []) {
    if (alternate.revision === shot.revision || alternate.dismissed) continue;
    const page = scanPage(assembleParts(manifest, inputs, { shot: shot.name, revision: alternate.revision }));
    if (page.issues.length) throw new KinottaError('invalid', page.issues.map((issue) => `${issue.message} [${issue.code}]`).join('\n'));
  }
  const dir = join(reelDir, STAGE_DIR);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir);
  const optional = async (file: string): Promise<string | null> => readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
  try {
    let page = html;
    if (previousDir) {
      if (await optional(join(previousDir, EDITS_CSS)) !== null) {
        await copyFile(join(previousDir, EDITS_CSS), join(dir, EDITS_CSS));
        page = page.replace('</head>', `<link rel="stylesheet" href="${EDITS_CSS}"></head>`);
      }
      const text = await optional(join(previousDir, MEDIA_SIDECAR_FILE));
      if (text !== null) {
        const sidecar = JSON.parse(text) as { media: MediaPlan };
        const shotAnchors = checkPartsManifest(manifest as unknown as Record<string, unknown>).shots.map((shot) => ({ id: shot.name!, start: shot.start, duration: shot.duration }));
        await writeJson(join(dir, MEDIA_SIDECAR_FILE), { ...sidecar, duration: manifest.duration, media: await preserveMedia(previousDir, dir, { ...sidecar.media, shotAnchors }) });
      }
    }
    const { frozenBy: _frozen, builtBy: _by, changedSections: _changed, ...content } = manifest as unknown as PartsManifest & Record<string, unknown>;
    await writeFile(join(dir, 'index.html'), page, 'utf8');
    await writeJson(join(dir, 'shots.json'), { ...content, builtBy });
    return { dir };
  } catch (error) { await rm(dir, { recursive: true, force: true }); throw error; }
}

/** Makes a finished stage `v<number>` with one rename. Throws when that version already exists; the stage is removed on any failure. */
export async function publishVersion(reelDir: string, staged: StagedVersion, number: number): Promise<void> {
  const target = join(reelDir, `v${number}`);
  try {
    const exists = await stat(target).then(() => true, () => false);
    if (exists) throw new KinottaError('frozen', `v${number} already exists.`);
    await rename(staged.dir, target);
  } catch (err) {
    await rm(staged.dir, { recursive: true, force: true });
    throw err;
  }
}
