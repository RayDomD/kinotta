import { tryCommand } from './runner.ts';
import type { ToolCheck, ToolId, ToolStatus } from './types.ts';

/** Looks the package up without importing it; importing loads the speech model runtime and is slow. */
const WHISPER_PROBE = 'import importlib.util, sys; sys.exit(0 if importlib.util.find_spec("faster_whisper") else 1)';
const PYTHON_CANDIDATES: Array<[string, string[]]> = [
  ['python3', []],
  ['python', []],
  ['py', ['-3']],
];

/** Runs a command and returns its exit code and output, or null when it cannot start. */
export type Run = (command: string, args: string[]) => Promise<{ code: number; output: string } | null>;

export interface CheckOptions {
  run?: Run;
  platform?: NodeJS.Platform;
}

function hints(platform: NodeJS.Platform): Record<ToolId, string> {
  const ffmpeg = platform === 'win32' ? 'winget install ffmpeg' : platform === 'darwin' ? 'brew install ffmpeg' : 'sudo apt install ffmpeg';
  const python = platform === 'win32' ? 'winget install Python.Python.3.12' : platform === 'darwin' ? 'brew install python' : 'sudo apt install python3 python3-pip';
  return { python, ffmpeg, 'faster-whisper': 'pip install faster-whisper (needs Python 3 first)' };
}

const NAMES: Record<ToolId, string> = { python: 'Python 3', ffmpeg: 'ffmpeg', 'faster-whisper': 'faster-whisper' };

/** The first Python 3 interpreter on the PATH, as a command and its leading arguments. */
async function findPython(run: Run): Promise<[string, string[]] | null> {
  for (const [command, lead] of PYTHON_CANDIDATES) {
    const result = await run(command, [...lead, '--version']);
    if (result && result.code === 0 && /^Python 3/.test(result.output.trim())) return [command, lead];
  }
  return null;
}

/** Checks that Python 3, ffmpeg and faster-whisper are installed, which a start from video needs. Never throws. */
export async function checkTools({ run = tryCommand, platform = process.platform }: CheckOptions = {}): Promise<ToolCheck> {
  const hint = hints(platform);
  const python = await findPython(run);
  const [ffmpeg, whisper] = await Promise.all([
    run('ffmpeg', ['-version']),
    python ? run(python[0], [...python[1], '-c', WHISPER_PROBE]) : Promise.resolve(null),
  ]);
  const found: Record<ToolId, boolean> = {
    python: python !== null,
    ffmpeg: ffmpeg?.code === 0,
    'faster-whisper': whisper?.code === 0,
  };
  const tools: ToolStatus[] = (Object.keys(NAMES) as ToolId[]).map((id) => ({ id, name: NAMES[id], present: found[id], hint: hint[id] }));
  return { tools, missing: tools.filter((tool) => !tool.present) };
}

/** The startup message naming each missing tool with how to install it; null when everything is present. */
export function missingToolsMessage(check: ToolCheck): string | null {
  if (check.missing.length === 0) return null;
  const lines = check.missing.map((tool) => `  ${tool.name}: ${tool.hint}`);
  return `Starting a reel from a video needs tools that are missing:\n${lines.join('\n')}`;
}
