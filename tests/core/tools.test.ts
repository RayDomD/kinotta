import { describe, expect, it } from 'vitest';
import { checkTools, missingToolsMessage } from '../../server/core/index.ts';
import type { Run } from '../../server/core/_internal/tools.ts';

const ALL = ['python3 --version', 'ffmpeg -version', 'python3 -c'];

/** A fake machine: only the listed command lines succeed (the faster-whisper lookup shows as <python> -c). */
function machine(works: string[]): Run {
  return async (command, args) => {
    const probe = args.indexOf('-c');
    const line = (probe < 0 ? [command, ...args] : [command, ...args.slice(0, probe), '-c']).join(' ');
    if (!works.includes(line)) return null;
    return { code: 0, output: line.endsWith('--version') ? 'Python 3.12.1' : '' };
  };
}



describe('checkTools', () => {
  it('reports nothing missing and prints no message when everything is installed', async () => {
    const check = await checkTools({ run: machine(ALL) });
    expect(check.missing).toEqual([]);
    expect(missingToolsMessage(check)).toBeNull();
  });

  it('names a missing ffmpeg with an install hint for the platform', async () => {
    const check = await checkTools({ run: machine(['python3 --version', 'python3 -c']), platform: 'win32' });
    expect(check.missing.map((tool) => tool.id)).toEqual(['ffmpeg']);
    expect(missingToolsMessage(check)).toContain('ffmpeg: winget install ffmpeg');
  });

  it('names faster-whisper when Python lacks it, and finds Python as py -3', async () => {
    const check = await checkTools({ run: machine(['py -3 --version', 'ffmpeg -version']) });
    expect(check.tools.find((tool) => tool.id === 'python')?.present).toBe(true);
    expect(check.missing.map((tool) => tool.id)).toEqual(['faster-whisper']);
  });

  it('names Python and faster-whisper when there is no Python 3', async () => {
    const check = await checkTools({ run: machine(['ffmpeg -version']), platform: 'darwin' });
    expect(check.missing.map((tool) => tool.id)).toEqual(['python', 'faster-whisper']);
    expect(missingToolsMessage(check)).toContain('brew install python');
  });

  it('does not take a Python 2 interpreter for Python 3', async () => {
    const run: Run = async (command, args) => (args[0] === '--version' && command === 'python3' ? { code: 0, output: 'Python 2.7.18' } : null);
    expect((await checkTools({ run })).missing.map((tool) => tool.id)).toContain('python');
  });
});