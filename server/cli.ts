import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { DUCK_DEFAULTS, applyOperation, duckSpeechSpans, mediaWithTracks } from './core/model.ts';
import type { NewOperation, Plan } from './core/model.ts';
import { checkTools, missingToolsMessage, openProject, versionIssues, type Project, type RenderJob, type RenderPreset, type RenderRequest } from './core/index.ts';
import { findEditor, queueRender, requestGeneratedAudio, requestOperation, requestBuild } from './editor-client.ts';
import { DEFAULT_PORT, startServer, type RunningServer } from './main.ts';

const CHECK_COMMAND = 'kinotta check <reel> [version] [--project <dir>]';
const BUILD_USAGE = 'Usage: kinotta build <reel> [--by <name>] [--project <dir>]';
const CHECK_USAGE = `Usage: ${CHECK_COMMAND}`;
const DUCK_USAGE = 'Usage: kinotta duck --plan <file> --placement <id> --speech-track <id> [--amount <dB>] [--attack <seconds>] [--release <seconds>]';
const GENERATE_USAGE = 'Usage: kinotta generate-audio --prompt <text> --seconds <n> [--seed <n>] [--out <file.wav>] [--project <dir>]';
const RENDER_PRESETS: readonly RenderPreset[] = ['draft', 'final', 'overlay'];
/** `kinotta render`'s setting flags (R3) and the values each takes. They apply to one render and are never saved (R16). */
const SETTING_FLAGS = {
  fps: ['source', '24', '25', '30', '60'],
  size: ['half', 'source', '1080p', '4k'],
  quality: ['standard', 'high'],
  audio: ['smooth', 'hard'],
} as const;
const SETTING_USAGE = Object.entries(SETTING_FLAGS).map(([flag, values]) => `[--${flag} ${values.join('|')}]`).join(' ');
const RENDER_USAGE = `Usage: kinotta render <reel> v<n> --preset ${RENDER_PRESETS.join('|')} ${SETTING_USAGE} [--accept-overload] [--project <dir>]`;
/** `kinotta render` prints a progress line each time the job gets this much further. */
const PROGRESS_STEP_PERCENT = 10;

interface CliOptions {
  projectDir: string;
  port: number;
  open: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { projectDir: process.cwd(), port: DEFAULT_PORT, open: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--no-open') options.open = false;
    else if (arg === '--project') options.projectDir = resolve(argv[++i] ?? '');
    else if (arg === '--port') options.port = Number(argv[++i]);
    else throw new Error(`Unknown option ${arg}. Usage: kinotta [--project <dir>] [--port <n>] [--no-open], or ${CHECK_COMMAND}, or kinotta render <reel> v<n> --preset <preset> [--project <dir>]`);
  }
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) {
    throw new Error('--port needs a number from 0 to 65535');
  }
  return options;
}

function openBrowser(url: string): void {
  const [command, args] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '""', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  child.on('error', () => {});
  child.unref();
}

/** Takes `--project <dir>` out of a command's arguments: the project folder (the working directory without it) and the rest. */
function takeProject(args: string[]): { projectDir: string; rest: string[] } | null {
  const at = args.indexOf('--project');
  if (at === -1) return { projectDir: process.cwd(), rest: args };
  const dir = args[at + 1];
  if (dir === undefined || dir.startsWith('--')) return null;
  return { projectDir: resolve(dir), rest: [...args.slice(0, at), ...args.slice(at + 2)] };
}

/** Build reads the root manifest. A running editor owns the lock; otherwise the same core runs locally. */
async function build(args: string[]): Promise<number> {
  const taken = takeProject(args);
  const [slug, flag, by, ...extra] = taken?.rest ?? [];
  if (!taken || !slug || extra.length || (flag !== undefined && (flag !== '--by' || !by?.trim()))) { console.error(BUILD_USAGE); return 1; }
  try {
    const editor = await findEditor(taken.projectDir);
    const result = editor ? await requestBuild(editor, slug, by) : await openProject(taken.projectDir).buildParts(slug, by);
    console.log(`${slug} v${result.version}: no contract issues`);
    return 0;
  } catch (error) { console.error((error as Error).message); return 1; }
}

/** `kinotta check <reel> [version]` (K7): prints a version's static contract issues, then a footage reel's footage problems, one per line. Exit 1 on any. */
async function check(args: string[]): Promise<number> {
  const taken = takeProject(args);
  const [slug, versionArg, ...extra] = taken?.rest ?? [];
  const asked = versionArg === undefined ? null : Number(versionArg.replace(/^v/i, ''));
  if (taken === null || slug === undefined || extra.length > 0 || (asked !== null && !(Number.isInteger(asked) && asked > 0))) {
    console.error(CHECK_USAGE);
    return 1;
  }
  const project = openProject(taken.projectDir);
  try {
    const number = asked ?? (await project.listVersions(slug)).at(-1)?.number;
    if (number === undefined) throw new Error(`Reel "${slug}" has no versions yet.`);
    const version = await project.readVersion(slug, number);
    const issues = versionIssues(version);
    if (issues.length === 0) {
      console.log(`${slug} v${number}: no contract issues`);
      return 0;
    }
    console.log(`${slug} v${number}: ${issues.length} contract ${issues.length === 1 ? 'issue' : 'issues'}`);
    for (const issue of issues) console.log(`  ${issue.message} [${issue.code}]`);
    return 1;
  } catch (err) {
    console.error((err as Error).message);
    return 1;
  }
}

