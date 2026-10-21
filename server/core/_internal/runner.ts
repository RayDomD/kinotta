import { createRequire } from 'node:module';
import { delimiter } from 'node:path';
import { execFile, spawn, type ChildProcess, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { constants, setPriority } from 'node:os';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { BeatGrid } from './media-model.ts';

/**
 * The one place Kinotta starts the skill's scripts (E3), its renderer, ffprobe, ffmpeg and the startup tool check's probes. Everything else asks for a result here.
 * The scripts are the repo's own copies under skill/kinotta/.
 */

const SKILL_DIR = resolve(import.meta.dirname, '../../../skill/kinotta');
const BUILD_SCRIPT = resolve(SKILL_DIR, 'engine/build.py');
const SHOTS_SCRIPT = resolve(SKILL_DIR, 'scripts/shots.py');
const TRANSCRIPT_SCRIPT = resolve(SKILL_DIR, 'scripts/transcript.py');
const BEATS_SCRIPT = resolve(SKILL_DIR, 'scripts/beats.py');
const GENERATE_AUDIO_SCRIPT = resolve(SKILL_DIR, 'scripts/generate_audio.py');
const RENDER_SCRIPT = resolve(SKILL_DIR, 'engine/render.js');
const RUNTIME_MODULES = dirname(dirname(createRequire(import.meta.url).resolve('playwright/package.json')));
const scriptEnvironment = (): NodeJS.ProcessEnv => ({ ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', NODE_PATH: [RUNTIME_MODULES, process.env.NODE_PATH].filter(Boolean).join(delimiter) });
const PYTHON = process.platform === 'win32' ? 'python' : 'python3';
/**
 * Threads each render process may use: an ffmpeg left to itself takes one per core, so a parallel render's segments
 * would each try to fill the machine. The render's worker count is sized from the same budget.
 */
export const RENDER_THREADS = 4;
const BUILD_TIMEOUT_MS = 120_000;
/** Loading the model and 100 inference steps take about half a minute on a laptop GPU. A cold first load is slower. */
const GENERATE_AUDIO_TIMEOUT_MS = 600_000;
const PROBE_TIMEOUT_MS = 20_000;
const ERROR_TAIL_CHARS = 4000;
const MAX_AGENT_EVENT_CHARS = 1024 * 1024;
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const TRANSCODE_CRF = '20';
/** The editor draws pictures in a 1920x1080 frame; a wider playback copy only costs decode time. */
const PLAYBACK_MAX_WIDTH = 1920;
const PLAYBACK_KEYFRAME_SECONDS = 0.5;
const TOOL_PROBE_TIMEOUT_MS = 10_000;
const WAVEFORM_BUCKETS = 1024;
const WAVEFORM_SAMPLE_RATE = 48000;
/** `render.js --info` starts a browser and loads the page, which a large page makes slow. */
const PAGE_INFO_TIMEOUT_MS = 60_000;
const CANCELLED = 'The render was cancelled.';

const exec = promisify(execFile);
/** One source frame, preserving its aspect. Used only for cached editor thumbnails. */
export async function extractMediaStill(file: string, output: string, time: number, width: number): Promise<void> {
  await run('ffmpeg', ['-v', 'error', '-y', '-ss', String(time), '-i', file, '-frames:v', '1', '-vf', `scale=${width}:-2`, '-q:v', '4', output], PROBE_TIMEOUT_MS);
}

/** Local beat analysis emits JSON, with the same optional runtime as the skill command. */
export async function detectAudioBeats(file: string): Promise<BeatGrid> {
  return JSON.parse(await run(PYTHON, [BEATS_SCRIPT, file])) as BeatGrid;
}

/** `generate_audio.py`: a WAV from a local Stable Audio Open model. Aborting the signal stops the process. */
export async function generateStableAudio(request: { prompt: string; seconds: number; seed: number; model: string; output: string; signal?: AbortSignal }): Promise<void> {
  await run(PYTHON, [GENERATE_AUDIO_SCRIPT, '--prompt', request.prompt, '--seconds', String(request.seconds), '--model', request.model, '--seed', String(request.seed), request.output], GENERATE_AUDIO_TIMEOUT_MS, request.signal);
}

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
async function run(command: string, args: string[], timeout?: number, signal?: AbortSignal): Promise<string> {
  try {
    return (await exec(command, args, { encoding: 'utf8', maxBuffer: MAX_OUTPUT_BYTES, timeout, signal, windowsHide: true, env: scriptEnvironment() })).stdout;
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
  /** ProRes only: `render.js --prores-profile`, 4 (4444) unless given. */
  proresProfile?: string;
  /** Only these frames, `[from, to)`: one segment of a parallel render. */
  frames?: readonly [number, number];
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
  if (codec === 'prores' && job.proresProfile !== undefined) args.push('--prores-profile', job.proresProfile);
  if (job.frames !== undefined) args.push('--frames', `${job.frames[0]}:${job.frames[1]}`);
  args.push('--threads', String(RENDER_THREADS));
  return args;
}

/** ffmpeg arguments held to `RENDER_THREADS`: each input's decoder, the filters and the encoder before the output. */
function threaded(args: string[]): string[] {
  const limit = ['-threads', String(RENDER_THREADS)];
  const out = args.flatMap((arg) => (arg === '-i' ? [...limit, arg] : [arg]));
  return [...out.slice(0, -1), '-filter_threads', String(RENDER_THREADS), ...limit, out[out.length - 1]!];
}

/**
 * Starts a render process below normal priority, so the editor and the rest of the machine stay responsive. On Windows
 * the Chromium and ffmpeg a renderer starts inherit it. ffmpeg is also held to its thread budget.
 */
function spawnRender(command: string, args: string[]): ChildProcessWithoutNullStreams {
  const child = spawn(command, command === 'ffmpeg' ? threaded(args) : args, { windowsHide: true });
  if (child.pid !== undefined) {
    try { setPriority(child.pid, constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* the process may already be gone */ }
  }
  return child;
}

/**
 * Stops a process and everything it started, resolving once they are gone. On Windows a killed Node leaves its Chromium and
 * ffmpeg running, so the whole tree goes; elsewhere SIGTERM lets Playwright close its browser.
 */
function killTree(child: ChildProcess): Promise<void> {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  if (process.platform !== 'win32') {
    child.kill('SIGTERM');
    return Promise.resolve();
  }
  return new Promise((done) => {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    killer.on('error', () => {
      child.kill();
      done();
    });
    killer.on('close', () => done());
  });
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
 * When `signal` aborts, the renderer and everything it started are stopped, and it rejects once they are gone.
 */
export function renderPage(job: PageRender, onProgress?: (done: number, frames: number) => void, signal?: AbortSignal): Promise<RenderedPage> {
  return new Promise((resolveRun, reject) => {
    const child = spawnRender(process.execPath, renderArgs(job, job.out, job.codec, job.codec === 'h264'));
    const { state, onLine } = renderListener(onProgress);
    eachLine(child.stdout, onLine);
    eachLine(child.stderr, onLine);
    let stopped: Promise<void> = Promise.resolve();
    const stop = (): void => void (stopped = killTree(child));
    if (signal?.aborted) stop();
    else signal?.addEventListener('abort', stop, { once: true });
    child.on('error', (err) => reject(new Error(`The renderer could not start: ${err.message}`)));
    child.on('close', (code) => {
      signal?.removeEventListener('abort', stop);
      if (signal?.aborted) void stopped.then(() => reject(new Error(CANCELLED)));
      else if (code === 0 && state.page !== null) resolveRun(state.page);
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
  /** Stops after this many frames: a segment's stretch of footage can round to one frame more than its overlay. */
  frames?: number;
}

const seconds = (value: number): string => String(Math.round(value * 1e6) / 1e6);

/**
 * The audio filter graph for the footage's pieces from input `input`, labelled `[a]`: each piece trimmed, with a short fade
 * either side of each cut (Smooth) or none (Hard), then joined.
 */
function audioGraph(pieces: FootageComposite['pieces'], audio: 'smooth' | 'hard', input: string): string[] {
  const count = pieces.length;
  const labels = pieces.map((_, i) => `[a${i}]`).join('');
  const graph = [`[${input}]asplit=${count}${pieces.map((_, i) => `[t${i}]`).join('')}`];
  pieces.forEach((piece, i) => {
    const fades: string[] = [];
    if (audio === 'smooth' && i > 0) fades.push(`afade=t=in:st=0:d=${CUT_FADE_SECONDS}`);
    if (audio === 'smooth' && i < count - 1) fades.push(`afade=t=out:st=${seconds(piece.out - piece.in - CUT_FADE_SECONDS)}:d=${CUT_FADE_SECONDS}`);
    graph.push(`[t${i}]atrim=start=${seconds(piece.in)}:end=${seconds(piece.out)},asetpts=PTS-STARTPTS${fades.map((fade) => `,${fade}`).join('')}[a${i}]`);
  });
  graph.push(`${labels}concat=n=${count}:v=0:a=1[a]`);
  return graph;
}

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
  if (job.audio !== null) graph.push(...audioGraph(job.pieces, job.audio, '0:a'));
  const audio = job.audio === null ? [] : ['-map', '[a]', '-c:a', 'aac', '-b:a', AUDIO_BITRATE];
  return [
    '-loglevel', 'error', '-y', '-i', job.footage, '-f', 'nut', '-i', 'pipe:0',
    '-filter_complex', graph.join(';'), '-map', '[v]', ...audio,
    ...(job.frames === undefined ? [] : ['-frames:v', String(job.frames)]),
    '-c:v', 'libx264', '-crf', String(job.crf), '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', job.out,
  ];
}

/**
 * A footage render (R13, R18): `render.js` draws the overlay page as RGBA frames on its stdout, piped straight into
 * ffmpeg, which cuts the footage by its pieces and lays the frames on top. No intermediate file. When either process
 * fails, or `signal` aborts, both are stopped with everything they started and the promise rejects with the reason.
 */
export function renderOverFootage(page: Omit<PageRender, 'out' | 'codec'>, composite: FootageComposite, onProgress?: (done: number, frames: number) => void, signal?: AbortSignal): Promise<RenderedPage> {
  return new Promise((resolveRun, reject) => {
    const renderer = spawnRender(process.execPath, renderArgs(page, '-', 'rgba', false));
    const encoder = spawnRender('ffmpeg', compositeArgs(composite));
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
    let stopped: Promise<unknown> = Promise.resolve();
    const fail = (reason: string): void => {
      if (failure !== null) return;
      failure = reason;
      stopped = Promise.all([killTree(renderer), killTree(encoder)]);
    };
    const cancel = (): void => fail(CANCELLED);
    if (signal?.aborted) cancel();
    else signal?.addEventListener('abort', cancel, { once: true });
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
    void Promise.all([rendered, encoded]).then(async () => {
      signal?.removeEventListener('abort', cancel);
      await stopped;
      if (failure !== null) reject(new Error(failure));
      else if (state.page === null) reject(new Error('The render failed: the renderer reported no frames.'));
      else resolveRun(state.page);
    });
  });
}

/** The footage's sound for a joined render: the pieces, cut as `audio` says. */
export interface JoinAudio {
  footage: string;
  pieces: FootageComposite['pieces'];
  audio: 'smooth' | 'hard';
}

/**
 * ffmpeg arguments that join the segments a concat list names into `out` without re-encoding them. With `audio`, the
 * footage's sound is encoded once over all its pieces, as a single-page render does, and laid under the joined video.
 */
export function joinArgs(list: string, out: string, audio: JoinAudio | null): string[] {
  const inputs = ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list];
  const faststart = out.endsWith('.mp4') ? ['-movflags', '+faststart'] : [];
  if (audio === null) return [...inputs, '-c', 'copy', ...faststart, out];
  return [
    ...inputs, '-i', audio.footage, '-filter_complex', audioGraph(audio.pieces, audio.audio, '1:a').join(';'),
    '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', AUDIO_BITRATE, ...faststart, out,
  ];
}

/** ffmpeg joining a parallel render's segments (see `joinArgs`). When `signal` aborts, ffmpeg is stopped and it rejects. */
export function joinSegments(list: string, out: string, audio: JoinAudio | null, signal?: AbortSignal): Promise<void> {
  return new Promise((resolveRun, reject) => {
    const child = spawnRender('ffmpeg', joinArgs(list, out, audio));
    let errors = '';
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (errors = (errors + chunk).slice(-ERROR_TAIL_CHARS)));
    let stopped: Promise<void> = Promise.resolve();
    const stop = (): void => void (stopped = killTree(child));
    if (signal?.aborted) stop();
    else signal?.addEventListener('abort', stop, { once: true });
    child.on('error', (err: NodeJS.ErrnoException) => reject(new Error(err.code === 'ENOENT' ? 'ffmpeg is not installed or not on the PATH.' : `ffmpeg failed: ${err.message}`)));
    child.on('close', (code) => {
      signal?.removeEventListener('abort', stop);
      if (signal?.aborted) void stopped.then(() => reject(new Error(CANCELLED)));
      else if (code === 0) resolveRun();
      else reject(new Error(`ffmpeg could not join the segments: ${errors.trim().split('\n').slice(-3).join(' ') || `exit code ${code}`}`));
    });
  });
}

/** What a failed render's error output says went wrong: the first thrown error when there is one, else the last lines. */
function renderFailure(errors: string): string {
  const thrown = /\b(?:[A-Z]\w*)?Error: [^\r\n]*/.exec(errors);
  return thrown ? thrown[0] : errors.trim().split('\n').slice(-3).join(' ');
}

/**
 * Shows a file in the system's file manager: selected in Explorer or Finder, its folder elsewhere. It doesn't wait for
 * the window, and a file manager that can't start is ignored.
 */
export function revealInFolder(file: string): void {
  const child =
    process.platform === 'win32'
      ? // Explorer reads `/select,` and the quoted path as one argument, so it is passed as written.
        spawn('explorer.exe', [`/select,"${file}"`], { stdio: 'ignore', detached: true, windowsVerbatimArguments: true })
      : process.platform === 'darwin'
        ? spawn('open', ['-R', file], { stdio: 'ignore', detached: true })
        : spawn('xdg-open', [dirname(file)], { stdio: 'ignore', detached: true });
  child.on('error', () => undefined);
  child.unref();
}

/**
 * ffmpeg: an H.264 and AAC copy of a video that browsers play, for HEVC or ProRes originals. The source is only read.
 * Sized for the editor (no wider than its 1920 px frame) with a keyframe every half second, so a seek decodes few
 * frames. Renders read the original, so this costs no output quality. `ultrafast` makes the copy about 30% sooner than
 * `veryfast` for a file about 3.5x larger; only the editor plays it.
 */
export async function makePlaybackCopy(source: string, dest: string): Promise<void> {
  const args = ['-v', 'error', '-y', '-i', source, '-vf', `scale='min(${PLAYBACK_MAX_WIDTH},iw)':-2`,
    '-force_key_frames', `expr:gte(t,n_forced*${PLAYBACK_KEYFRAME_SECONDS})`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', TRANSCODE_CRF, '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', dest];
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

/** Original-sound peaks, with a bounded number of buckets and no automatic level changes. */
export async function waveformPeaks(file: string, duration: number): Promise<number[]> {
  const samples = Math.max(1, Math.ceil(duration * WAVEFORM_SAMPLE_RATE / WAVEFORM_BUCKETS));
  const filter = `aresample=${WAVEFORM_SAMPLE_RATE},asetnsamples=n=${samples}:p=0,astats=metadata=1:reset=1,ametadata=mode=print:key=lavfi.astats.Overall.Peak_level:file=-`;
  const output = await run('ffmpeg', ['-v', 'error', '-i', file, '-vn', '-af', filter, '-f', 'null', '-'], BUILD_TIMEOUT_MS);
  const peaks = [...output.matchAll(/lavfi\.astats\.Overall\.Peak_level=([^\r\n]+)/g)].map((match) => {
    const db = Number(match[1]);
    return Number.isFinite(db) ? 10 ** (db / 20) : 0;
  });
  if (!peaks.length) throw new Error('No sound peaks could be prepared.');
  return peaks;
}

/**
 * The peak of each measuring window of a mix, linear (1 is full scale), from `mediaMixArgs`. The mix is measured as the
 * render makes it, so nothing is estimated.
 */
export async function mixPeaks(args: string[]): Promise<number[]> {
  const output = await run('ffmpeg', args, BUILD_TIMEOUT_MS);
  return [...output.matchAll(/lavfi\.astats\.Overall\.Peak_level=([^\r\n]+)/g)].map((match) => {
    const db = Number(match[1]);
    return Number.isFinite(db) ? 10 ** (db / 20) : 0;
  });
}

/** Compose native media with one whole-reel audio mix. Cancellation waits for the encoder to stop. */
export function encodeMedia(args: string[], signal: AbortSignal): Promise<void> {
  return new Promise((resolveRun, reject) => {
    const child = spawnRender('ffmpeg', args);
    let errors = '';
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (errors = (errors + chunk).slice(-ERROR_TAIL_CHARS)));
    let stopped: Promise<void> = Promise.resolve();
    const stop = (): void => void (stopped = killTree(child));
    if (signal.aborted) stop();
    else signal.addEventListener('abort', stop, { once: true });
    child.on('error', (err) => reject(new Error(`The media encoder could not start: ${err.message}`)));
    child.on('close', (code) => {
      signal.removeEventListener('abort', stop);
      if (signal.aborted) void stopped.then(() => reject(new Error(CANCELLED)));
      else if (code === 0) resolveRun();
      else reject(new Error(`The media render failed: ${errors.trim() || `exit code ${code}`}`));
    });
  });
}

export interface MediaProbe {
  duration: number;
  codec: string;
  audio: boolean;
  width?: number;
  height?: number;
}

/** Probe original sound, image or video bytes before a library entry can become ready. */
export async function probeMedia(file: string, kind: 'video' | 'audio' | 'image'): Promise<MediaProbe> {
  const parsed = JSON.parse(await run('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height:format=duration', '-of', 'json', file], PROBE_TIMEOUT_MS)) as {
    streams?: { codec_type?: string; codec_name?: string; width?: number; height?: number }[];
    format?: { duration?: string };
  };
  const stream = parsed.streams?.find((s) => s.codec_type === (kind === 'audio' ? 'audio' : 'video'));
  const duration = kind === 'image' ? 0 : Number(parsed.format?.duration);
  if (!stream?.codec_name || !Number.isFinite(duration) || (kind !== 'image' && duration <= 0)) throw new Error(`ffprobe found no readable ${kind} in ${file}.`);
  return { duration, codec: stream.codec_name, audio: parsed.streams!.some((s) => s.codec_type === 'audio'), ...(stream.width && stream.height ? { width: stream.width, height: stream.height } : {}) };
}

/** Packaged authoring instructions, resolved from the installed server rather than the user's project. */
export const agentSkillDirectory = (): string => SKILL_DIR;
export interface AgentCommand { command: string; prefix: string[] }
export const CLAUDE_BROLL_TOOLS = 'Read,Write,Edit,Glob,Grep,Bash';
export const CLAUDE_BROLL_ALLOWED_TOOLS = 'Read,Write,Edit,Glob,Grep,Bash(python *),Bash(python3 *),Bash(node *)';

/** npm's Windows shim is not an executable. Run its Node entry without a shell. */
export async function agentCommand(provider: 'claude' | 'codex'): Promise<AgentCommand> {
  if (process.platform !== 'win32') return { command: provider, prefix: [] };
  const { access } = await import('node:fs/promises');
  const { delimiter, join } = await import('node:path');
  for (const folder of (process.env.PATH ?? '').split(delimiter)) {
    const command = provider === 'claude' ? join(folder, 'claude.exe') : join(folder, 'node_modules/@openai/codex/bin/codex.js');
    if (await access(command).then(() => true, () => false)) return provider === 'claude' ? { command, prefix: [] } : { command: process.execPath, prefix: [command] };
  }
  throw new Error(`${provider} is not installed or not on the PATH.`);
}

export interface AgentLaunch {
  provider: 'claude' | 'codex';
  cwd: string;
  prompt: string;
  signal: AbortSignal;
  onOutput(): void;
  /** Test seam for a local fake process. Never accepted from HTTP. */
  executable?: AgentCommand;
}

export function agentArguments(provider: 'claude' | 'codex'): string[] {
  return provider === 'claude'
    ? ['-p', '--verbose', '--output-format', 'stream-json', '--permission-mode', 'acceptEdits', '--permission-prompts', 'none', '--tools', CLAUDE_BROLL_TOOLS, '--allowedTools', CLAUDE_BROLL_ALLOWED_TOOLS, '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--setting-sources', '', '--disable-slash-commands', '--no-session-persistence']
    : ['exec', '--json', '--sandbox', 'workspace-write', '--skip-git-repo-check', '--ephemeral', '-'];
}

/** Fresh headless process, prompt on stdin, bounded protocol parsing, and whole-tree cancellation. */
export async function launchAgent(input: AgentLaunch): Promise<void> {
  if (input.signal.aborted) throw new Error('Agent cancelled.');
  const executable = input.executable ?? await agentCommand(input.provider);
  if (input.signal.aborted) throw new Error('Agent cancelled.');
  await new Promise<void>((done, reject) => {
    const child = spawn(executable.command, [...executable.prefix, ...(input.executable ? [] : agentArguments(input.provider))], {
      cwd: input.cwd, env: scriptEnvironment(), windowsHide: true, shell: false, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'],
    });
    let pending = '';
    let providerFailure = false;
    let completed = false;
    let stopping: Promise<void> | undefined;
    const consume = (line: string): void => {
      try {
        const event = JSON.parse(line) as { type?: string; subtype?: string; is_error?: boolean; item?: { type?: string } };
        if (event.type === 'result') {
          completed = event.subtype === 'success' && !event.is_error;
          if (!completed) providerFailure = true;
        }
        if (event.type === 'turn.completed') completed = true;
        if (event.type === 'error' || event.type === 'turn.failed' || event.item?.type === 'error') providerFailure = true;
      } catch { /* Non-JSON diagnostics are not evidence of success. */ }
    };
    const stop = (): void => {
      stopping ??= process.platform === 'win32' ? killAgentTree(child) : Promise.resolve().then(() => {
        if (child.pid !== undefined) { try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; } }
      });
      void stopping.catch(reject);
    };
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      input.onOutput();
      const lines = (pending + chunk).split('\n');
      pending = (lines.pop() ?? '').slice(-MAX_AGENT_EVENT_CHARS);
      for (const line of lines) consume(line);
    });
    child.stderr.on('data', () => input.onOutput());
    child.stdin.on('error', () => { /* A process that exits before reading stdin is handled by close. */ });
    child.on('error', () => reject(new Error('The agent could not start. Check its installation and authentication.')));
    child.on('close', (code) => {
      input.signal.removeEventListener('abort', stop);
      consume(pending);
      void (stopping ?? Promise.resolve()).then(() => {
        if (input.signal.aborted) reject(new Error('Agent cancelled.'));
        else if (code !== 0 || providerFailure || !completed) reject(new Error('The agent failed. Check its authentication, quota and tool permissions, then Retry or Copy request.'));
        else done();
      }, reject);
    });
    input.signal.addEventListener('abort', stop, { once: true });
    if (input.signal.aborted) stop();
    child.stdin.end(input.prompt, 'utf8');
  });
}

export class AgentTreeStopError extends Error {}

/** Unlike the legacy render helper, a failed tree termination must remain visible to the caller. */
function killAgentTree(child: ChildProcess): Promise<void> {
  if (child.pid === undefined || child.exitCode !== null) return Promise.resolve();
  return new Promise((done, reject) => {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    killer.on('error', () => reject(new AgentTreeStopError('Could not stop the agent process tree. Stop it manually and restart Kinotta before Retry.')));
    killer.on('close', (code) => {
      if (code === 0 || child.exitCode !== null || child.signalCode !== null) done();
      else reject(new AgentTreeStopError('Could not stop the agent process tree. Stop it manually and restart Kinotta before Retry.'));
    });
  });
}

/** Execute the page/seek contract before a private agent stage can become Working. */
export async function validateAgentPage(file: string, duration: number, signal: AbortSignal): Promise<void> {
  const { chromium } = await import('playwright');
  const { pathToFileURL, fileURLToPath } = await import('node:url');
  const { relative, isAbsolute, sep } = await import('node:path');
  const root = dirname(file);
  const browser = await chromium.launch({ headless: true });
  const stop = (): void => { void browser.close(); };
  const ceiling = setTimeout(stop, PAGE_INFO_TIMEOUT_MS);
  signal.addEventListener('abort', stop, { once: true });
  try {
    if (signal.aborted) throw new Error('Agent cancelled.');
    const page = await browser.newPage();
    const failures: string[] = [];
    await page.route('**/*', async (route) => {
      const url = route.request().url();
      if (url.startsWith('data:')) { await route.continue(); return; }
      if (url.startsWith('file:')) {
        const path = relative(root, fileURLToPath(url));
        if (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`)) { await route.continue(); return; }
      }
      failures.push('external resource');
      await route.abort();
    });
    page.on('pageerror', () => failures.push('page script error'));
    page.on('requestfailed', () => failures.push('missing resource'));
    await page.goto(pathToFileURL(file).href, { waitUntil: 'load', timeout: PAGE_INFO_TIMEOUT_MS });
    const result = await page.evaluate(async (expected) => {
      const win = window as unknown as { DURATION?: number; seek?: (time: number) => unknown };
      if (typeof win.seek !== 'function' || !Number.isFinite(win.DURATION) || Math.abs(win.DURATION! - expected) > 0.01) return false;
      for (const time of [0, expected / 2, Math.max(0, expected - 0.01), 0]) await win.seek(time);
      return true;
    }, duration);
    if (!result || failures.length) throw new Error('Agent output failed the page/seek or local asset check.');
  } finally {
    clearTimeout(ceiling);
    signal.removeEventListener('abort', stop);
    await browser.close();
  }
}
