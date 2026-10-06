import { existsSync } from 'node:fs';
import { chromium as playwrightChromium } from 'playwright';
import { describe, expect, it } from 'vitest';
import { checkTools, missingToolsMessage } from '../../server/core/index.ts';
import type { Run } from '../../server/core/_internal/tools.ts';

const ALL = ['python3 --version', 'ffmpeg -version', 'python3 -c'];
const VIDEO_HEADER = 'Starting a reel from a video needs tools that are missing:';
const RENDER_HEADER = 'Rendering needs tools that are missing:';

/** A fake machine: only the listed command lines succeed (the faster-whisper lookup shows as <python> -c). */
function machine(works: string[]): Run {
  return async (command, args) => {
    const probe = args.indexOf('-c');
    const line = (probe < 0 ? [command, ...args] : [command, ...args.slice(0, probe), '-c']).join(' ');
    if (!works.includes(line)) return null;
    return { code: 0, output: line.endsWith('--version') ? 'Python 3.12.1' : '' };
  };
}

const chromium = (present: boolean) => async () => present;

/** The lines of the message block under a header, up to the next header. */
function block(message: string | null, header: string): string[] {
  const lines = (message ?? '').split('\n');
  const start = lines.indexOf(header);
  if (start < 0) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => !line.startsWith('  '));
  return end < 0 ? rest : rest.slice(0, end);
}

describe('checkTools', () => {
  it('reports nothing missing and prints no message when everything is installed', async () => {
    const check = await checkTools({ run: machine(ALL), findChromium: chromium(true) });
    expect(check.missing).toEqual([]);
    expect(missingToolsMessage(check)).toBeNull();
  });

  it('names a missing ffmpeg with an install hint, for reels from video and for rendering', async () => {
    const check = await checkTools({ run: machine(['python3 --version', 'python3 -c']), platform: 'win32', findChromium: chromium(true) });
    expect(check.missing.map((tool) => tool.id)).toEqual(['ffmpeg']);
    const message = missingToolsMessage(check);
    expect(block(message, VIDEO_HEADER)).toEqual(['  ffmpeg: winget install ffmpeg']);
    expect(block(message, RENDER_HEADER)).toEqual(['  ffmpeg: winget install ffmpeg']);
  });

  it('names faster-whisper when Python lacks it, and finds Python as py -3', async () => {
    const check = await checkTools({ run: machine(['py -3 --version', 'ffmpeg -version']), findChromium: chromium(true) });
    expect(check.tools.find((tool) => tool.id === 'python')?.present).toBe(true);
    expect(check.missing.map((tool) => tool.id)).toEqual(['faster-whisper']);
  });

  it('names Python and faster-whisper for reels from video only when there is no Python 3', async () => {
    const check = await checkTools({ run: machine(['ffmpeg -version']), platform: 'darwin', findChromium: chromium(true) });
    expect(check.missing.map((tool) => tool.id)).toEqual(['python', 'faster-whisper']);
    const message = missingToolsMessage(check);
    expect(block(message, VIDEO_HEADER)).toEqual(['  Python 3: brew install python', '  faster-whisper: pip install faster-whisper (needs Python 3 first)']);
    expect(message).not.toContain(RENDER_HEADER);
  });

  it('does not take a Python 2 interpreter for Python 3', async () => {
    const run: Run = async (command, args) => (args[0] === '--version' && command === 'python3' ? { code: 0, output: 'Python 2.7.18' } : null);
    expect((await checkTools({ run, findChromium: chromium(true) })).missing.map((tool) => tool.id)).toContain('python');
  });

  it('names a missing Chromium with its install hint, for rendering only', async () => {
    const check = await checkTools({ run: machine(ALL), findChromium: chromium(false) });
    expect(check.missing.map((tool) => tool.id)).toEqual(['chromium']);
    const message = missingToolsMessage(check);
    expect(block(message, RENDER_HEADER)).toEqual(['  Chromium: npx playwright install chromium']);
    expect(message).not.toContain(VIDEO_HEADER);
  });

  it('says what each tool is needed for', async () => {
    const check = await checkTools({ run: machine(ALL), findChromium: chromium(true) });
    expect(Object.fromEntries(check.tools.map((tool) => [tool.id, tool.neededFor]))).toEqual({
      python: ['video'],
      ffmpeg: ['video', 'render'],
      'faster-whisper': ['video'],
      chromium: ['render'],
    });
  });

  it("looks for Chromium at Playwright's executable path when no finder is given", async () => {
    const check = await checkTools({ run: machine(ALL) });
    expect(check.tools.find((tool) => tool.id === 'chromium')?.present).toBe(existsSync(playwrightChromium.executablePath()));
  });
});