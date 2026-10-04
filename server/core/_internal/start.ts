import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { KinottaError } from './errors.ts';
import { probeVideo, transcribeAudio } from './runner.ts';
import type { NewReel, StartedReel, Transcriber } from './types.ts';
import { isVideoFile, posix, titleFromFile } from './videos.ts';
import { publishVersion, stageVersion } from './version-build.ts';

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

/**
 * Starts a reel from a video that stays where it is: writes reel.json and a plan of one piece with captions on and
 * no clips, transcribes, writes the transcript and builds v1 (which keeps its own copies of both, E14). A transcription or build failure leaves the reel
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
  const plan = {
    title,
    video: posix(relative(dirname(planFile), file)),
    transcript: 'transcript.json',
    captions: true,
    duration,
    pieces: [{ in: 0, out: duration }],
    clips: [],
    sections: [{ id: 'all', name: title, start: 0, end: duration }],
  };
  await writeJson(planFile, plan);
  const words = await transcriber(file);
  await writeJson(join(reelDir, 'transcript.json'), { words });
  await publishVersion(reelDir, await stageVersion(reelDir, { plan, planDir: reelDir, words, builtBy: BUILT_BY_YOU }), 1);
  return { slug };
}
