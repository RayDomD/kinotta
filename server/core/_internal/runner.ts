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
/** `render.js --info` starts a browser and loads the page, which a large page makes slow. */
const PAGE_INFO_TIMEOUT_MS = 60_000;

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

/** The version page's own size and length, and whether it is drawn on a transparent background. */
export interface PageInfo {
  width: number;
  height: number;
  /** Seconds. */
  duration: number;
  alpha: boolean;
}

/** `render.js --info`: what the page says about itself, without rendering. Throws when the page can't be read. */
export async function pageInfo(page: string): Promise<PageInfo> {
  let output: string;
  try {
    output = (await exec(process.execPath, [RENDER_SCRIPT, page, '--info'], { encoding: 'utf8', timeout: PAGE_INFO_TIMEOUT_MS, windowsHide: true })).stdout;
  } catch (err) {
    const failure = err as Error & { stderr?: string };
    throw new Error(`The renderer could not read the page: ${renderFailure(failure.stderr ?? '') || failure.message}`);
  }
  const info = JSON.parse(output.trim().split('\n').at(-1) ?? '') as Partial<PageInfo>;
  if (typeof info.width !== 'number' || typeof info.height !== 'number' || typeof info.duration !== 'number') {
    throw new Error('The renderer could not read the page: it sets no window.DURATION.');
  }
  return { width: info.width, height: info.height, duration: info.duration, alpha: info.alpha === true };
}

export interface FootageProbe {
  width: number;
  height: number;
  /** The frame rate as ffprobe gives it, a fraction such as "30000/1001". */
  fps: string;
  audio: boolean;
}

/** ffprobe on a footage file: its picture size, frame rate and whether it has sound. */
export async function probeFootage(file: string): Promise<FootageProbe> {
  const args = ['-v', 'error', '-show_entries', 'stream=codec_type,width,height,r_frame_rate', '-of', 'json', file];
  const { streams = [] } = JSON.parse(await run('ffprobe', args, PROBE_TIMEOUT_MS)) as {
    streams?: Array<{ codec_type?: string; width?: number; height?: number; r_frame_rate?: string }>;
  };
  const video = streams.find((stream) => stream.codec_type === 'video');
  if (!video?.width || !video.height || !video.r_frame_rate) throw new Error(`ffprobe found no video in ${file}.`);
  return { width: video.width, height: video.height, fps: video.r_frame_rate, audio: streams.some((stream) => stream.codec_type === 'audio') };
}

export interface PageRender {
  /** The version page to render. */
  page: string;
  /** The file to write; its extension picks the container. */
  out: string;
  /** Frames a second: a number, or a fraction such as "30000/1001". */
  fps: string;
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

/** Calls `onLine` for each whole line of a text stream. */
function eachLine(stream: NodeJS.ReadableStream, onLine: (line: string) => void): void {
  let pending = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk: string) => {
    const lines = (pending + chunk).split('\n');
    pending = lines.pop() ?? '';
    for (const line of lines) onLine(line);
  });
}

/** `render.js` arguments for a page render to `out` (a file, or `-` for stdout), always with progress. */
function renderArgs(job: Omit<PageRender, 'out' | 'codec'>, out: string, codec: string, crf: boolean): string[] {
  const args = [RENDER_SCRIPT, job.page, out, job.fps, '--scale', String(job.scale), '--codec', codec, '--progress'];
  if (crf) args.push('--crf', String(job.crf));
  if (!job.blur) args.push('--no-blur');
  return args;
}

/** Collects one render's progress and errors from its text output. */
function renderListener(onProgress?: (done: number, frames: number) => void) {
  const state = { errors: '', page: null as RenderedPage | null };
  const onLine = (line: string): void => {
    const parsed = parseRenderLine(line);
    if (parsed === null) state.errors = (state.errors + line + '\n').slice(-ERROR_TAIL_CHARS);
    else if ('done' in parsed) onProgress?.(parsed.done, parsed.frames);
    else state.page = parsed;
  };
  return { state, onLine };
}

/**
 * `render.js` (R14): the page frame by frame into a video. No timeout; a long page takes minutes. `onProgress` gets the
 * frames done and the total after each frame. Resolves with the page's rendered size; a failure rejects with the reason.
 */
export function renderPage(job: PageRender, onProgress?: (done: number, frames: number) => void): Promise<RenderedPage> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, renderArgs(job, job.out, job.codec, job.codec === 'h264'), { windowsHide: true });
    const { state, onLine } = renderListener(onProgress);
    eachLine(child.stdout, onLine);
    eachLine(child.stderr, onLine);
    child.on('error', (err) => reject(new Error(`The renderer could not start: ${err.message}`)));
    child.on('close', (code) => {
      if (code === 0 && state.page !== null) resolveRun(state.page);
      else reject(new Error(`The render failed: ${renderFailure(state.errors) || `exit code ${code}`}`));
    });
  });
}

/** Seconds of the fade on each side of a cut with Smooth audio (R9). */
const CUT_FADE_SECONDS = 0.02;
const AUDIO_BITRATE = '192k';

