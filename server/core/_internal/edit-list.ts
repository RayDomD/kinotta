import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { applyOperation, applyOperations, mediaEditingPlan } from './edit-model.ts';
import type { NewOperation, Operation, Sources } from './edit-model.ts';
import type { MediaPlan } from './media-model.ts';
import { KinottaError } from './errors.ts';
import type { EditList, MediaEditingModel } from './types.ts';
import { assertCodeOnlyOperations, codeSources, isCodeOnly } from './code-edits.ts';
import { clearHandoff, handoffReason, readHandoff } from './handoff.ts';
import type { Handoff } from './handoff.ts';
import { readReelPlan, readReelWords, readSourceAudio } from './sources.ts';
import { recoverSave } from './save-journal.ts';
import { newestVersionNumber, requireReelDir } from './version.ts';

/** The reel's unsaved edits: in the reel folder, outside every version, rewritten on every change. */
export const EDIT_LIST_FILE = 'edit-list.json';
const KINDS: ReadonlySet<string> = new Set<Operation['kind']>(['track-add', 'track-change', 'track-move', 'track-remove', 'placement-detach', 'placement-add', 'placement-change', 'placement-remove', 'placement-move', 'placement-layer', 'placement-replace', 'placement-split', 'placement-snip', 'snip', 'cut', 'move-piece', 'word-text', 'word-timing', 'phrase-text', 'caption-position', 'caption-phrase-position', 'clip-trim', 'clip-attachment', 'clip-split', 'clip-slide', 'element-offset']);

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
  /** Operations a replay onto a newer version found no longer apply, by id, with why. */
  flagged: Record<string, string>;
  /** The older base whose history was reset by replay. Kept until Save or Discard. */
  replayedFrom?: number;
}

/** The most lists Undo keeps. */
const HISTORY_LIMIT = 100;

const known = (list: unknown): Operation[] => (Array.isArray(list) ? (list as Operation[]).filter((op) => KINDS.has(op?.kind)) : []);
const knownLists = (lists: unknown): Operation[][] => (Array.isArray(lists) ? lists.map(known) : []);

async function readStored(reelDir: string): Promise<Stored | null> {
  try {
    const parsed = JSON.parse(await readFile(join(reelDir, EDIT_LIST_FILE), 'utf8')) as Record<string, unknown>;
    if (!Number.isInteger(parsed.base) || !Array.isArray(parsed.operations)) return null;
    const flagged = parsed.flagged && typeof parsed.flagged === 'object' ? (parsed.flagged as Record<string, string>) : {};
    return { base: parsed.base as number, operations: known(parsed.operations), undo: knownLists(parsed.undo), redo: knownLists(parsed.redo), flagged, ...(Number.isInteger(parsed.replayedFrom) && Number(parsed.replayedFrom) >= 0 && Number(parsed.replayedFrom) < Number(parsed.base) ? { replayedFrom: Number(parsed.replayedFrom) } : {}) };
  } catch {
    return null;
  }
}

/** What the API says about a hand-off in force. */
const handoffOf = (handoff: Handoff | null): Pick<EditList, 'handedOff'> => (handoff ? { handedOff: { ...handoff, reason: handoffReason(handoff.version) } } : {});

/** The list as the API shows it: operations, whether Undo and Redo have anything to step to, and what holds Save back. */
function shown(stored: Stored, stale: boolean, handoff: Handoff | null): EditList {
  const flagged = Object.fromEntries(stored.operations.filter((op) => stored.flagged[op.id] !== undefined).map((op) => [op.id, stored.flagged[op.id]!]));
  return {
    base: stored.base,
    operations: stored.operations,
    canUndo: stored.undo.length > 0,
    canRedo: stored.redo.length > 0,
    ...(stored.replayedFrom !== undefined ? { replayedFrom: stored.replayedFrom } : {}),
    ...(stale ? { stale: true as const } : {}),
    ...handoffOf(handoff),
    ...(Object.keys(flagged).length > 0 ? { flagged } : {}),
  };
}

