import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { KinottaError } from './errors.ts';
import type { FramePin, WordPin } from './types.ts';

const REELS_DIR = 'reels';
const STATE_DIR = '.kinotta';

export interface StoredComment {
  id: string;
  pin: FramePin | WordPin;
  text: string;
  createdAt: string;
}

/** What one copy handed to Claude for a section: the comments it held. A later copy of the section replaces it. */
export interface HandOff {
  copiedAt: string;
  commentIds: string[];
}

/** The editor's saved state for one version. Everything but `comments` and `note` is written by the core, not the reviewer. */
export interface StateFile {
  comments: StoredComment[];
  note: string;
  /** Section id to its latest hand-off. */
  handedOff?: Record<string, HandOff>;
  /** Sections still waiting on Claude when this version appeared: handed off on the version before and unchanged since. */
  waiting?: string[];
  /** Set once this version has taken the carried comments of the one before it (settling is done). `ids` are the new comment ids. */
  carriedFrom?: { version: number; ids: string[] };
  /** Set on the older version once the next one settled: where its unsent comments went. */
  carriedTo?: { version: number; carried: string[]; notCarried: string[] };
}

/** Writes to one state file run one at a time, so two saves never overwrite each other. */
const queues = new Map<string, Promise<unknown>>();

export function serialized<T>(file: string, task: () => Promise<T>): Promise<T> {
  const run = (queues.get(file) ?? Promise.resolve()).then(task, task);
  queues.set(file, run.catch(() => undefined));
  return run;
}

export function stateFilePath(projectDir: string, slug: string, number: number): string {
  return join(projectDir, REELS_DIR, STATE_DIR, slug, `v${number}.json`);
}

export async function readState(file: string, number: number): Promise<StateFile> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { comments: [], note: '' };
    throw err;
  }
  try {
    const parsed = JSON.parse(text) as Partial<StateFile> | null;
    if (parsed === null || typeof parsed !== 'object' || !Array.isArray(parsed.comments)) throw new Error('bad shape');
    return { ...parsed, comments: parsed.comments, note: typeof parsed.note === 'string' ? parsed.note : '' };
  } catch {
    throw new KinottaError('invalid', `The saved comments for version ${number} are not readable.`);
  }
}

export async function writeState(file: string, state: StateFile): Promise<void> {
  await mkdir(join(file, '..'), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify(state, null, 2)}\n`);
  await rename(temp, file);
}
