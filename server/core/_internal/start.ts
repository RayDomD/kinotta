import { readAgentSettings } from './agent-settings.ts';
import { engineCaptions, makeOptions } from './make-options.ts';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { addOperation, withReelLock, writeJsonAtomic } from './edit-list.ts';
import { BUILT_BY_YOU } from './edit-model.ts';
import { KinottaError } from './errors.ts';
import { ensurePlaybackCopy, ensureProxyAndAudio, needsPlaybackCopy } from './import.ts';
import { probeVideo, transcribeAudio, waveformPeaks } from './runner.ts';
import { checkDeadAir, DEAD_AIR_BY, deadAirCuts } from './dead-air.ts';
import type { Piece } from './pieces.ts';
import { briefRequest } from './requests.ts';
import { agentTold, frameOf, styleMakeOptions } from './direction.ts';
import { stateFilePath } from './state.ts';
import { copyStyleToReel, readStyle, validateStyle, type Style } from './style.ts';
import { autoSections } from './transcription.ts';
import type { Transcriptions } from './transcription.ts';
import type { NewBriefReel, NewReel, StartedBriefReel, StartedReel, StyleChoice, Transcriber } from './types.ts';
import { isVideoFile, posix, titleFromFile } from './videos.ts';
import { publishVersion, stageVersion } from './version-build.ts';

const REELS_DIR = 'reels';
const MS_PER_SECOND = 1000;

const slugify = (title: string): string => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'reel';

