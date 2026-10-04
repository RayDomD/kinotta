import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { KinottaError } from './errors.ts';
import { buildPage, buildShots, probeVideo, transcribeAudio } from './runner.ts';
import { briefRequest } from './requests.ts';
import type { NewBriefReel, NewReel, StartedBriefReel, StartedReel, Transcriber } from './types.ts';
import { isVideoFile, posix, titleFromFile } from './videos.ts';

const REELS_DIR = 'reels';
const BUILT_BY_YOU = 'you';
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
export const transcribeWithWhisper: Transcriber = async (videoFile) => {
  const temp = join(tmpdir(), `kinotta-transcript-${process.pid}-${Date.now()}.json`);
  try {
    await transcribeAudio(videoFile, temp);
    return (JSON.parse(await readFile(temp, 'utf8')) as { words: { text: string; start: number; end: number }[] }).words;
  } finally {
    await rm(temp, { force: true });
  }
};

/** v1 of a reel Kinotta made: the page, then shots.json (with `builtBy`) last, since its appearing is the new-version signal. */
async function buildFirstVersion(reelDir: string, planFile: string): Promise<void> {
  const versionDir = join(reelDir, 'v1');
  const shotsFile = join(versionDir, 'shots.json');
  const staged = `${shotsFile}.tmp`;
  try {
    await mkdir(versionDir);
    await buildPage(planFile, join(versionDir, 'index.html'));
    await buildShots(planFile, staged);
    const shots = JSON.parse(await readFile(staged, 'utf8')) as Record<string, unknown>;
    await writeJson(staged, { ...shots, builtBy: BUILT_BY_YOU });
    await rename(staged, shotsFile);
  } catch (err) {
    await rm(versionDir, { recursive: true, force: true });
    throw err;
  }
}

/**
 * Starts a reel from a video that stays where it is: writes reel.json and a plan of one piece with captions on and
 * no clips, transcribes, writes the transcript and builds v1. A transcription or build failure leaves the reel
 * without a version, and throws the reason.
 */
export async function startReel(projectDir: string, transcriber: Transcriber, input: NewReel): Promise<StartedReel> {
  const file = await resolveVideo(projectDir, input.video);
  const probe = await probeVideo(file);
  const title = input.title?.trim() || titleFromFile(file);
  const { slug, dir: reelDir } = await makeReelDir(join(projectDir, REELS_DIR), title);
  const footage = posix(relative(resolve(projectDir), file));
  const duration = Math.round(probe.duration * MS_PER_SECOND) / MS_PER_SECOND;
  const planFile = join(reelDir, 'plan.json');

  await writeJson(join(reelDir, 'reel.json'), { title, footage });
  await writeJson(planFile, {
    title,
    video: posix(relative(dirname(planFile), file)),
    transcript: 'transcript.json',
    captions: true,
    duration,
    pieces: [{ in: 0, out: duration }],
    clips: [],
    sections: [{ id: 'all', name: title, start: 0, end: duration }],
  });
  const words = await transcriber(file);
  await writeJson(join(reelDir, 'transcript.json'), { words });
  await buildFirstVersion(reelDir, planFile);
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
