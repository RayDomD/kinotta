import { execFile, spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

/**
 * The one place Kinotta starts the skill's scripts (E3), its renderer, ffprobe, ffmpeg and the startup tool check's probes. Everything else asks for a result here.
 * The scripts are the repo's own copies under skill/kinotta/.
 */

const SKILL_DIR = resolve(import.meta.dirname, '../../../skill/kinotta');
const BUILD_SCRIPT = resolve(SKILL_DIR, 'engine/build.py');
const SHOTS_SCRIPT = resolve(SKILL_DIR, 'scripts/shots.py');
const TRANSCRIPT_SCRIPT = resolve(SKILL_DIR, 'scripts/transcript.py');
const RENDER_SCRIPT = resolve(SKILL_DIR, 'engine/render.js');
const PYTHON = process.platform === 'win32' ? 'python' : 'python3';
const BUILD_TIMEOUT_MS = 120_000;
const PROBE_TIMEOUT_MS = 20_000;
const ERROR_TAIL_CHARS = 4000;
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const TRANSCODE_CRF = '20';
const TOOL_PROBE_TIMEOUT_MS = 10_000;

const exec = promisify(execFile);

/** Runs a command for the startup tool check and returns its exit code and output, or null when it cannot start. Never throws. */
export const tryCommand = (command: string, args: string[]): Promise<{ code: number; output: string } | null> =>
  new Promise((resolve) => {
    let output = '';
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, timeout: TOOL_PROBE_TIMEOUT_MS });
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('error', () => resolve(null));
    child.on('close', (code) => resolve({ code: code ?? 1, output }));
  });

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

/** Seconds of the video transcribed so far, from one line of `transcript.py --audio`'s output; null for any other line. */
export function parseProgress(line: string): number | null {
  try {
    const { progress } = JSON.parse(line) as { progress?: unknown };
    return typeof progress === 'number' && Number.isFinite(progress) ? progress : null;
  } catch {
    return null;
  }
}

/**
 * `transcript.py --audio`: the video's spoken words as a transcript.json. No timeout; a long video takes minutes.
 * The script prints progress as JSON lines while it works; each one calls `onProgress` with the seconds done.
 */
export function transcribeAudio(videoFile: string, transcriptFile: string, onProgress?: (processed: number) => void): Promise<void> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(PYTHON, [TRANSCRIPT_SCRIPT, '--audio', videoFile, transcriptFile], { windowsHide: true });
    let pending = '';
    let errors = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      const lines = (pending + chunk).split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) {
        const processed = parseProgress(line);
        if (processed !== null) onProgress?.(processed);
      }
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      errors = (errors + chunk).slice(-ERROR_TAIL_CHARS);
    });
    child.on('error', (err: NodeJS.ErrnoException) =>
      reject(new Error(err.code === 'ENOENT' ? `${PYTHON} is not installed or not on the PATH.` : `${PYTHON} failed: ${err.message}`)),
    );
    child.on('close', (code) => {
      if (code === 0) resolveRun();
      else reject(new Error(`${PYTHON} failed: ${errors.trim().split('\n').slice(-3).join(' ') || `exit code ${code}`}`));
    });
  });
}

export interface PageRender {
  /** The version page to render. */
  page: string;
  /** The file to write; its extension picks the container. */
  out: string;
  fps: number;
  /** The page's device scale factor: 0.5 is half size. */
  scale: number;
  crf: number;
  /** Four samples per frame across a 180° shutter, or one. */
  blur: boolean;
  codec: 'h264' | 'prores';
}

/** What `render.js` reports before its first frame. */
export interface RenderedPage {
  width: number;
  height: number;
  frames: number;
}

/** One line of `render.js --progress`: frames done, or the page's size and frame count; null for any other line. */
function parseRenderLine(line: string): { done: number; frames: number } | RenderedPage | null {
  try {
    const parsed = JSON.parse(line) as { frame?: unknown; frames?: unknown; width?: unknown; height?: unknown };
    if (typeof parsed.frames !== 'number') return null;
    if (typeof parsed.frame === 'number') return { done: parsed.frame, frames: parsed.frames };
    if (typeof parsed.width === 'number' && typeof parsed.height === 'number') return { width: parsed.width, height: parsed.height, frames: parsed.frames };
    return null;
  } catch {
    return null;
  }
}

/**
 * `render.js` (R14): the page frame by frame into a video. No timeout; a long page takes minutes. `onProgress` gets the
 * frames done and the total after each frame. Resolves with the page's rendered size; a failure rejects with the reason.
 */
export function renderPage(job: PageRender, onProgress?: (done: number, frames: number) => void): Promise<RenderedPage> {
  const args = [RENDER_SCRIPT, job.page, job.out, String(job.fps), '--scale', String(job.scale), '--crf', String(job.crf), '--codec', job.codec, '--progress'];
  if (!job.blur) args.push('--no-blur');
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, args, { windowsHide: true });
    let pending = '';
    let errors = '';
    let page: RenderedPage | null = null;
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      const lines = (pending + chunk).split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) {
        const parsed = parseRenderLine(line);
        if (parsed === null) continue;
        if ('done' in parsed) onProgress?.(parsed.done, parsed.frames);
        else page = parsed;
      }
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      errors = (errors + chunk).slice(-ERROR_TAIL_CHARS);
    });
    child.on('error', (err) => reject(new Error(`The renderer could not start: ${err.message}`)));
    child.on('close', (code) => {
      if (code === 0 && page !== null) resolveRun(page);
      else reject(new Error(`The render failed: ${renderFailure(errors) || `exit code ${code}`}`));
    });
  });
}

/** What a failed render's error output says went wrong: the first thrown error when there is one, else the last lines. */
function renderFailure(errors: string): string {
  const thrown = /\b[A-Z]\w*Error: [^\r\n]*/.exec(errors);
  return thrown ? thrown[0] : errors.trim().split('\n').slice(-3).join(' ');
}

/** ffmpeg: an H.264 and AAC copy of a video that browsers play, for HEVC or ProRes originals. The source is only read. */
export async function makePlaybackCopy(source: string, dest: string): Promise<void> {
  const args = ['-v', 'error', '-y', '-i', source, '-c:v', 'libx264', '-crf', TRANSCODE_CRF, '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', dest];
  await run('ffmpeg', args);
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
