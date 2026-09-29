import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { KinottaError } from './errors.ts';
import type { AddedComment, Comment, FramePin, NewComment, Shot } from './types.ts';
import { readVersion } from './version.ts';

const REELS_DIR = 'reels';
const STATE_DIR = '.kinotta';
const POSITION_DECIMALS = 1000;

interface StoredComment {
  id: string;
  pin: FramePin;
  text: string;
  createdAt: string;
}

interface StateFile {
  comments: StoredComment[];
  note: string;
}

/** Writes to one state file run one at a time, so two saves never overwrite each other. */
const queues = new Map<string, Promise<unknown>>();

function serialized<T>(file: string, task: () => Promise<T>): Promise<T> {
  const run = (queues.get(file) ?? Promise.resolve()).then(task, task);
  queues.set(file, run.catch(() => undefined));
  return run;
}

function stateFilePath(projectDir: string, slug: string, number: number): string {
  return join(projectDir, REELS_DIR, STATE_DIR, slug, `v${number}.json`);
}

async function readState(file: string, number: number): Promise<StateFile> {
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

async function writeState(file: string, state: StateFile): Promise<void> {
  await mkdir(join(file, '..'), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify(state, null, 2)}\n`);
  await rename(temp, file);
}

/** Ordered by shot start, then creation time (file order breaks exact ties), then numbered from 1. */
function numbered(stored: StoredComment[]): Comment[] {
  return stored
    .map((comment, index) => ({ comment, index }))
    .sort(
      (a, b) =>
        a.comment.pin.time - b.comment.pin.time ||
        Date.parse(a.comment.createdAt) - Date.parse(b.comment.createdAt) ||
        a.index - b.index,
    )
    .map(({ comment }, i) => ({ ...comment, number: i + 1 }));
}

function fraction(value: unknown, axis: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new KinottaError('invalid', `The pin's ${axis} position must be a fraction of the frame between 0 and 1.`);
  }
  return Math.round(value * POSITION_DECIMALS) / POSITION_DECIMALS;
}

function buildPin(input: NewComment, version: number, shots: Shot[]): FramePin {
  const raw = input?.pin;
  if (raw === null || typeof raw !== 'object') throw new KinottaError('invalid', 'A comment needs a pin.');
  const shot = shots.find((s) => s.number === raw.shot);
  if (!shot) throw new KinottaError('invalid', `Version ${version} has no shot "${String(raw.shot)}".`);
  const element = raw.element ?? null;
  if (element !== null && (typeof element !== 'string' || element === '')) {
    throw new KinottaError('invalid', "The pin's element must be a name or null.");
  }
  return {
    kind: 'frame',
    version,
    section: shot.section ?? null,
    shot: shot.number,
    time: shot.start,
    x: fraction(raw.x, 'x'),
    y: fraction(raw.y, 'y'),
    element,
  };
}

export async function listComments(projectDir: string, slug: string, number: number): Promise<Comment[]> {
  await readVersion(projectDir, slug, number);
  return numbered((await readState(stateFilePath(projectDir, slug, number), number)).comments);
}

export async function addComment(projectDir: string, slug: string, number: number, input: NewComment): Promise<AddedComment> {
  const version = await readVersion(projectDir, slug, number);
  const pin = buildPin(input, number, version.shots);
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  if (text === '') throw new KinottaError('invalid', 'A comment needs some text.');

  const file = stateFilePath(projectDir, slug, number);
  return serialized(file, async () => {
    const state = await readState(file, number);
    const saved: StoredComment = { id: randomUUID(), pin, text, createdAt: new Date().toISOString() };
    await writeState(file, { ...state, comments: [...state.comments, saved] });
    const comments = numbered([...state.comments, saved]);
    return { comment: comments.find((c) => c.id === saved.id)!, comments };
  });
}
