import { existsSync } from 'node:fs';
import { tryCommand } from './runner.ts';
import type { ToolCheck, ToolId, ToolStatus, ToolUse } from './types.ts';

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
  /** Whether Playwright's Chromium is installed. The default asks Playwright where it keeps the browser. */
  findChromium?: () => Promise<boolean>;
}

function hints(platform: NodeJS.Platform): Record<ToolId, string> {
  const ffmpeg = platform === 'win32' ? 'winget install ffmpeg' : platform === 'darwin' ? 'brew install ffmpeg' : 'sudo apt install ffmpeg';
  const python = platform === 'win32' ? 'winget install Python.Python.3.12' : platform === 'darwin' ? 'brew install python' : 'sudo apt install python3 python3-pip';
  return { python, ffmpeg, 'faster-whisper': 'pip install faster-whisper (needs Python 3 first)', chromium: 'npx playwright install chromium' };
}

const NAMES: Record<ToolId, string> = { python: 'Python 3', ffmpeg: 'ffmpeg', 'faster-whisper': 'faster-whisper', chromium: 'Chromium' };

const USES: Record<ToolId, ToolUse[]> = { python: ['video'], ffmpeg: ['video', 'render'], 'faster-whisper': ['video'], chromium: ['render'] };

/** The startup message's heading for each use, in print order. */
const USE_HEADINGS: Array<[ToolUse, string]> = [
  ['video', 'Starting a reel from a video needs tools that are missing:'],
  ['render', 'Rendering needs tools that are missing:'],
];

/** Playwright's Chromium is a file it downloads, not a command on the PATH, so ask Playwright where it should be. */
async function playwrightChromium(): Promise<boolean> {
  try {
    const { chromium } = await import('playwright');
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
}

/** The first Python 3 interpreter on the PATH, as a command and its leading arguments. */
async function findPython(run: Run): Promise<[string, string[]] | null> {
  for (const [command, lead] of PYTHON_CANDIDATES) {
    const result = await run(command, [...lead, '--version']);
    if (result && result.code === 0 && /^Python 3/.test(result.output.trim())) return [command, lead];
  }
  return null;
}

/**
 * Checks the tools a start from video needs (Python 3, ffmpeg, faster-whisper) and those rendering needs (ffmpeg,
 * Chromium). Never throws.
 */
export async function checkTools({ run = tryCommand, platform = process.platform, findChromium = playwrightChromium }: CheckOptions = {}): Promise<ToolCheck> {
  const hint = hints(platform);
  const python = await findPython(run);
  const [ffmpeg, whisper, chromium] = await Promise.all([
    run('ffmpeg', ['-version']),
    python ? run(python[0], [...python[1], '-c', WHISPER_PROBE]) : Promise.resolve(null),
    findChromium().catch(() => false),
  ]);
  const found: Record<ToolId, boolean> = {
    python: python !== null,
    ffmpeg: ffmpeg?.code === 0,
    'faster-whisper': whisper?.code === 0,
    chromium,
  };
  const tools: ToolStatus[] = (Object.keys(NAMES) as ToolId[]).map((id) => ({
    id,
    name: NAMES[id],
    present: found[id],
    hint: hint[id],
    neededFor: USES[id],
  }));
  return { tools, missing: tools.filter((tool) => !tool.present) };
}

/** The startup message naming each missing tool with how to install it, under what needs it; null when everything is present. */
export function missingToolsMessage(check: ToolCheck): string | null {
  if (check.missing.length === 0) return null;
  const blocks = USE_HEADINGS.flatMap(([use, heading]) => {
    const lines = check.missing.filter((tool) => tool.neededFor.includes(use)).map((tool) => `  ${tool.name}: ${tool.hint}`);
    return lines.length === 0 ? [] : [`${heading}\n${lines.join('\n')}`];
  });
  return blocks.join('\n');
}