/** `<reel> v<n> --preset <preset>` and any setting flags, or null when the arguments don't read that way. */
function parseRenderArgs(args: string[]): RenderRequest | null {
  const positional: string[] = [];
  const flags: Record<string, string | undefined> = {};
  let acceptOverload = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    // The owner has heard the mix overload and renders it as it is (AM38); a flag with no value.
    if (arg === '--accept-overload') acceptOverload = true;
    else if (arg.startsWith('--')) flags[arg.slice(2)] = args[++i];
    else positional.push(arg);
  }
  const [reel, versionArg] = positional;
  const version = Number(versionArg?.replace(/^v/i, ''));
  if (positional.length !== 2 || reel === undefined || !Number.isInteger(version) || version < 1) return null;
  const { preset, fps, size, quality, audio, ...unknown } = flags;
  if (Object.keys(unknown).length > 0 || !RENDER_PRESETS.includes(preset as RenderPreset)) return null;
  const request: RenderRequest = { reel, version, preset: preset as RenderPreset, ...(acceptOverload ? { acceptOverload } : {}) };
  for (const [flag, value] of [['fps', fps], ['size', size], ['quality', quality], ['audio', audio]] as const) {
    if (value === undefined) continue;
    if (!(SETTING_FLAGS[flag] as readonly string[]).includes(value)) return null;
    Object.assign(request, { [flag]: flag === 'fps' && value !== 'source' ? Number(value) : value });
  }
  return request;
}

/** Resolves once the server's queue is empty, so jobs that joined a server this process started finish before it closes. */
function drained(project: Project): Promise<void> {
  return new Promise((done) => {
    const check = (): void => {
      if (project.renderJobs().length > 0) return;
      unsubscribe();
      done();
    };
    const unsubscribe = project.subscribe((event) => event.type === 'render-progress' && check());
    check();
  });
}

/**
 * `kinotta render <reel> v<n> --preset <preset>` (R1, R12): queues the render on the editor running for the project and
 * waits its turn; with no editor running, it starts the same server headless (no browser), which others can join, and
 * closes it once the queue is empty. Prints progress and the finished file's path. Exit 1 on a refusal or a failed render.
 */
async function render(args: string[]): Promise<number> {
  const taken = takeProject(args);
  const request = taken === null ? null : parseRenderArgs(taken.rest);
  if (taken === null || request === null) {
    console.error(RENDER_USAGE);
    return 1;
  }
  const { projectDir } = taken;
  const label = `${request.reel} v${request.version} (${request.preset})`;
  let printedStep = -1;
  const onProgress = (job: RenderJob): void => {
    if (job.state !== 'running') return;
    const step = Math.floor((job.progress * 100) / PROGRESS_STEP_PERCENT);
    if (step <= printedStep) return;
    printedStep = step;
    console.log(`Rendering ${label}: ${step * PROGRESS_STEP_PERCENT}%`);
  };
  let hosted: RunningServer | null = null;
  try {
    let url = await findEditor(projectDir);
    if (url === null) {
      hosted = await startServer({ projectDir, port: 0 });
      url = hosted.url;
    }
    const { ahead, finished } = await queueRender(url, request, onProgress);
    if (ahead > 0) console.log(`Waiting behind ${ahead} ${ahead === 1 ? 'render' : 'renders'}`);
    const job = await finished;
    if (job.state !== 'done' || job.output === undefined) {
      console.error(`Render of ${label} ${job.state === 'cancelled' ? 'was cancelled' : `failed: ${job.error ?? 'unknown reason'}`}`);
      return 1;
    }
    console.log(`Rendered ${resolve(projectDir, job.output)}`);
    return 0;
  } catch (err) {
    console.error((err as Error).message);
    return 1;
  } finally {
    if (hosted !== null) {
      await drained(hosted.project);
      await hosted.close();
    }
  }
}