/** A list with nothing in it and no history to step back to is no list: the file goes. */
async function writeStored(reelDir: string, stored: Stored): Promise<void> {
  const file = join(reelDir, EDIT_LIST_FILE);
  if (stored.operations.length === 0 && stored.undo.length === 0 && stored.redo.length === 0) await rm(file, { force: true });
  else await writeJsonAtomic(file, stored);
}

/** The reel's sources as the newest version has them: what an edit list applies to. */
async function currentSources(projectDir: string, reelDir: string): Promise<Sources> {
  if (await isCodeOnly(projectDir, reelDir)) return (await codeSources(join(reelDir, `v${await newestVersionNumber(reelDir)}`))).sources;
  const { plan, planDir, transcriptFile } = await readReelPlan(projectDir, reelDir);
  return { plan, words: await readReelWords(transcriptFile), videoAudio: await readSourceAudio(plan, planDir) };
}

/**
 * The media Save would preserve: the newest version's sources with the edits that still apply, the authored duration, and
 * the folder its source paths are relative to. Null while the reel has no native media (a legacy reel not yet converted).
 */
export async function readPendingMedia(projectDir: string, slug: string): Promise<{ media: MediaPlan; duration: number; planDir: string } | null> {
  const reelDir = await requireReelDir(projectDir, slug);
  return withReelLock(reelDir, async () => {
    const list = await readEditListNow(projectDir, slug);
    const code = await isCodeOnly(projectDir, reelDir);
    const planDir = code ? join(reelDir, `v${await newestVersionNumber(reelDir)}`) : (await readReelPlan(projectDir, reelDir)).planDir;
    const sources = await currentSources(projectDir, reelDir);
    const applying = list.stale ? [] : list.operations.filter((op) => list.flagged?.[op.id] === undefined);
    const { plan } = applyOperations(sources, applying);
    return plan.media && !plan.media.legacy ? { media: plan.media, duration: plan.duration ?? 0, planDir } : null;
  });
}

/** The editing identities and path base, including legacy and authored-page adapters. */
export async function readMediaModel(projectDir: string, slug: string): Promise<MediaEditingModel> {
  const reelDir = await requireReelDir(projectDir, slug);
  return withReelLock(reelDir, async () => {
    await recoverSave(reelDir, EDIT_LIST_FILE);
    const code = await isCodeOnly(projectDir, reelDir);
    const planDir = code ? join(reelDir, `v${await newestVersionNumber(reelDir)}`) : (await readReelPlan(projectDir, reelDir)).planDir;
    const sources = await currentSources(projectDir, reelDir);
    const plan = mediaEditingPlan(sources);
    return { media: plan.media!, duration: plan.duration ?? 0, clips: plan.clips, sections: plan.sections, captions: plan.captions, ...(plan.media?.legacy && !sources.plan.media ? { legacySources: sources } : {}), sourceRoot: relative(planDir, projectDir).split(sep).join('/') || '.' };
  });
}

/**
 * Replays a list made on an older version onto the newest one's sources. Each operation is checked in order against what
 * the ones before it left; one whose target is gone (a clip, a word, a piece, an element) stays in the list, flagged with
 * why, and is left out of what the later ones are checked against. Undo and Redo history belongs to the old version and goes.
 * A list that cannot be replayed at all (the sources are unreadable) is left as it was, stale.
 */
async function replayOntoNewest(projectDir: string, reelDir: string, stored: Stored, newest: number): Promise<Stored> {
  let sources: Sources;
  try {
    sources = await currentSources(projectDir, reelDir);
  } catch {
    return stored;
  }
  const flagged: Record<string, string> = {};
  for (const op of stored.operations) {
    try {
      sources = applyOperation(sources, op);
    } catch (err) {
      flagged[op.id] = err instanceof Error ? err.message : 'It no longer applies.';
    }
  }
  const next: Stored = { base: newest, operations: stored.operations, undo: [], redo: [], flagged, replayedFrom: stored.base };
  await writeStored(reelDir, next);
  return next;
}

