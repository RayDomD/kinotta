import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { openProject, type ContractIssue, type Version } from './core/index.ts';
import { DEFAULT_PORT, startServer } from './main.ts';

const CHECK_COMMAND = 'kinotta check <reel> [version]';
const CHECK_USAGE = `Usage: ${CHECK_COMMAND}`;

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
    else throw new Error(`Unknown option ${arg}. Usage: kinotta [--project <dir>] [--port <n>] [--no-open], or ${CHECK_COMMAND}`);
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

const SHOT_TYPES = ['cutaway', 'panel'];

/**
 * What a footage reel needs beyond the timing contract (T22), with the `code` each reports under:
 *
 *   footage-missing  the footage file reel.json names is not in the project
 *   transcript       transcript.json is missing or not valid
 *   shot-type        a shot's type is not cutaway or panel
 *   no-spoken-line   a shot has no line, or its line holds no transcript words
 */
function footageIssues(version: Version): ContractIssue[] {
  if (!version.footage) return [];
  const issues: ContractIssue[] = [];
  if (!version.footage.exists) {
    issues.push({ code: 'footage-missing', message: `footage file ${version.footage.path} not found` });
  }
  if (version.transcriptProblem) issues.push({ code: 'transcript', message: version.transcriptProblem });
  for (const shot of version.shots) {
    if (!SHOT_TYPES.includes(shot.type ?? '')) {
      issues.push({ code: 'shot-type', shot: shot.number, message: `shots.json: shot ${shot.number} has no type (${SHOT_TYPES.join(' or ')})` });
    }
    // With no transcript, only a missing line can be told apart; the transcript issue covers the rest.
    const silent = !shot.line || (version.transcript !== undefined && !shot.spoken);
    if (silent) issues.push({ code: 'no-spoken-line', shot: shot.number, message: `shots.json: shot ${shot.number} has no spoken line` });
  }
  return issues;
}

/** `kinotta check <reel> [version]` (K7): prints a version's static contract issues, then a footage reel's footage problems, one per line. Exit 1 on any. */
async function check(args: string[]): Promise<number> {
  const [slug, versionArg, ...extra] = args;
  const asked = versionArg === undefined ? null : Number(versionArg.replace(/^v/i, ''));
  if (slug === undefined || extra.length > 0 || (asked !== null && !(Number.isInteger(asked) && asked > 0))) {
    console.error(CHECK_USAGE);
    return 1;
  }
  const project = openProject(process.cwd());
  try {
    const number = asked ?? (await project.listVersions(slug)).at(-1)?.number;
    if (number === undefined) throw new Error(`Reel "${slug}" has no versions yet.`);
    const version = await project.readVersion(slug, number);
    const issues = [...version.issues, ...footageIssues(version)];
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

export async function main(argv: string[]): Promise<void> {
  if (argv[0] === 'check') {
    process.exitCode = await check(argv.slice(1));
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
  console.log(`Kinotta: ${url}`);
  if (options.open) openBrowser(url);
}
