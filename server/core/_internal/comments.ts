import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { KinottaError } from './errors.ts';
import type { AddedComment, Comment, CommentList, FramePin, NewComment, NewWordPin, NoteSaved, Shot, WordPin } from './types.ts';
import { assertTakesComments, readVersion } from './version.ts';

const REELS_DIR = 'reels';
const STATE_DIR = '.kinotta';
const POSITION_DECIMALS = 1000;
const NOTE_MAX_LENGTH = 4000;
/** How far a word pin's time may be from the transcript word's start, in seconds. */
const WORD_TIME_TOLERANCE = 0.01;

interface StoredComment {
  id: string;
  pin: FramePin | WordPin;
  text: string;
  createdAt: string;
}

interface StateFile {
  comments: StoredComment[];
  note: string;
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

async function writeState(file: string, state: StateFile): Promise<void> {
  await mkdir(join(file, '..'), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify(state, null, 2)}\n`);
  await rename(temp, file);
}

/** Ordered by pin time (a shot's start, or a word's), then creation time (file order breaks exact ties), then numbered from 1. */
export function numbered(stored: StoredComment[]): Comment[] {
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

function buildWordPin(raw: NewWordPin, version: number, shot: Shot): WordPin {
  const found = shot.words?.find((w) => Math.abs(w.start - raw.time) <= WORD_TIME_TOLERANCE && w.text === raw.word);
  if (!found) {
    throw new KinottaError('invalid', `Shot ${shot.number} has no spoken word "${String(raw.word)}" at ${String(raw.time)}s.`);
  }
  return { kind: 'word', version, section: shot.section ?? null, shot: shot.number, time: found.start, word: found.text };
}

function buildPin(input: NewComment, version: number, shots: Shot[]): FramePin | WordPin {
  const raw = input?.pin;
  if (raw === null || typeof raw !== 'object') throw new KinottaError('invalid', 'A comment needs a pin.');
  const shot = shots.find((s) => s.number === raw.shot);
  if (!shot) throw new KinottaError('invalid', `Version ${version} has no shot "${String(raw.shot)}".`);
  if (raw.kind === 'word') return buildWordPin(raw, version, shot);
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
  const version = await assertTakesComments(projectDir, slug, number);
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

function unknownComment(id: string): KinottaError {
  return new KinottaError('not-found', `Comment "${id}" not found.`);
}

export async function editComment(projectDir: string, slug: string, number: number, id: string, input: string): Promise<AddedComment> {
  await assertTakesComments(projectDir, slug, number);
  const text = typeof input === 'string' ? input.trim() : '';
  if (text === '') throw new KinottaError('invalid', 'A comment needs some text.');

  const file = stateFilePath(projectDir, slug, number);
  return serialized(file, async () => {
    const state = await readState(file, number);
    if (!state.comments.some((c) => c.id === id)) throw unknownComment(id);
    const stored = state.comments.map((c) => (c.id === id ? { ...c, text } : c));
    await writeState(file, { ...state, comments: stored });
    const comments = numbered(stored);
    return { comment: comments.find((c) => c.id === id)!, comments };
  });
}

export async function deleteComment(projectDir: string, slug: string, number: number, id: string): Promise<CommentList> {
  await assertTakesComments(projectDir, slug, number);
  const file = stateFilePath(projectDir, slug, number);
  return serialized(file, async () => {
    const state = await readState(file, number);
    if (!state.comments.some((c) => c.id === id)) throw unknownComment(id);
    const stored = state.comments.filter((c) => c.id !== id);
    await writeState(file, { ...state, comments: stored });
    return { comments: numbered(stored) };
  });
}

export async function readNote(projectDir: string, slug: string, number: number): Promise<string> {
  await readVersion(projectDir, slug, number);
  return (await readState(stateFilePath(projectDir, slug, number), number)).note;
}

export async function setNote(projectDir: string, slug: string, number: number, input: string): Promise<NoteSaved> {
  await assertTakesComments(projectDir, slug, number);
  if (typeof input !== 'string') throw new KinottaError('invalid', 'A note must be text.');
  const note = input.trim();
  if (note.length > NOTE_MAX_LENGTH) {
    throw new KinottaError('invalid', `A note can be at most ${NOTE_MAX_LENGTH} characters.`);
  }

  const file = stateFilePath(projectDir, slug, number);
  return serialized(file, async () => {
    const state = await readState(file, number);
    await writeState(file, { ...state, note });
    return { note, comments: numbered(state.comments) };
  });
}