/** Creates the reel's folder under a slug not yet taken: "talk", then "talk-2", "talk-3". */
async function makeReelDir(reelsDir: string, title: string): Promise<{ slug: string; dir: string }> {
  await mkdir(reelsDir, { recursive: true });
  const base = slugify(title);
  for (let n = 1; ; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    try {
      await mkdir(join(reelsDir, slug));
      return { slug, dir: join(reelsDir, slug) };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
  }
}

/** The video as an absolute path, checked to be a video file inside the project and outside reels/. */
async function resolveVideo(projectDir: string, video: string): Promise<string> {
  const root = resolve(projectDir);
  const file = resolve(root, video);
  const inProject = file.startsWith(root + sep) && !file.startsWith(join(root, REELS_DIR) + sep);
  if (!inProject || !isVideoFile(file)) throw new KinottaError('invalid', `${video} is not a video in this project.`);
  try {
    if ((await stat(file)).isFile()) return file;
  } catch {
    // falls through to not-found
  }
  throw new KinottaError('not-found', `${video} was not found in this project.`);
}

const writeJson = (file: string, value: unknown): Promise<void> => writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');

interface ChosenStyle { style: Style; saved: boolean }

/** The style a new reel asks for, checked before anything is written: a saved one by id, or Direction's own. */
async function chosenStyle(projectDir: string, choice: StyleChoice | undefined): Promise<ChosenStyle | undefined> {
  if (choice === undefined) return undefined;
  if (!choice || typeof choice !== 'object' || Array.isArray(choice)) throw new KinottaError('invalid', 'Expected a style.');
  if ('scope' in choice) return { style: validateStyle(choice), saved: false };
  return { style: await readStyle(projectDir, (choice as { id: string }).id), saved: true };
}

/** Writes the reel's own copy of its style, so editing the saved style later never changes this reel. */
async function storeReelStyle(projectDir: string, slug: string, chosen: ChosenStyle): Promise<Style> {
  if (chosen.saved) return copyStyleToReel(projectDir, slug, { id: chosen.style.id });
  // Direction's edited style has no saved file to copy from; it goes where copyStyleToReel puts a reel's copy.
  const copy = validateStyle({ ...chosen.style, scope: 'project', basedOn: chosen.style.basedOn ?? chosen.style.id });
  const file = join(dirname(stateFilePath(projectDir, slug, 1)), 'style.json');
  await mkdir(dirname(file), { recursive: true });
  await writeJsonAtomic(file, copy);
  return copy;
}

/** The default transcriber: the skill's audio transcription, through the runner, into a temp file read back. */
export const transcribeWithWhisper: Transcriber = async (videoFile, onProgress) => {
  const temp = join(tmpdir(), `kinotta-transcript-${process.pid}-${Date.now()}.json`);
  try {
    await transcribeAudio(videoFile, temp, onProgress);
    return (JSON.parse(await readFile(temp, 'utf8')) as { words: { text: string; start: number; end: number }[] }).words;
  } finally {
    await rm(temp, { force: true });
  }
};

function validateMade(made: unknown): void {
  if (made !== undefined && made !== 'auto' && made !== 'direct') throw new KinottaError('invalid', 'Reel origin must be auto or direct.');
}

/**
 * Starts a reel from a video that stays where it is: writes reel.json and a plan of one piece with captions on and
 * no clips, and returns. The transcription then runs in the background (the video plays and edits collect meanwhile): its
 * words become the reel's transcript, the plan gets its transcript and automatic sections, and v1 is built uncut from it
 * (which keeps its own copies of both, E14). When dead-air trimming is requested, each cut is added to the edit list
 * as a tagged snip after v1 is published. A failure leaves the reel without a version and is reported through `jobs`.
 */
export async function startReel(projectDir: string, transcriber: Transcriber, jobs: Transcriptions, input: NewReel, afterBuilt?: (slug: string) => Promise<unknown>): Promise<StartedReel> {
  validateMade(input?.made);
  const given = makeOptions(input);
  checkDeadAir(input.deadAir);
  if (typeof input.video !== 'string' || (input.title !== undefined && typeof input.title !== 'string')) throw new KinottaError('invalid', 'Choose a video and a text title.');
  const chosen = await chosenStyle(projectDir, input.style);
  // Make options given with the style win over the style's settings, so existing callers keep their meaning.
  const options = { ...(chosen ? styleMakeOptions(chosen.style) : {}), ...given };
  const file = await resolveVideo(projectDir, input.video);
  const probe = await probeVideo(file);
  // Made before the reel exists, so Review never opens on footage the browser cannot play and a failed copy leaves no reel.
  if (needsPlaybackCopy(probe.codec)) await ensurePlaybackCopy(projectDir, file);
  ensureProxyAndAudio(projectDir, file).catch(() => undefined);
  const title = input.title?.trim() || titleFromFile(file);
  const { slug, dir: reelDir } = await makeReelDir(join(projectDir, REELS_DIR), title);
  const footage = posix(relative(resolve(projectDir), file));
  const duration = Math.round(probe.duration * MS_PER_SECOND) / MS_PER_SECOND;
  const planFile = join(reelDir, 'plan.json');

  const frame = frameOf(probe.width, probe.height);
  await writeJson(join(reelDir, 'reel.json'), { title, footage, ...(input.made ? { made: input.made } : {}), ...(frame ? { frame } : {}) });
  if (chosen) await storeReelStyle(projectDir, slug, chosen);
  const plan = {
    title,
    video: posix(relative(dirname(planFile), file)),
    ...options,
    captions: engineCaptions(options.captions),
    duration,
    pieces: [{ in: 0, out: duration }] as Piece[],
    clips: [],
    sections: [{ id: 'all', name: title, start: 0, end: duration }],
  };
  await writeJson(planFile, plan);
  jobs.start(slug, duration, async (report) => {
    const words = await transcriber(file, report);
    // The transcript and the sections go into the plan under the reel's lock, so an edit being checked never sees half of them.
    const planned = { ...plan, transcript: 'transcript.json', sections: autoSections(words, duration, title) };
    await withReelLock(reelDir, async () => {
      await writeJson(join(reelDir, 'transcript.json'), { words });
      await writeJsonAtomic(planFile, planned);
    });
    const staged = await stageVersion(reelDir, { plan: planned, planDir: reelDir, words, builtBy: BUILT_BY_YOU });
    await withReelLock(reelDir, () => publishVersion(reelDir, staged, 1));
    if (input.deadAir) {
      // Peaks only find breaths, so a video without an audio track still gets its pauses cut.
      const peaks = await waveformPeaks(file, probe.duration).catch(() => undefined);
      const cuts = deadAirCuts(words, duration, { strength: input.deadAir, peaks });
      for (const cut of cuts) {
        await addOperation(projectDir, slug, { kind: 'snip', from: cut.from, to: cut.to, by: DEAD_AIR_BY });
      }
    }
    const settings = await readAgentSettings(projectDir);
    if (settings.provider === 'copy' || settings.confirmed === true || input.agentConfirmed === true) {
      await afterBuilt?.(slug);
    }
  });
  return { slug };
}

/**
 * Starts a reel from a short brief: writes reel.json with the title and the brief, and nothing else. The reel has no
 * version until whoever builds it writes one, and shows as waiting until then.
 */
export async function startReelFromBrief(projectDir: string, input: NewBriefReel): Promise<StartedBriefReel> {
  validateMade(input?.made);
  const title = typeof input?.title === 'string' ? input.title.trim() : '';
  const brief = typeof input?.brief === 'string' ? input.brief.trim() : '';
  if (title === '') throw new KinottaError('invalid', 'A reel needs a name.');
  if (brief === '') throw new KinottaError('invalid', 'A reel started from a brief needs the brief.');
  const chosen = await chosenStyle(projectDir, input.style);
  const { slug, dir } = await makeReelDir(join(projectDir, REELS_DIR), title);
  await writeJson(join(dir, 'reel.json'), { title, brief, ...(input.made ? { made: input.made } : {}) });
  const style = chosen ? await storeReelStyle(projectDir, slug, chosen) : undefined;
  return { slug, request: briefRequest(slug, title, brief, style ? agentTold(style) : undefined) };
}