/** Prints a frozen duck operation. The agent may apply its points to a plan, never the owner's edit list. */
async function duck(args: string[]): Promise<number> {
  const flags: Record<string, string> = {};
  const allowed = new Set(['plan', 'placement', 'speech-track', 'amount', 'attack', 'release']);
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i]?.slice(2);
    const value = args[i + 1];
    if (!args[i]?.startsWith('--') || !flag || !allowed.has(flag) || value === undefined || value.startsWith('--') || flag in flags) {
      console.error(DUCK_USAGE); return 1;
    }
    flags[flag] = value;
  }
  if (!flags.plan || !flags.placement || !flags['speech-track']) { console.error(DUCK_USAGE); return 1; }
  try {
    const plan = JSON.parse(await readFile(resolve(flags.plan), 'utf8')) as Plan;
    if (!plan.media) throw new Error('Ducking needs a native media plan with transcribed source words.');
    const media = mediaWithTracks(plan.media);
    const settings = { ...DUCK_DEFAULTS, ...Object.fromEntries(['amount', 'attack', 'release'].filter((key) => flags[key] !== undefined).map((key) => [key, Number(flags[key])])) };
    const spans = duckSpeechSpans(media, flags.placement, flags['speech-track'], plan.duration);
    const operation: NewOperation = { kind: 'placement-duck', placement: flags.placement, spans, ...settings };
    applyOperation({ plan: { ...plan, media }, words: [] }, { ...operation, by: 'kinotta', id: 'check' });
    console.log(JSON.stringify(operation));
    return 0;
  } catch (error) { console.error((error as Error).message); return 1; }
}

/**
 * `kinotta generate-audio`: makes a sound with the local Stable Audio Open model and adds it to the project library, the
 * same service the editor's Sound tab uses. `--out` also copies the WAV beside a code-only plan. Prints one JSON line.
 */
async function generateAudio(args: string[]): Promise<number> {
  const taken = takeProject(args);
  const flags: Record<string, string> = {};
  const allowed = new Set(['prompt', 'seconds', 'seed', 'out']);
  const rest = taken?.rest ?? [];
  let valid = taken !== null;
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i]?.slice(2);
    const value = rest[i + 1];
    if (!rest[i]?.startsWith('--') || !flag || !allowed.has(flag) || value === undefined || value.startsWith('--') || flag in flags) { valid = false; break; }
    flags[flag] = value;
  }
  if (!valid || taken === null || !flags.prompt || !flags.seconds) { console.error(GENERATE_USAGE); return 1; }
  const { projectDir } = taken;
  let hosted: RunningServer | null = null;
  try {
    let url = await findEditor(projectDir);
    if (url === null) {
      hosted = await startServer({ projectDir, port: 0 });
      url = hosted.url;
    }
    const sound = await requestGeneratedAudio(url, { prompt: flags.prompt, seconds: Number(flags.seconds), ...(flags.seed !== undefined ? { seed: Number(flags.seed) } : {}) });
    const file = resolve(projectDir, sound.path);
    if (flags.out) {
      await mkdir(dirname(resolve(flags.out)), { recursive: true });
      await copyFile(file, resolve(flags.out));
    }
    console.log(JSON.stringify({ source: sound.id, name: sound.name, path: file, ...(flags.out ? { out: resolve(flags.out) } : {}), duration: sound.duration, prompt: sound.prompt, seconds: sound.seconds, seed: sound.seed }));
    return 0;
  } catch (error) { console.error((error as Error).message); return 1; }
  finally { if (hosted !== null) await hosted.close(); }
}

async function edit(args: string[]): Promise<number> {
  const taken = takeProject(args);
  if (taken === null || taken.rest.length !== 4 || taken.rest[1] !== '--by' || !taken.rest[2]?.trim()) {
    console.error('Usage: kinotta edit <reel> --by <name> <operation json> [--project <dir>]');
    return 1;
  }
  let hosted: RunningServer | null = null;
  try {
    const operation: NewOperation = JSON.parse(taken.rest[3]!);
    let url = await findEditor(taken.projectDir);
    if (url === null) { hosted = await startServer({ projectDir: taken.projectDir, port: 0 }); url = hosted.url; }
    console.log(JSON.stringify(await requestOperation(url, taken.rest[0]!, { ...operation, by: taken.rest[2]!.trim() })));
    return 0;
  } catch (error) { console.error((error as Error).message); return 1; }
  finally { if (hosted) await hosted.close(); }
}

export async function main(argv: string[]): Promise<void> {
  if (argv[0] === 'build') { process.exitCode = await build(argv.slice(1)); return; }
  if (argv[0] === 'edit') { process.exitCode = await edit(argv.slice(1)); return; }
  if (argv[0] === 'generate-audio') {
    process.exitCode = await generateAudio(argv.slice(1));
    return;
  }
  if (argv[0] === 'duck') {
    process.exitCode = await duck(argv.slice(1));
    return;
  }
  if (argv[0] === 'check') {
    process.exitCode = await check(argv.slice(1));
    return;
  }
  if (argv[0] === 'render') {
    process.exitCode = await render(argv.slice(1));
    return;
  }
  let options: CliOptions;
  try {
    options = parseArgs(argv);
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
    return;
  }
  const { url } = await startServer({ projectDir: options.projectDir, port: options.port });
  // Ctrl+C would end the process without its exit handlers; exiting runs them, which removes the port file.
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => process.exit());
  console.log(`Kinotta: ${url}`);
  const warning = missingToolsMessage(await checkTools());
  if (warning) console.warn(warning);
  if (options.open) openBrowser(url);
}