export interface FootageComposite {
  footage: string;
  /** The pieces of the footage in play order, in source seconds. */
  pieces: ReadonlyArray<{ in: number; out: number }>;
  /** Frames a second, as for ffmpeg. */
  fps: string;
  width: number;
  height: number;
  crf: number;
  /** How the audio joins at a cut, or null when the footage has no sound. */
  audio: 'smooth' | 'hard' | null;
  out: string;
}

const seconds = (value: number): string => String(Math.round(value * 1e6) / 1e6);

/**
 * ffmpeg arguments that cut the footage into its pieces and lay the overlay frames read from stdin (NUT) over them: video
 * joined with hard cuts; audio with a short fade either side of each cut (Smooth) or none (Hard); H.264 and AAC out.
 */
export function compositeArgs(job: FootageComposite): string[] {
  const count = job.pieces.length;
  const labels = (prefix: string): string => job.pieces.map((_, i) => `[${prefix}${i}]`).join('');
  const graph = [`[0:v]split=${count}${labels('s')}`];
  job.pieces.forEach((piece, i) => graph.push(`[s${i}]trim=start=${seconds(piece.in)}:end=${seconds(piece.out)},setpts=PTS-STARTPTS[v${i}]`));
  graph.push(`${labels('v')}concat=n=${count}:v=1:a=0,fps=${job.fps},scale=${job.width}:${job.height},setsar=1[base]`);
  graph.push('[base][1:v]overlay=(W-w)/2:(H-h)/2:format=auto,format=yuv420p[v]');
  if (job.audio !== null) {
    graph.push(`[0:a]asplit=${count}${labels('t')}`);
    job.pieces.forEach((piece, i) => {
      const fades: string[] = [];
      if (job.audio === 'smooth' && i > 0) fades.push(`afade=t=in:st=0:d=${CUT_FADE_SECONDS}`);
      if (job.audio === 'smooth' && i < count - 1) fades.push(`afade=t=out:st=${seconds(piece.out - piece.in - CUT_FADE_SECONDS)}:d=${CUT_FADE_SECONDS}`);
      graph.push(`[t${i}]atrim=start=${seconds(piece.in)}:end=${seconds(piece.out)},asetpts=PTS-STARTPTS${fades.map((fade) => `,${fade}`).join('')}[a${i}]`);
    });
    graph.push(`${labels('a')}concat=n=${count}:v=0:a=1[a]`);
  }
  const audio = job.audio === null ? [] : ['-map', '[a]', '-c:a', 'aac', '-b:a', AUDIO_BITRATE];
  return [
    '-loglevel', 'error', '-y', '-i', job.footage, '-f', 'nut', '-i', 'pipe:0',
    '-filter_complex', graph.join(';'), '-map', '[v]', ...audio,
    '-c:v', 'libx264', '-crf', String(job.crf), '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', job.out,
  ];
}

/**
 * A footage render (R13, R18): `render.js` draws the overlay page as RGBA frames on its stdout, piped straight into
 * ffmpeg, which cuts the footage by its pieces and lays the frames on top. No intermediate file. When either process
 * fails, the other is stopped and the promise rejects with the reason.
 */
export function renderOverFootage(page: Omit<PageRender, 'out' | 'codec'>, composite: FootageComposite, onProgress?: (done: number, frames: number) => void): Promise<RenderedPage> {
  return new Promise((resolveRun, reject) => {
    const renderer = spawn(process.execPath, renderArgs(page, '-', 'rgba', false), { windowsHide: true });
    const encoder = spawn('ffmpeg', compositeArgs(composite), { windowsHide: true });
    const { state, onLine } = renderListener(onProgress);
    let encoderErrors = '';
    renderer.stdout.pipe(encoder.stdin);
    // ffmpeg gone early: its own exit says why, so the broken pipe needs no report of its own.
    encoder.stdin.on('error', () => undefined);
    eachLine(renderer.stderr, onLine);
    encoder.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      encoderErrors = (encoderErrors + chunk).slice(-ERROR_TAIL_CHARS);
    });
    let failure: string | null = null;
    const fail = (reason: string): void => {
      failure ??= reason;
      renderer.kill();
      encoder.kill();
    };
    renderer.on('error', (err) => fail(`The renderer could not start: ${err.message}`));
    encoder.on('error', (err: NodeJS.ErrnoException) => fail(err.code === 'ENOENT' ? 'ffmpeg is not installed or not on the PATH.' : `ffmpeg failed: ${err.message}`));
    const rendered = new Promise<void>((done) =>
      renderer.on('close', (code) => {
        if (code !== 0) fail(`The render failed: ${renderFailure(state.errors) || `exit code ${code}`}`);
        done();
      }),
    );
    const encoded = new Promise<void>((done) =>
      encoder.on('close', (code) => {
        if (code !== 0) fail(`ffmpeg failed: ${encoderErrors.trim().split('\n').slice(-3).join(' ') || `exit code ${code}`}`);
        done();
      }),
    );
    void Promise.all([rendered, encoded]).then(() => {
      if (failure !== null) reject(new Error(failure));
      else if (state.page === null) reject(new Error('The render failed: the renderer reported no frames.'));
      else resolveRun(state.page);
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
