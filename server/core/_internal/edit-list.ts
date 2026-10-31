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
import { writeFileAtomic } from './state.ts';
import { randomUUID } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { applyOperation, applyOperations, describeOperation, editableMedia, inputsVersion, mediaEditingPlan, operationMoment, workingOperations } from './edit-model.ts';
import type { NewOperation, Operation, OperationMoment, SnipOperation, Sources } from './edit-model.ts';
import { mediaTimeline, remapMediaMoment, renameLegacySource } from './media-model.ts';
import type { MediaPlan } from './media-model.ts';
import { legacyFootageRenames } from './legacy-footage.ts';
import { KinottaError } from './errors.ts';
import type { EditList, FlaggedPlace, MediaEditingModel, SkippedEdit } from './types.ts';
import { assertCodeOnlyOperations, codeSources, isCodeOnly } from './code-edits.ts';
import { clearHandoff, handoffReason, readHandoff } from './handoff.ts';
import type { Handoff } from './handoff.ts';
import { readReelPlan, readReelTranscript, readReelWords, readSourceAudio } from './sources.ts';
import { preservedSourceHashes } from './media-preservation.ts';
import { withSpeech } from './media-speech.ts';
import { recoverSave } from './save-journal.ts';
import { newestVersionNumber, readVersion as readVersionFiles, requireReelDir } from './version.ts';
import { stat } from 'node:fs/promises';

/** The reel's unsaved edits: in the reel folder, outside every version, rewritten on every change. */
export const EDIT_LIST_FILE = 'edit-list.json';
const KINDS: ReadonlySet<string> = new Set<Operation['kind']>(['pin-comment', 'shot-alternate', 'shot-alternate-dismiss', 'source-beats', 'track-add', 'track-change', 'track-move', 'track-remove', 'placement-detach', 'placement-add', 'placement-change', 'placement-duck', 'placement-remove', 'placement-ripple-remove', 'placement-move', 'placement-layer', 'placement-replace', 'placement-split', 'placement-snip', 'snip', 'cut', 'move-piece', 'word-text', 'word-timing', 'phrase-text', 'caption-position', 'caption-phrase-position', 'word-emphasis', 'clip-trim', 'clip-attachment', 'clip-split', 'clip-slide', 'element-offset', 'use-version']);

const queues = new Map<string, Promise<unknown>>();

/** Runs `task` after every earlier task on the same reel, so two changes never write the reel's files at once. */
export function withReelLock<T>(reelDir: string, task: () => Promise<T>): Promise<T> {
  const run = (queues.get(reelDir) ?? Promise.resolve()).then(task, task);
  queues.set(reelDir, run.catch(() => undefined));
  return run;
}

export async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
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
  /** Where each flagged operation acts on the version it was replayed onto, when it has a place. */
  flaggedAt?: Record<string, FlaggedPlace>;
  /** The older base whose history was reset by replay. Kept until Save or Discard. */
  replayedFrom?: number;
  /** What the last save left out because it no longer applied. Kept until dismissed or the list changes. */
  skipped?: { version: number; edits: SkippedEdit[] };
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
    const flaggedAt = parsed.flaggedAt && typeof parsed.flaggedAt === 'object' ? (parsed.flaggedAt as Record<string, FlaggedPlace>) : undefined;
    const skipped = parsed.skipped && typeof parsed.skipped === 'object' && Array.isArray((parsed.skipped as { edits?: unknown }).edits) ? (parsed.skipped as NonNullable<Stored['skipped']>) : undefined;
    return { ...(parsed.anchor && typeof parsed.anchor === 'object' ? { anchor: parsed.anchor as WorkingInputs } : {}), ...(parsed.sourceHashes && typeof parsed.sourceHashes === 'object' ? { sourceHashes: parsed.sourceHashes as Record<string, string> } : {}), ...(Number.isInteger(parsed.frozen) ? { frozen: Number(parsed.frozen), ...(typeof parsed.frozenIdentity === 'string' ? { frozenIdentity: parsed.frozenIdentity } : {}), frozenOperations: Array.isArray(parsed.frozenOperations) ? parsed.frozenOperations.filter((id): id is string => typeof id === 'string') : [] } : {}), base: parsed.base as number, operations: known(parsed.operations), undo: knownLists(parsed.undo), redo: knownLists(parsed.redo), flagged, ...(flaggedAt ? { flaggedAt } : {}), ...(skipped ? { skipped } : {}), ...(Number.isInteger(parsed.replayedFrom) && Number(parsed.replayedFrom) >= 0 && Number(parsed.replayedFrom) < Number(parsed.base) ? { replayedFrom: Number(parsed.replayedFrom) } : {}) };
  } catch {
    return null;
  }
}

