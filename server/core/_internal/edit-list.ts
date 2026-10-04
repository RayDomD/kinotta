import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { applyOperations } from './edit-model.ts';
import type { NewOperation, Operation, Plan } from './edit-model.ts';
import { KinottaError } from './errors.ts';
import type { EditList } from './types.ts';
import { readReelPlan } from './sources.ts';
import { newestVersionNumber, requireReelDir } from './version.ts';

/** The reel's unsaved edits: in the reel folder, outside every version, rewritten on every change. */
export const EDIT_LIST_FILE = 'edit-list.json';
const KINDS: ReadonlySet<string> = new Set<Operation['kind']>(['snip', 'cut', 'move-piece']);

const queues = new Map<string, Promise<unknown>>();

/** Runs `task` after every earlier task on the same reel, so two changes never write the reel's files at once. */
export function withReelLock<T>(reelDir: string, task: () => Promise<T>): Promise<T> {
  const run = (queues.get(reelDir) ?? Promise.resolve()).then(task, task);
  queues.set(reelDir, run.catch(() => undefined));
  return run;
}

export async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  const staged = `${file}.tmp`;
  await writeFile(staged, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(staged, file);
}

/** What the file holds: the list, and the lists Undo and Redo step through (each entry is a whole list). */
interface Stored {
  base: number;
  operations: Operation[];
  undo: Operation[][];
  redo: Operation[][];
}

/** The most lists Undo keeps. */
const HISTORY_LIMIT = 100;

const known = (list: unknown): Operation[] => (Array.isArray(list) ? (list as Operation[]).filter((op) => KINDS.has(op?.kind)) : []);
const knownLists = (lists: unknown): Operation[][] => (Array.isArray(lists) ? lists.map(known) : []);

async function readStored(reelDir: string): Promise<Stored | null> {
  try {
    const parsed = JSON.parse(await readFile(join(reelDir, EDIT_LIST_FILE), 'utf8')) as Record<string, unknown>;
    if (!Number.isInteger(parsed.base) || !Array.isArray(parsed.operations)) return null;
    return { base: parsed.base as number, operations: known(parsed.operations), undo: knownLists(parsed.undo), redo: knownLists(parsed.redo) };
  } catch {
    return null;
  }
}

/** The list as the API shows it: operations, and whether Undo and Redo have anything to step to. */
function shown(stored: Stored, stale: boolean): EditList {
  const list: EditList = { base: stored.base, operations: stored.operations, canUndo: stored.undo.length > 0, canRedo: stored.redo.length > 0 };
  return stale ? { ...list, stale: true } : list;
}

/** A list with nothing in it and no history to step back to is no list: the file goes. */
async function writeStored(reelDir: string, stored: Stored): Promise<void> {
  const file = join(reelDir, EDIT_LIST_FILE);
  if (stored.operations.length === 0 && stored.undo.length === 0 && stored.redo.length === 0) await rm(file, { force: true });
  else await writeJsonAtomic(file, stored);
}

/** The reel's edit list. One kept for a version that is no longer the newest is `stale` and cannot be saved. */
export async function readEditList(projectDir: string, slug: string): Promise<EditList> {
  const reelDir = await requireReelDir(projectDir, slug);
  const newest = await newestVersionNumber(reelDir);
  const stored = await readStored(reelDir);
  if (stored === null || (stored.operations.length === 0 && stored.undo.length === 0 && stored.redo.length === 0)) {
    return { base: newest, operations: [], canUndo: false, canRedo: false };
  }
  return shown(stored, stored.base !== newest);
}

/** The stored list for a change: refuses a stale one. */
async function loadForChange(projectDir: string, reelDir: string, slug: string): Promise<Stored> {
  const list = await readEditList(projectDir, slug);
  if (list.stale) throw new KinottaError('frozen', `The edit list was made on v${list.base}, which is no longer the newest version. Discard it to start again.`);
  return (await readStored(reelDir)) ?? { base: list.base, operations: [], undo: [], redo: [] };
}

/** Writes `operations` as the new list, keeping what it replaced for Undo. A new change ends the redo history. */
async function commit(reelDir: string, stored: Stored, operations: Operation[]): Promise<Stored> {
  const next = { base: stored.base, operations, undo: [...stored.undo, stored.operations].slice(-HISTORY_LIMIT), redo: [] };
  await writeStored(reelDir, next);
  return next;
}

/** Adds an operation to the list, after checking it applies on top of the ones already there. */
export async function addOperation(projectDir: string, slug: string, input: NewOperation): Promise<EditList> {
  const reelDir = await requireReelDir(projectDir, slug);
  return withReelLock(reelDir, async () => {
    const stored = await loadForChange(projectDir, reelDir, slug);
    if (!KINDS.has((input as { kind?: string }).kind ?? '')) throw new KinottaError('invalid', 'That kind of edit is not supported.');
    const operation = { ...input, id: randomUUID() } as Operation;
    const operations = [...stored.operations, operation];
    applyOperations({ plan: (await readReelPlan(projectDir, reelDir)).plan, words: [] }, operations);
    return shown(await commit(reelDir, stored, operations), false);
  });
}

/**
 * Drops one operation and keeps the ones after it. Each operation names things in source time, so the result is
 * worked out again from what remains; if the rest no longer applies, it is refused and the list is unchanged.
 */
export async function removeOperation(projectDir: string, slug: string, id: string): Promise<EditList> {
  const reelDir = await requireReelDir(projectDir, slug);
  return withReelLock(reelDir, async () => {
    const stored = await loadForChange(projectDir, reelDir, slug);
    if (!stored.operations.some((op) => op.id === id)) throw new KinottaError('not-found', `There is no edit "${id}" in the list.`);
    const operations = stored.operations.filter((op) => op.id !== id);
    applyOperations({ plan: (await readReelPlan(projectDir, reelDir)).plan, words: [] }, operations);
    return shown(await commit(reelDir, stored, operations), false);
  });
}

/** Steps back to the list before the last change; Redo steps forward again. */
export async function undoEdit(projectDir: string, slug: string): Promise<EditList> {
  return step(projectDir, slug, 'undo');
}

export async function redoEdit(projectDir: string, slug: string): Promise<EditList> {
  return step(projectDir, slug, 'redo');
}

async function step(projectDir: string, slug: string, direction: 'undo' | 'redo'): Promise<EditList> {
  const reelDir = await requireReelDir(projectDir, slug);
  return withReelLock(reelDir, async () => {
    const stored = await loadForChange(projectDir, reelDir, slug);
    const source = direction === 'undo' ? stored.undo : stored.redo;
    const target = source[source.length - 1];
    if (target === undefined) throw new KinottaError('invalid', `There is nothing to ${direction}.`);
    const rest = source.slice(0, -1);
    const next: Stored =
      direction === 'undo'
        ? { ...stored, operations: target, undo: rest, redo: [...stored.redo, stored.operations] }
        : { ...stored, operations: target, redo: rest, undo: [...stored.undo, stored.operations] };
    await writeStored(reelDir, next);
    return shown(next, false);
  });
}

/** Drops the whole list. */
export async function discardEdits(projectDir: string, slug: string): Promise<EditList> {
  const reelDir = await requireReelDir(projectDir, slug);
  return withReelLock(reelDir, async () => {
    await rm(join(reelDir, EDIT_LIST_FILE), { force: true });
    return readEditList(projectDir, slug);
  });
}
