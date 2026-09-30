import { randomUUID } from 'node:crypto';
import { isSent, readVersion, settleNewest } from './carry.ts';
import { KinottaError } from './errors.ts';
import { readState, serialized, stateFilePath, writeState } from './state.ts';
import type { StateFile, StoredComment } from './state.ts';
import type { AddedComment, Comment, CommentList, FramePin, NewComment, NewWordPin, NoteSaved, Shot, WordPin } from './types.ts';
import { assertTakesComments } from './version.ts';

const POSITION_DECIMALS = 1000;
const NOTE_MAX_LENGTH = 4000;
/** How far a word pin's time may be from the transcript word's start, in seconds. */
const WORD_TIME_TOLERANCE = 0.01;

/** What became of a comment: whether it went to Claude in a batch, and whether it moved on to the next version. */
function statusOf(id: string, state: StateFile): Pick<Comment, 'sent' | 'carried'> {
  const { carriedTo } = state;
  const moved = carriedTo?.carried.includes(id) ?? false;
  const left = carriedTo?.notCarried.includes(id) ?? false;
  return {
    ...(isSent(state.handedOff, id) ? { sent: true as const } : {}),
    ...(carriedTo && (moved || left) ? { carried: { to: carriedTo.version, moved } } : {}),
  };
}

/**
 * Ordered by pin time (a shot's start, or a word's), then creation time (file order breaks exact ties), then numbered
 * from 1. With the version's `state`, each comment also says whether it was sent and whether it moved on.
 */
export function numbered(stored: StoredComment[], state?: StateFile): Comment[] {
  return stored
    .map((comment, index) => ({ comment, index }))
    .sort(
      (a, b) =>
        a.comment.pin.time - b.comment.pin.time ||
        Date.parse(a.comment.createdAt) - Date.parse(b.comment.createdAt) ||
        a.index - b.index,
    )
    .map(({ comment }, i) => ({ ...comment, number: i + 1, ...(state ? statusOf(comment.id, state) : {}) }));
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
  const state = await readState(stateFilePath(projectDir, slug, number), number);
  return numbered(state.comments, state);
}

/** The one guard every change goes through, after the newest version has taken over what its predecessor left. */
async function takesComments(projectDir: string, slug: string, number: number) {
  await settleNewest(projectDir, slug);
  return assertTakesComments(projectDir, slug, number);
}

export async function addComment(projectDir: string, slug: string, number: number, input: NewComment): Promise<AddedComment> {
  const version = await takesComments(projectDir, slug, number);
  const pin = buildPin(input, number, version.shots);
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  if (text === '') throw new KinottaError('invalid', 'A comment needs some text.');

  const file = stateFilePath(projectDir, slug, number);
  return serialized(file, async () => {
    const state = await readState(file, number);
    const saved: StoredComment = { id: randomUUID(), pin, text, createdAt: new Date().toISOString() };
    const next = { ...state, comments: [...state.comments, saved] };
    await writeState(file, next);
    const comments = numbered(next.comments, next);
    return { comment: comments.find((c) => c.id === saved.id)!, comments };
  });
}

function unknownComment(id: string): KinottaError {
  return new KinottaError('not-found', `Comment "${id}" not found.`);
}

export async function editComment(projectDir: string, slug: string, number: number, id: string, input: string): Promise<AddedComment> {
  await takesComments(projectDir, slug, number);
  const text = typeof input === 'string' ? input.trim() : '';
  if (text === '') throw new KinottaError('invalid', 'A comment needs some text.');

  const file = stateFilePath(projectDir, slug, number);
  return serialized(file, async () => {
    const state = await readState(file, number);
    if (!state.comments.some((c) => c.id === id)) throw unknownComment(id);
    const next = { ...state, comments: state.comments.map((c) => (c.id === id ? { ...c, text } : c)) };
    await writeState(file, next);
    const comments = numbered(next.comments, next);
    return { comment: comments.find((c) => c.id === id)!, comments };
  });
}

export async function deleteComment(projectDir: string, slug: string, number: number, id: string): Promise<CommentList> {
  await takesComments(projectDir, slug, number);
  const file = stateFilePath(projectDir, slug, number);
  return serialized(file, async () => {
    const state = await readState(file, number);
    if (!state.comments.some((c) => c.id === id)) throw unknownComment(id);
    const next = { ...state, comments: state.comments.filter((c) => c.id !== id) };
    await writeState(file, next);
    return { comments: numbered(next.comments, next) };
  });
}

export async function readNote(projectDir: string, slug: string, number: number): Promise<string> {
  await readVersion(projectDir, slug, number);
  return (await readState(stateFilePath(projectDir, slug, number), number)).note;
}

export async function setNote(projectDir: string, slug: string, number: number, input: string): Promise<NoteSaved> {
  await takesComments(projectDir, slug, number);
  if (typeof input !== 'string') throw new KinottaError('invalid', 'A note must be text.');
  const note = input.trim();
  if (note.length > NOTE_MAX_LENGTH) {
    throw new KinottaError('invalid', `A note can be at most ${NOTE_MAX_LENGTH} characters.`);
  }

  const file = stateFilePath(projectDir, slug, number);
  return serialized(file, async () => {
    const state = await readState(file, number);
    await writeState(file, { ...state, note });
    return { note, comments: numbered(state.comments, state) };
  });
}