/** What the API says about a hand-off in force. */
const handoffOf = (handoff: Handoff | null): Pick<EditList, 'handedOff'> => (handoff ? { handedOff: { ...handoff, reason: handoffReason(handoff.version) } } : {});

/** The list as the API shows it: operations, whether Undo and Redo have anything to step to, and what holds Save back. */
function shown(stored: Stored, stale: boolean, handoff: Handoff | null): EditList {
  const flagged = Object.fromEntries(stored.operations.filter((op) => stored.flagged[op.id] !== undefined).map((op) => [op.id, stored.flagged[op.id]!]));
  const flaggedAt = Object.fromEntries(stored.operations.filter((op) => stored.flagged[op.id] !== undefined && stored.flaggedAt?.[op.id] !== undefined).map((op) => [op.id, stored.flaggedAt![op.id]!]));
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
    ...(Object.keys(flaggedAt).length > 0 ? { flaggedAt } : {}),
    ...(stored.skipped ? { skipped: stored.skipped } : {}),
  };
}

/** A list with nothing in it and no history to step back to is no list: the file goes. */
async function writeStored(reelDir: string, stored: Stored): Promise<void> {
  const file = join(reelDir, EDIT_LIST_FILE);
  if (stored.anchor === undefined && stored.frozen === undefined && stored.operations.length === 0 && stored.undo.length === 0 && stored.redo.length === 0) await rm(file, { force: true });
  else await writeJsonAtomic(file, stored);
}

/** The part of the stored list that says which inputs it applies to. */
type InputsOf = Pick<Stored, 'base' | 'anchor' | 'flagged'> & { operations: readonly Operation[] };

/**
 * The inputs an edit list applies to, and the folder their paths are relative to: the list's anchored base, or the version
 * the owner last chose with "use this version", which carries the whole of its own inputs.
 */
async function inputsFor(projectDir: string, reelDir: string, stored: InputsOf | null, cachedSpeech = true): Promise<WorkingInputs> {
  const filled = (inputs: WorkingInputs) => cachedSpeech ? withCachedSpeech(projectDir, inputs) : inputs;
  const used = stored && inputsVersion(stored) !== stored.base ? inputsVersion(stored) : undefined;
  if (used !== undefined) await requireVersionFolder(reelDir, used);
  if (await isCodeOnly(projectDir, reelDir)) {
    const planDir = join(reelDir, `v${used ?? stored?.base ?? await newestVersionNumber(reelDir)}`);
    return { sources: (await codeSources(planDir)).sources, planDir, transcript: {} };
  }
  if (used !== undefined) return filled(await resolveWorkingInputs(projectDir, reelDir, used, true));
  return filled(stored?.anchor ?? await resolveWorkingInputs(projectDir, reelDir));
}

/**
 * Working with the cached words of speech transcribed since its version, so an owner's fix to such a word applies on
 * Working and on Save. The stored anchor stays without them: the cache, not the edit list, holds the words.
 */
async function withCachedSpeech(projectDir: string, inputs: WorkingInputs): Promise<WorkingInputs> {
  const media = inputs.sources.plan.media;
  if (!media || media.legacy) return inputs;
  const filled = await withSpeech(projectDir, inputs.planDir, media, false);
  return filled === media ? inputs : { ...inputs, sources: { ...inputs.sources, plan: { ...inputs.sources.plan, media: filled } } };
}

/** A version the owner chooses must exist. */
async function requireVersionFolder(reelDir: string, version: number): Promise<void> {
  if (!await stat(join(reelDir, `v${version}`)).then((entry) => entry.isDirectory(), () => false)) throw new KinottaError('invalid', `There is no v${version} to use.`);
}

