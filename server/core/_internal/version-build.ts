import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, posix, relative, resolve, sep } from 'node:path';
import type { Operation, Plan, PlanClip } from './edit-model.ts';
import { KinottaError } from './errors.ts';
import { buildPage, buildShots } from './runner.ts';
import type { TranscriptWord } from './types.ts';

/** Where a version is built before it exists: not a `v<n>` folder, and hidden from the watcher. */
const STAGE_DIR = '.save';
const SHOTS_STAGE = 'shots.stage.json';
const PUBLISHED_TRANSCRIPT = 'transcript.json';

const writeJson = (file: string, value: unknown): Promise<void> => writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');

/** The file a clip's fragment is in, relative to the plan: its "clip" path, else the engine's `clips/<id>-*.html` or `<id>-*.html`. */
async function clipPath(planDir: string, clip: PlanClip): Promise<string | undefined> {
  if (typeof clip.clip === 'string') return clip.clip;
  for (const folder of ['clips', '']) {
    try {
      const found = (await readdir(join(planDir, folder))).filter((f) => f.startsWith(`${clip.id}-`) && f.endsWith('.html')).sort()[0];
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
async function versionPlan(planDir: string, versionDir: string, plan: Plan): Promise<Plan> {
  const rebase = (path: string): string => (isAbsolute(path) ? path : relative(versionDir, resolve(planDir, path)).split(sep).join('/'));
  const copy: Plan = { ...plan };
  if (typeof copy.video === 'string') copy.video = rebase(copy.video);
  if (copy.transcript !== undefined) copy.transcript = PUBLISHED_TRANSCRIPT;
  if (Array.isArray(copy.clips)) {
    copy.clips = await Promise.all(
      copy.clips.map(async (clip) => {
        const path = await clipPath(planDir, clip);
        return path === undefined ? clip : { ...clip, clip: rebase(path) };
      }),
    );
  }
  return copy;
}

export interface StagedVersion {
  /** Absolute path of the finished stage. */
  dir: string;
}

export interface VersionInput {
  /** The folder the plan sits in: its relative paths are relative to it. */
  planDir: string;
  /** The reel's plan with every edit already in it. */
  plan: Plan;
  /** The reel's transcript words with every edit already in them. */
  words: TranscriptWord[];
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
  const dir = join(reelDir, STAGE_DIR);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir);
  try {
    const planFile = join(dir, 'plan.json');
    await writeJson(planFile, await versionPlan(input.planDir, dir, input.plan));
    await writeJson(join(dir, PUBLISHED_TRANSCRIPT), { words: input.words });
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
