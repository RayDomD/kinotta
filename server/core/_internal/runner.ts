import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

/**
 * The one place Kinotta starts the skill's scripts (E3) and ffprobe. Everything else asks for a result here.
 * The scripts are the repo's own copies under skill/kinotta/.
 */

const SKILL_DIR = resolve(import.meta.dirname, '../../../skill/kinotta');
const BUILD_SCRIPT = resolve(SKILL_DIR, 'engine/build.py');
const SHOTS_SCRIPT = resolve(SKILL_DIR, 'scripts/shots.py');
const TRANSCRIPT_SCRIPT = resolve(SKILL_DIR, 'scripts/transcript.py');
const PYTHON = process.platform === 'win32' ? 'python' : 'python3';
const BUILD_TIMEOUT_MS = 120_000;
const PROBE_TIMEOUT_MS = 20_000;
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

const exec = promisify(execFile);

/** Runs a command and returns its stdout. A failure throws an Error whose message names the tool and says why. */
async function run(command: string, args: string[], timeout?: number): Promise<string> {
  try {
    return (await exec(command, args, { encoding: 'utf8', maxBuffer: MAX_OUTPUT_BYTES, timeout, windowsHide: true })).stdout;
  } catch (err) {
    const failure = err as NodeJS.ErrnoException & { stderr?: string };
    if (failure.code === 'ENOENT') throw new Error(`${command} is not installed or not on the PATH.`);
    const detail = (failure.stderr ?? '').trim().split('\n').slice(-3).join(' ') || failure.message;
    throw new Error(`${command} failed: ${detail}`);
  }
}

/** `build.py --plan`: a plan composed into one version page. */
export async function buildPage(planFile: string, pageFile: string): Promise<void> {
  await run(PYTHON, [BUILD_SCRIPT, '--plan', planFile, pageFile], BUILD_TIMEOUT_MS);
}

/** `shots.py`: the plan's shot list as shots.json. */
export async function buildShots(planFile: string, shotsFile: string): Promise<void> {
  await run(PYTHON, [SHOTS_SCRIPT, planFile, shotsFile], BUILD_TIMEOUT_MS);
}

/** `transcript.py --audio`: the video's spoken words as a transcript.json. No timeout; a long video takes minutes. */
export async function transcribeAudio(videoFile: string, transcriptFile: string): Promise<void> {
  await run(PYTHON, [TRANSCRIPT_SCRIPT, '--audio', videoFile, transcriptFile]);
}

export interface VideoProbe {
  /** Seconds. */
  duration: number;
  /** The first video stream's codec, e.g. "h264". */
  codec: string;
  /** Bytes. */
  size: number;
}

/** ffprobe on a file. Throws when it is not a video ffprobe can read. */
export async function probeVideo(file: string): Promise<VideoProbe> {
  const args = ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name:format=duration,size', '-of', 'json', file];
  const parsed = JSON.parse(await run('ffprobe', args, PROBE_TIMEOUT_MS)) as {
    streams?: { codec_name?: string }[];
    format?: { duration?: string; size?: string };
  };
  const codec = parsed.streams?.[0]?.codec_name;
  const duration = Number(parsed.format?.duration);
  if (!codec || !Number.isFinite(duration)) throw new Error(`ffprobe found no video in ${file}.`);
  return { duration, codec, size: Number(parsed.format?.size) };
}
