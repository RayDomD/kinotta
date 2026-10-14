/**
 * Working state lives in edit-list.json, outside immutable version folders.
 * `base` names the authored inputs to which operations and history entries apply.
 * `frozen` names our latest snapshot, which already contains `frozenOperations`.
 * Native inputs are retained as `anchor` (sources, transcript metadata and path base).
 * `sourceHashes` keeps preserved original identities without rewriting authored plans.
 * A freeze advances only that pointer, never the base or undo/redo history.
 * A newer authored build consumes frozen operations and replays only later edits.
 * Legacy files have no pointer, so their base is also their last frozen version.
 * The publication journal keeps the whole state before rename. Recovery records
 * a committed snapshot with its original history instead of clearing the list.
 */
import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { applyOperation, applyOperations, describeOperation, mediaEditingPlan } from './edit-model.ts';
import type { NewOperation, Operation, Sources } from './edit-model.ts';
import type { MediaPlan } from './media-model.ts';
import { KinottaError } from './errors.ts';
import type { EditList, MediaEditingModel } from './types.ts';
import { assertCodeOnlyOperations, codeSources, isCodeOnly } from './code-edits.ts';
import { clearHandoff, handoffReason, readHandoff } from './handoff.ts';
import type { Handoff } from './handoff.ts';
import { readReelPlan, readReelTranscript, readReelWords, readSourceAudio } from './sources.ts';
import { preservedSourceHashes } from './media-preservation.ts';
import { recoverSave } from './save-journal.ts';
import { newestVersionNumber, requireReelDir } from './version.ts';

/** The reel's unsaved edits: in the reel folder, outside every version, rewritten on every change. */
export const EDIT_LIST_FILE = 'edit-list.json';
const KINDS: ReadonlySet<string> = new Set<Operation['kind']>(['shot-alternate', 'shot-alternate-dismiss', 'source-beats', 'track-add', 'track-change', 'track-move', 'track-remove', 'placement-detach', 'placement-add', 'placement-change', 'placement-duck', 'placement-remove', 'placement-move', 'placement-layer', 'placement-replace', 'placement-split', 'placement-snip', 'snip', 'cut', 'move-piece', 'word-text', 'word-timing', 'phrase-text', 'caption-position', 'caption-phrase-position', 'clip-trim', 'clip-attachment', 'clip-split', 'clip-slide', 'element-offset']);

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
export interface WorkingInputs {
  sources: Sources;
  planDir: string;
  transcript: Record<string, unknown>;
}