/** The reel's sources as the newest version has them: what an edit list applies to. */
async function currentSources(projectDir: string, reelDir: string, newestOnly = false): Promise<Sources> {
  if (newestOnly) {
    if (await isCodeOnly(projectDir, reelDir)) return (await codeSources(join(reelDir, `v${await newestVersionNumber(reelDir)}`))).sources;
    return (await resolveWorkingInputs(projectDir, reelDir, await newestVersionNumber(reelDir))).sources;
  }
  return (await inputsFor(projectDir, reelDir, await readStored(reelDir))).sources;
}

/**
 * The media Save would preserve: the newest version's sources with the edits that still apply, the authored duration, and
 * the folder its source paths are relative to. Null while the reel has no native media (a legacy reel not yet converted).
 */
export async function readPendingMedia(projectDir: string, slug: string): Promise<{ media: MediaPlan; duration: number; planDir: string } | null> {
  const reelDir = await requireReelDir(projectDir, slug);
  return withReelLock(reelDir, async () => {
    const list = await readEditListNow(projectDir, slug);
    const { sources, planDir } = await inputsFor(projectDir, reelDir, await readStored(reelDir));
    const applying = list.stale ? [] : workingOperations(list);
    const { plan } = applyOperations(sources, applying);
    return plan.media && !plan.media.legacy ? { media: plan.media, duration: plan.duration ?? 0, planDir } : null;
  });
}

