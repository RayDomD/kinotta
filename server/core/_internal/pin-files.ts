import { readFile } from 'node:fs/promises';
import { KinottaError } from './errors.ts';

/** Optional pin metadata: only a missing file is empty; corrupt or unreadable data is an actionable error. */
export async function readPinRecord<T>(file: string, label: string): Promise<Record<string, T>> {
  let text: string;
  try { text = await readFile(file, 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw new KinottaError('invalid', `Could not read ${label}: ${error instanceof Error ? error.message : 'read failed'}`);
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected an object');
    return parsed as Record<string, T>;
  } catch { throw new KinottaError('invalid', `The saved ${label} are not readable.`); }
}
