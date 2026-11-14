import { KinottaError } from './errors.ts';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const BUILD_SCRIPT = resolve(import.meta.dirname, '../../../skill/kinotta/engine/build.py');
const BUILD_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const exec = promisify(execFile);

/** The local page builder is shared by normal builds and instant pins. It has no agent dependency. */
export async function buildPage(planFile: string, pageFile: string): Promise<void> {
  const python = process.platform === 'win32' ? 'python' : 'python3';
  try {
    await exec(python, [BUILD_SCRIPT, '--plan', planFile, pageFile], {
      encoding: 'utf8', windowsHide: true, timeout: BUILD_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
    });
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { stderr?: string };
    if (failure.code === 'ENOENT') throw new KinottaError('invalid', `${python} is not installed or not on the PATH.`);
    const detail = (failure.stderr ?? '').trim().split('\n').slice(-3).join(' ') || failure.message;
    throw new KinottaError('invalid', `${python} failed: ${detail}`);
  }
}