export interface Stored {
  anchor?: WorkingInputs;
  sourceHashes?: Record<string, string>;
  base: number;
  frozen?: number;
  frozenIdentity?: string;
  frozenOperations?: string[];
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

const known = (list: unknown): Operation[] => (Array.isArray(list) ? (list as Operation[]).filter((op) => KINDS.has(op?.kind)).map((op) => ({ ...op, by: typeof op.by === 'string' && op.by.trim() ? op.by.trim() : 'you' })) : []);
const knownLists = (lists: unknown): Operation[][] => (Array.isArray(lists) ? lists.map(known) : []);

async function readStored(reelDir: string): Promise<Stored | null> {
  try {
    const parsed = JSON.parse(await readFile(join(reelDir, EDIT_LIST_FILE), 'utf8')) as Record<string, unknown>;
    if (!Number.isInteger(parsed.base) || !Array.isArray(parsed.operations)) return null;
    const flagged = parsed.flagged && typeof parsed.flagged === 'object' ? (parsed.flagged as Record<string, string>) : {};
    return { ...(parsed.anchor && typeof parsed.anchor === 'object' ? { anchor: parsed.anchor as WorkingInputs } : {}), ...(parsed.sourceHashes && typeof parsed.sourceHashes === 'object' ? { sourceHashes: parsed.sourceHashes as Record<string, string> } : {}), ...(Number.isInteger(parsed.frozen) ? { frozen: Number(parsed.frozen), ...(typeof parsed.frozenIdentity === 'string' ? { frozenIdentity: parsed.frozenIdentity } : {}), frozenOperations: Array.isArray(parsed.frozenOperations) ? parsed.frozenOperations.filter((id): id is string => typeof id === 'string') : [] } : {}), base: parsed.base as number, operations: known(parsed.operations), undo: knownLists(parsed.undo), redo: knownLists(parsed.redo), flagged, ...(Number.isInteger(parsed.replayedFrom) && Number(parsed.replayedFrom) >= 0 && Number(parsed.replayedFrom) < Number(parsed.base) ? { replayedFrom: Number(parsed.replayedFrom) } : {}) };
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
    ...(stored.frozen !== undefined ? { frozen: stored.frozen } : {}),
    operations: stored.operations,
    editsSinceFreeze: [...new Set([...stored.operations.map((op) => op.id), ...(stored.frozenOperations ?? [])])].filter((id) => stored.operations.some((op) => op.id === id) !== (stored.frozenOperations ?? []).includes(id)).length,
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
  if (stored.anchor === undefined && stored.frozen === undefined && stored.operations.length === 0 && stored.undo.length === 0 && stored.redo.length === 0) await rm(file, { force: true });
  else await writeJsonAtomic(file, stored);
}

/** The reel's sources as the newest version has them: what an edit list applies to. */
async function currentSources(projectDir: string, reelDir: string, newestOnly = false): Promise<Sources> {
  if (await isCodeOnly(projectDir, reelDir)) return (await codeSources(join(reelDir, `v${(newestOnly ? undefined : (await readStored(reelDir))?.base) ?? await newestVersionNumber(reelDir)}`))).sources;
  return (newestOnly ? await resolveWorkingInputs(projectDir, reelDir, await newestVersionNumber(reelDir)) : (await readStored(reelDir))?.anchor ?? await resolveWorkingInputs(projectDir, reelDir)).sources;
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
    const planDir = code ? join(reelDir, `v${(await readStored(reelDir))?.base ?? await newestVersionNumber(reelDir)}`) : ((await readStored(reelDir))?.anchor ?? await resolveWorkingInputs(projectDir, reelDir)).planDir;
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
    await readEditListNow(projectDir, slug);
    const code = await isCodeOnly(projectDir, reelDir);
    const planDir = code ? join(reelDir, `v${(await readStored(reelDir))?.base ?? await newestVersionNumber(reelDir)}`) : ((await readStored(reelDir))?.anchor ?? await resolveWorkingInputs(projectDir, reelDir)).planDir;
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
    sources = await currentSources(projectDir, reelDir, true);
  } catch {
    return stored;
  }
  const flagged: Record<string, string> = {};
  const consumed = new Set(stored.frozenOperations ?? []);
  const operations = stored.operations.filter((op) => {
    if (consumed.has(op.id)) return false;
    if (op.kind === 'shot-alternate' || op.kind === 'shot-alternate-dismiss') {
      const shot = sources.plan.parts?.shots.find((shot) => shot.name === op.shot);
      if (shot && (op.kind === 'shot-alternate' ? shot.revision === op.revision && shot.choiceMade : !shot.alternates?.some((alternate) => alternate.revision === op.revision))) return false;
    }
    return true;
  });
  const removed = [...new Map([...stored.undo.flat(), ...stored.redo.flat()].map((op) => [op.id, op])).values()].filter((op) => consumed.has(op.id) && !stored.operations.some((current) => current.id === op.id));
  if (removed.length) {
    const base = await currentSources(projectDir, reelDir);
    const history = new Map([...stored.undo.flat(), ...stored.redo.flat(), ...stored.operations].map((op) => [op.id, op]));
    let frozen = (stored.frozenOperations ?? []).map((id) => history.get(id)).filter((op): op is Operation => op !== undefined);
    const reversals: Operation[] = [];
    // Preservation relocates files without changing source identity. Compare against those exact bytes.
    const preservedPaths = (snapshot: Sources): Sources => {
      if (!snapshot.plan.media) return snapshot;
      const media = snapshot.plan.media;
      const retained = media.sources.map((source) => {
        const current = sources.plan.media?.sources.find((candidate) => candidate.id === source.id);
        const hash = source.contentHash ?? stored.sourceHashes?.[source.id];
        if (!current || !hash || current.contentHash !== hash) return source;
        return { ...source, path: current.path, contentHash: hash, ...(!source.words && current.words ? { words: current.words } : {}) };
      });
      return { ...snapshot, plan: { ...snapshot.plan, media: { ...media, sources: retained } } };
    };
    for (const undone of [...removed].reverse()) {
      const from = preservedPaths(applyOperations(base, frozen));
      frozen = frozen.filter((op) => op.id !== undone.id);
      const to = preservedPaths(applyOperations(base, frozen));
      reversals.push({ ...undone, id: randomUUID(), reversal: { from, to } });
    }
    operations.unshift(...reversals);
  }
  for (const op of operations) {
    if (flagged[op.id]) continue;
    try {
      sources = applyOperations(sources, [op]);
    } catch (err) {
      flagged[op.id] = op.reversal ? `${describeOperation(op).text}. The agent changed the same part of the reel. Review this undo against the new version.` : err instanceof Error ? err.message : 'It no longer applies.';
    }
  }
  const anchor = await isCodeOnly(projectDir, reelDir) ? undefined : await resolveWorkingInputs(projectDir, reelDir, newest);
  const next: Stored = { ...(anchor ? { anchor } : {}), base: newest, operations, undo: [], redo: [], flagged, replayedFrom: stored.base };
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
  if (stored === null) {
    return { base: newest, operations: [], canUndo: false, canRedo: false, ...handoffOf(handoff) };
  }
  if ((stored.frozen ?? stored.base) < newest) stored = await replayOntoNewest(projectDir, reelDir, stored, newest);
  return shown(stored, (stored.frozen ?? stored.base) !== newest, handoff);
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
  const stored = (await readStored(reelDir)) ?? { base: list.base, operations: [], undo: [], redo: [], flagged: {} };
  if (!stored.anchor && !(await isCodeOnly(projectDir, reelDir))) stored.anchor = await resolveWorkingInputs(projectDir, reelDir);
  return stored;
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
    if ('reversal' in input) throw new KinottaError('invalid', 'Undo reversals are recorded by Kinotta. Use Undo to reverse an edit.');
    if (!KINDS.has((input as { kind?: string }).kind ?? '')) throw new KinottaError('invalid', 'That kind of edit is not supported.');
    if (input.by !== undefined && (typeof input.by !== 'string' || !input.by.trim())) throw new KinottaError('invalid', 'An edit needs the name of who made it.');
    const operation = { ...input, by: input.by?.trim() ?? 'you', id: randomUUID() } as Operation;
    const operations = [...stored.operations, operation];
    await checkApplies(projectDir, reelDir, operations, stored.flagged);
    return shown(await commit(reelDir, stored, operations), false, await readHandoff(reelDir, stored.frozen ?? stored.base));
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
    return shown(await commit(reelDir, stored, operations), false, await readHandoff(reelDir, stored.frozen ?? stored.base));
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
    return shown(next, false, await readHandoff(reelDir, next.frozen ?? next.base));
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

/** A complete journal snapshot, captured under the reel lock before publication. */
export async function workingState(reelDir: string): Promise<Stored> {
  return (await readStored(reelDir)) ?? { base: await newestVersionNumber(reelDir), operations: [], undo: [], redo: [], flagged: {} };
}

/** Publication changes the frozen pointer while retaining all working history. */
export async function recordFreeze(reelDir: string, version: number, stored: Stored, frozenIdentity?: string): Promise<void> {
  const sourceHashes = await preservedSourceHashes(join(reelDir, `v${version}`));
  await writeStored(reelDir, { ...stored, sourceHashes, ...(frozenIdentity ? { frozenIdentity } : {}), frozen: version, frozenOperations: stored.operations.map((op) => op.id) });
}

async function resolveWorkingInputs(projectDir: string, reelDir: string, authoredVersion?: number): Promise<WorkingInputs> {
  if (authoredVersion !== undefined) {
    const planDir = join(reelDir, `v${authoredVersion}`);
    const text = await readFile(join(planDir, 'plan.json'), 'utf8').catch(() => null);
    if (text !== null) {
      const plan = JSON.parse(text) as Sources['plan'];
      const transcriptFile = join(planDir, 'transcript.json');
      const transcript: Record<string, unknown> = await readFile(transcriptFile, 'utf8').then((value) => JSON.parse(value) as Record<string, unknown>, () => ({}));
      return { sources: { plan, words: Array.isArray(transcript.words) ? transcript.words : [], videoAudio: await readSourceAudio(plan, planDir) }, planDir, transcript };
    }
  }
  const { plan, planDir, transcriptFile } = await readReelPlan(projectDir, reelDir);
  return { sources: { plan, words: await readReelWords(transcriptFile), videoAudio: await readSourceAudio(plan, planDir) }, planDir, transcript: await readReelTranscript(transcriptFile) };
}

/** Capturing a legacy journal also retains its native base inputs before publication. */
export async function workingInputs(projectDir: string, reelDir: string): Promise<WorkingInputs> {
  const stored = await workingState(reelDir);
  if (stored.anchor) return stored.anchor;
  const anchor = await resolveWorkingInputs(projectDir, reelDir);
  await writeStored(reelDir, { ...stored, anchor });
  return anchor;
}

/** Media added by an operation must keep its original identity across later freezes too. */
export async function withPreservedMediaHashes(reelDir: string, sources: Sources): Promise<Sources> {
  if (!sources.plan.media) return sources;
  const hashes = (await readStored(reelDir))?.sourceHashes ?? {};
  return { ...sources, plan: { ...sources.plan, media: { ...sources.plan.media, sources: sources.plan.media.sources.map((source) => hashes[source.id] ? { ...source, contentHash: hashes[source.id] } : source) } } };
}

/** Unapplied anchored inputs, read while the caller holds the reel lock. */
export const workingSources = (projectDir: string, reelDir: string): Promise<Sources> => currentSources(projectDir, reelDir);