/** The editing identities and path base, including legacy and authored-page adapters. */
export async function readMediaModel(projectDir: string, slug: string): Promise<MediaEditingModel> {
  const reelDir = await requireReelDir(projectDir, slug);
  return withReelLock(reelDir, async () => {
    await readEditListNow(projectDir, slug);
    const { sources, planDir } = await inputsFor(projectDir, reelDir, await readStored(reelDir));
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
async function replayOntoNewest(projectDir: string, reelDir: string, slug: string, stored: Stored, newest: number): Promise<Stored> {
  let sources: Sources;
  try {
    sources = await currentSources(projectDir, reelDir, true);
  } catch {
    return stored;
  }
  const flagged: Record<string, string> = {};
  const consumed = new Set(stored.frozenOperations ?? []);
  const newestSources = sources;
  const renames = await footageRenames(projectDir, reelDir, stored, newest);
  const operations = stored.operations.map((op) => [...renames].reduce((renamed, [from, to]) => renameLegacySource(renamed, from, to), op)).filter((op) => {
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
      const from = preservedPaths(applyOperations(base, workingOperations({ operations: frozen })));
      frozen = frozen.filter((op) => op.id !== undone.id);
      const to = preservedPaths(applyOperations(base, workingOperations({ operations: frozen })));
      reversals.push({ ...undone, id: randomUUID(), reversal: { from, to } });
    }
    operations.unshift(...reversals);
  }
  for (const op of operations) {
    if (flagged[op.id]) continue;
    // A version chosen before this newer one arrived would put back everything the agent has since changed.
    if (op.kind === 'use-version') {
      flagged[op.id] = `You chose v${op.version} before v${newest} was built. Choose it again to put it back.`;
      continue;
    }
    try {
      sources = applyOperations(sources, [op]);
    } catch (err) {
      flagged[op.id] = op.reversal ? `${describeOperation(op).text}. The agent changed the same part of the reel. Review this undo against the new version.` : err instanceof Error ? err.message : 'It no longer applies.';
    }
  }
  const flaggedAt = Object.keys(flagged).length > 0 ? await flaggedPlaces(projectDir, reelDir, slug, stored, newest, newestSources, new Set(Object.keys(flagged)), renames) : {};
  const anchor = await isCodeOnly(projectDir, reelDir) ? undefined : await resolveWorkingInputs(projectDir, reelDir, newest);
  const next: Stored = { ...(anchor ? { anchor } : {}), base: newest, operations, undo: [], redo: [], flagged, ...(Object.keys(flaggedAt).length > 0 ? { flaggedAt } : {}), replayedFrom: stored.base };
  await writeStored(reelDir, next);
  return next;
}

/**
 * Where each flagged edit acts, on the newest version: worked out on the version the edit was made on (where its target
 * still exists), then followed to the newest timeline, and the newest version's shot that plays there. An edit with no place
 * (a track change, say) or that cannot be followed is left out. Never throws: the places only help the owner find an edit.
 */
async function flaggedPlaces(projectDir: string, reelDir: string, slug: string, stored: Stored, newest: number, newestSources: Sources, ids: ReadonlySet<string>, renames: ReadonlyMap<string, string>): Promise<Record<string, FlaggedPlace>> {
  try {
    if (await isCodeOnly(projectDir, reelDir)) return {};
    let before = (stored.anchor ?? await resolveWorkingInputs(projectDir, reelDir, stored.base)).sources;
    const moments = new Map<string, OperationMoment>();
    for (const op of stored.operations) {
      if (ids.has(op.id) && !op.reversal) {
        const moment = operationMoment(op, before);
        if (moment) moments.set(op.id, moment);
      }
      try { before = applyOperations(before, [op]); } catch { /* Left out of what later edits are placed against, as in replay. */ }
    }
    if (moments.size === 0) return {};
    const shots = [...(await readVersionFiles(projectDir, slug, newest)).shots].sort((a, b) => a.start - b.start);
    const oldPlan = mediaEditingPlan((stored.anchor ?? await resolveWorkingInputs(projectDir, reelDir, stored.base)).sources);
    const newPlan = mediaEditingPlan(newestSources);
    const oldTimeline = mediaTimeline(oldPlan.media!, oldPlan.duration);
    const newTimeline = mediaTimeline(newPlan.media!, newPlan.duration);
    const places: Record<string, FlaggedPlace> = {};
    for (const [id, moment] of moments) {
      const renamed = moment.placement ? [...renames].reduce((placement, [from, to]) => renameLegacySource(placement, from, to), moment.placement) : undefined;
      const { time } = remapMediaMoment(oldTimeline, newTimeline, moment.time, renamed ? { placement: renamed, sourceTime: moment.sourceTime } : undefined);
      const shot = [...shots].reverse().find((s) => s.start <= time) ?? shots[0];
      places[id] = { time, ...(shot ? { shot: shot.number } : {}) };
    }
    return places;
  } catch {
    return {};
  }
}

/**
 * The legacy footage the list's base names that the newest version holds under another path (an agent's copy in its own
 * folder), by content hash: old source id to new. Empty for a code-only reel or when either side cannot be read.
 */
async function footageRenames(projectDir: string, reelDir: string, stored: Stored, newest: number): Promise<Map<string, string>> {
  try {
    if (await isCodeOnly(projectDir, reelDir)) return new Map();
    const before = stored.anchor ?? await resolveWorkingInputs(projectDir, reelDir, stored.base);
    const after = await resolveWorkingInputs(projectDir, reelDir, newest);
    return await legacyFootageRenames(projectDir, { media: editableMedia(before.sources), planDir: before.planDir }, { media: editableMedia(after.sources), planDir: after.planDir });
  } catch {
    return new Map();
  }
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
  if ((stored.frozen ?? stored.base) < newest) stored = await replayOntoNewest(projectDir, reelDir, slug, stored, newest);
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
  const { skipped: _skipped, ...kept } = stored;
  const next = { ...kept, operations, undo: [...stored.undo, stored.operations].slice(-HISTORY_LIMIT), redo: [] };
  await writeStored(reelDir, next);
  return next;
}

/** Throws `invalid` when the operations do not apply, in order, to the reel's plan and transcript. Flagged ones are left out. */
async function checkApplies(projectDir: string, reelDir: string, operations: readonly Operation[], flagged: Record<string, string>): Promise<void> {
  const stored = await readStored(reelDir);
  const list = { operations, flagged };
  // A reel built from code takes only element moves, applied to the scenes of its newest version.
  if (await isCodeOnly(projectDir, reelDir)) assertCodeOnlyOperations(operations.filter((op) => flagged[op.id] === undefined));
  // The inputs come from the list being checked, since a "use this version" in it changes them.
  const base = stored?.base ?? await newestVersionNumber(reelDir);
  const { sources } = await inputsFor(projectDir, reelDir, { base, ...(stored?.anchor ? { anchor: stored.anchor } : {}), ...list });
  applyOperations(sources, workingOperations(list));
}

/** Shared payload rules for owner edits and unattended output. */
export function validateOperationInput(input: NewOperation): void {
  if ('reversal' in input) throw new KinottaError('invalid', 'Undo reversals are recorded by Kinotta. Use Undo to reverse an edit.');
  if (!KINDS.has((input as { kind?: string }).kind ?? '')) throw new KinottaError('invalid', 'That kind of edit is not supported.');
  if (input.kind === 'use-version' && (!Number.isInteger(input.version) || input.version < 1)) throw new KinottaError('invalid', 'Choose a saved version by its number.');
  if (input.by !== undefined && (typeof input.by !== 'string' || !input.by.trim())) throw new KinottaError('invalid', 'An edit needs the name of who made it.');
  if ('reason' in input && (input as any).reason !== undefined) {
    if (input.kind !== 'snip' && input.kind !== 'shot-alternate-dismiss') throw new KinottaError('invalid', 'That kind of edit cannot carry a reason.');
    if (input.kind === 'snip' && (typeof (input as any).reason !== 'string' || !(input as any).reason.trim() || (input as any).reason.length > 120)) throw new KinottaError('invalid', 'A snip reason must be a non-empty string of at most 120 characters.');
  }
}

/** Caller holds the reel lock. A recovered agent batch is one durable, undoable append. */
export async function appendAgentCutsNow(projectDir: string, slug: string, cuts: readonly SnipOperation[]): Promise<void> {
  if (!cuts.length) return;
  const reelDir = await requireReelDir(projectDir, slug);
  const stored = await loadForChange(projectDir, reelDir, slug);
  const seen = new Set([...stored.operations, ...stored.undo.flat(), ...stored.redo.flat()].map((op) => op.id));
  for (const id of stored.frozenOperations ?? []) seen.add(id);
  const operations = [...stored.operations];
  const base = await currentSources(projectDir, reelDir);
  let sources = applyOperations(base, workingOperations({ operations, flagged: stored.flagged }));
  for (const cut of cuts) {
    validateOperationInput(cut);
    if (seen.has(cut.id)) continue;
    try {
      sources = applyOperations(sources, [cut]);
    } catch (error) {
      // The batch passed against authored inputs. Only a conflicting owner edit can supersede it.
      if (error instanceof KinottaError && error.code === 'invalid') {
        const agentOnly = operations.filter((op) => op.by === cut.by && stored.flagged[op.id] === undefined);
        // If the cut also fails without owner operations, it was not superseded by the owner.
        applyOperations(base, [...agentOnly, cut]);
        continue;
      }
      throw error;
    }
    operations.push(cut);
  }
  // Storage errors propagate; success means the complete accepted batch is durable.
  if (operations.length !== stored.operations.length) {
    await checkApplies(projectDir, reelDir, operations, stored.flagged);
    await commit(reelDir, stored, operations);
  }
}

/** Adds an operation to the list, after checking it applies on top of the ones already there. */
export async function addOperation(projectDir: string, slug: string, input: NewOperation): Promise<EditList> {
  const reelDir = await requireReelDir(projectDir, slug);
  return withReelLock(reelDir, () => addOperationNow(projectDir, slug, input));
}

/** Caller holds the reel lock, shared by comment and instant-pin writes. */
export async function addOperationNow(projectDir: string, slug: string, input: NewOperation): Promise<EditList> {
  const reelDir = await requireReelDir(projectDir, slug);
  const stored = await loadForChange(projectDir, reelDir, slug);
  validateOperationInput(input);
  const operation = { ...input, by: input.by?.trim() ?? 'you', id: randomUUID() } as Operation;
  const operations = [...stored.operations, operation];
  await checkApplies(projectDir, reelDir, operations, stored.flagged);
  return shown(await commit(reelDir, stored, operations), false, await readHandoff(reelDir, stored.frozen ?? stored.base));
}

/** Remove instant content while already holding the reel lock; an agent request adds no operation. */
export async function removeInstantPinNow(projectDir: string, slug: string, commentId: string): Promise<void> {
  const reelDir = await requireReelDir(projectDir, slug);
  const stored = await loadForChange(projectDir, reelDir, slug);
  const sources = await currentSources(projectDir, reelDir);
  let operations = stored.operations.filter((op) => op.kind !== 'pin-comment' || op.commentId !== commentId);
  // An instant inherited from an authored base needs a removal, rather than removal of its original add operation.
  if (applyOperations(sources, operations).plan.pinComments?.[commentId]?.instant) {
    operations = [...operations, { id: randomUUID(), by: 'you', kind: 'pin-comment', commentId, comment: null }];
  }
  await checkApplies(projectDir, reelDir, operations, stored.flagged);
  await commit(reelDir, stored, operations);
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
    const { skipped: _skipped, ...kept } = stored;
    const next: Stored =
      direction === 'undo'
        ? { ...kept, operations: target, undo: rest, redo: [...stored.redo, stored.operations] }
        : { ...kept, operations: target, redo: rest, undo: [...stored.undo, stored.operations] };
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

/** Clears the note about edits the last save left out. The edits stay in Undo. */
export async function dismissSkipped(projectDir: string, slug: string): Promise<EditList> {
  const reelDir = await requireReelDir(projectDir, slug);
  return withReelLock(reelDir, async () => {
    const stored = await readStored(reelDir);
    if (stored?.skipped) {
      const { skipped: _skipped, ...kept } = stored;
      await writeStored(reelDir, kept);
    }
    return readEditListNow(projectDir, slug);
  });
}

/**
 * The state once a save has left out the edits that no longer applied: they leave the list as one step Undo reverses (the
 * list before it goes on the undo stack, flags and all), and a note names them until it is dismissed.
 */
export function withoutFlagged(stored: Stored, skipped: readonly SkippedEdit[], version: number): Stored {
  if (skipped.length === 0) return stored;
  const gone = new Set(skipped.map((edit) => edit.id));
  return { ...stored, operations: stored.operations.filter((op) => !gone.has(op.id)), undo: [...stored.undo, stored.operations].slice(-HISTORY_LIMIT), redo: [], skipped: { version, edits: [...skipped] } };
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

/** With `strict`, a version that kept no plan is refused, rather than read from the reel's current plan, which is not what that version held. */
async function resolveWorkingInputs(projectDir: string, reelDir: string, authoredVersion?: number, strict = false): Promise<WorkingInputs> {
  if (authoredVersion !== undefined) {
    const planDir = join(reelDir, `v${authoredVersion}`);
    const text = await readFile(join(planDir, 'plan.json'), 'utf8').catch(() => null);
    if (text === null && strict) throw new KinottaError('invalid', `v${authoredVersion} did not keep its plan, so it cannot be used as the current reel.`);
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
export async function workingInputs(projectDir: string, reelDir: string, options: { cachedSpeech?: boolean } = {}): Promise<WorkingInputs> {
  const filled = (inputs: WorkingInputs) => options.cachedSpeech === false ? inputs : withCachedSpeech(projectDir, inputs);
  const stored = await workingState(reelDir);
  // A chosen version brings its own inputs; the anchor stays what the base was.
  if (inputsVersion(stored) !== stored.base) return options.cachedSpeech === false ? inputsFor(projectDir, reelDir, stored, false) : inputsFor(projectDir, reelDir, stored);
  if (stored.anchor) return filled(stored.anchor);
  const anchor = await resolveWorkingInputs(projectDir, reelDir);
  await writeStored(reelDir, { ...stored, anchor });
  return filled(anchor);
}

/** Media added by an operation must keep its original identity across later freezes too. */
export async function withPreservedMediaHashes(reelDir: string, sources: Sources): Promise<Sources> {
  if (!sources.plan.media) return sources;
  const hashes = (await readStored(reelDir))?.sourceHashes ?? {};
  return { ...sources, plan: { ...sources.plan, media: { ...sources.plan.media, sources: sources.plan.media.sources.map((source) => hashes[source.id] ? { ...source, contentHash: hashes[source.id] } : source) } } };
}

/** Unapplied anchored inputs, read while the caller holds the reel lock. */
export const workingSources = (projectDir: string, reelDir: string): Promise<Sources> => currentSources(projectDir, reelDir);
