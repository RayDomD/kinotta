import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { withReelLock, writeJsonAtomic } from './edit-list.ts';
import { BUILT_BY_YOU } from './edit-model.ts';
import { KinottaError } from './errors.ts';
import { ensurePlaybackCopy, needsPlaybackCopy } from './import.ts';
import { probeVideo, transcribeAudio } from './runner.ts';
import { briefRequest } from './requests.ts';
import { autoSections } from './transcription.ts';
import type { Transcriptions } from './transcription.ts';
import type { NewBriefReel, NewReel, StartedBriefReel, StartedReel, Transcriber } from './types.ts';
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

/**
 * Starts a reel from a video that stays where it is: writes reel.json and a plan of one piece with captions on and
 * no clips, and returns. The transcription then runs in the background (the video plays and edits collect meanwhile): its
 * words become the reel's transcript, the plan gets its transcript and automatic sections, and v1 is built from it (which
 * keeps its own copies of both, E14). A failure leaves the reel without a version and is reported through `jobs`.
 */
export async function startReel(projectDir: string, transcriber: Transcriber, jobs: Transcriptions, input: NewReel): Promise<StartedReel> {
  const file = await resolveVideo(projectDir, input.video);
  const probe = await probeVideo(file);
  // Made before the reel exists, so Review never opens on footage the browser cannot play and a failed copy leaves no reel.
  if (needsPlaybackCopy(probe.codec)) await ensurePlaybackCopy(projectDir, file);
  const title = input.title?.trim() || titleFromFile(file);
  const { slug, dir: reelDir } = await makeReelDir(join(projectDir, REELS_DIR), title);
  const footage = posix(relative(resolve(projectDir), file));
  const duration = Math.round(probe.duration * MS_PER_SECOND) / MS_PER_SECOND;
  const planFile = join(reelDir, 'plan.json');

  await writeJson(join(reelDir, 'reel.json'), { title, footage });
  const plan = {
    title,
    video: posix(relative(dirname(planFile), file)),
    captions: true,
    duration,
    pieces: [{ in: 0, out: duration }],
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
  });
  return { slug };
}

/**
 * Starts a reel from a short brief: writes reel.json with the title and the brief, and nothing else. The reel has no
 * version until whoever builds it writes one, and shows as waiting until then.
 */
export async function startReelFromBrief(projectDir: string, input: NewBriefReel): Promise<StartedBriefReel> {
  const title = typeof input?.title === 'string' ? input.title.trim() : '';
  const brief = typeof input?.brief === 'string' ? input.brief.trim() : '';
  if (title === '') throw new KinottaError('invalid', 'A reel needs a name.');
  if (brief === '') throw new KinottaError('invalid', 'A reel started from a brief needs the brief.');
  const { slug, dir } = await makeReelDir(join(projectDir, REELS_DIR), title);
  await writeJson(join(dir, 'reel.json'), { title, brief });
  return { slug, request: briefRequest(slug, title, brief) };
}