/** The reel's edit list, without waiting for other changes to it. Replays a list made on an earlier version first. */
export async function readEditListNow(projectDir: string, slug: string): Promise<EditList> {
  const reelDir = await requireReelDir(projectDir, slug);
  await recoverSave(reelDir, EDIT_LIST_FILE);
  const newest = await newestVersionNumber(reelDir);
  const handoff = await readHandoff(reelDir, newest);
  let stored = await readStored(reelDir);
  if (stored === null || (stored.operations.length === 0 && stored.undo.length === 0 && stored.redo.length === 0)) {
    return { base: newest, operations: [], canUndo: false, canRedo: false, ...handoffOf(handoff) };
  }
  if (stored.base < newest) stored = await replayOntoNewest(projectDir, reelDir, stored, newest);
  return shown(stored, stored.base !== newest, handoff);
}

/**
 * The reel's edit list. One made on an earlier version is replayed onto the newest first (the version an agent built, say),
 * with the operations whose targets are gone flagged. One that cannot be replayed is `stale` and cannot be saved.
 */
export async function readEditList(projectDir: string, slug: string): Promise<EditList> {
  const reelDir = await requireReelDir(projectDir, slug);
  return withReelLock(reelDir, () => readEditListNow(projectDir, slug));
}

/** Ends a hand-off: Save is allowed again. */
export async function cancelHandoff(projectDir: string, slug: string): Promise<EditList> {
  const reelDir = await requireReelDir(projectDir, slug);
  return withReelLock(reelDir, async () => {
    await clearHandoff(reelDir);
    return readEditListNow(projectDir, slug);
  });
}

/** The stored list for a change: refuses a stale one. */
async function loadForChange(projectDir: string, reelDir: string, slug: string): Promise<Stored> {
  const list = await readEditListNow(projectDir, slug);
  if (list.stale) throw new KinottaError('frozen', `The edit list was made on v${list.base}, which is no longer the newest version. Discard it to start again.`);
  return (await readStored(reelDir)) ?? { base: list.base, operations: [], undo: [], redo: [], flagged: {} };
}

/** Writes `operations` as the new list, keeping what it replaced for Undo. A new change ends the redo history. */
async function commit(reelDir: string, stored: Stored, operations: Operation[]): Promise<Stored> {
  const next = { ...stored, operations, undo: [...stored.undo, stored.operations].slice(-HISTORY_LIMIT), redo: [] };
  await writeStored(reelDir, next);
  return next;
}

/** Throws `invalid` when the operations do not apply, in order, to the reel's plan and transcript. Flagged ones are left out. */
async function checkApplies(projectDir: string, reelDir: string, operations: readonly Operation[], flagged: Record<string, string>): Promise<void> {
  const live = operations.filter((op) => flagged[op.id] === undefined);
  // A reel built from code takes only element moves, applied to the scenes of its newest version.
  if (await isCodeOnly(projectDir, reelDir)) assertCodeOnlyOperations(live);
  applyOperations(await currentSources(projectDir, reelDir), live);
}

/** Adds an operation to the list, after checking it applies on top of the ones already there. */
export async function addOperation(projectDir: string, slug: string, input: NewOperation): Promise<EditList> {
  const reelDir = await requireReelDir(projectDir, slug);
  return withReelLock(reelDir, async () => {
    const stored = await loadForChange(projectDir, reelDir, slug);
    if (!KINDS.has((input as { kind?: string }).kind ?? '')) throw new KinottaError('invalid', 'That kind of edit is not supported.');
    const operation = { ...input, id: randomUUID() } as Operation;
    const operations = [...stored.operations, operation];
    await checkApplies(projectDir, reelDir, operations, stored.flagged);
    return shown(await commit(reelDir, stored, operations), false, await readHandoff(reelDir, stored.base));
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
    await checkApplies(projectDir, reelDir, operations, stored.flagged);
    return shown(await commit(reelDir, stored, operations), false, await readHandoff(reelDir, stored.base));
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
    return shown(next, false, await readHandoff(reelDir, next.base));
  });
}

/** Drops the whole list. */
export async function discardEdits(projectDir: string, slug: string): Promise<EditList> {
  const reelDir = await requireReelDir(projectDir, slug);
  return withReelLock(reelDir, async () => {
    await rm(join(reelDir, EDIT_LIST_FILE), { force: true });
    return readEditListNow(projectDir, slug);
  });
}
