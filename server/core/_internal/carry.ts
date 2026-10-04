import { randomUUID } from 'node:crypto';
import { readState, serialized, stateFilePath, writeState } from './state.ts';
import { MOMENT_REMOVED } from './state.ts';
import type { StoredComment } from './state.ts';
import { pieceMap, toSource, toTimeline } from './pieces.ts';
import type { PieceMap } from './pieces.ts';
import type { Shot, Version } from './types.ts';
import { newestVersionNumber, readVersion as readVersionFiles, requireReelDir } from './version.ts';

/** The id of the section a shot belongs to. Every shot of a version has one, but a shot can be missing from a version. */
export function sectionOfShot(version: Version, shot: Shot | undefined): string {
  return shot?.section ?? version.sections[0]!.id;
}

/** The section a comment is in, by the shot its pin is on. */
export function sectionOfComment(version: Version, comment: StoredComment): string {
  const shot = version.shots.find((s) => s.number === comment.pin.shot);
  return shot ? sectionOfShot(version, shot) : (comment.pin.section ?? version.sections[0]!.id);
}

/** The comment's id, if any hand-off of its version holds it. */
export function isSent(handedOff: Record<string, { commentIds: string[] }> | undefined, id: string): boolean {
  return Object.values(handedOff ?? {}).some((h) => h.commentIds.includes(id));
}

const TIME_DECIMALS = 1e6;
const roundTime = (seconds: number): number => Math.round(seconds * TIME_DECIMALS) / TIME_DECIMALS;
/** The engine rounds times to 6 decimals, so a moment on a join can read a hair early; it is looked up this much later. */
const JOIN_NUDGE = 5e-7;

/** A version's pieces as a map; none, or none that make a valid map, is one piece over the whole version. */
function mapOf(version: Version): PieceMap {
  try {
    return pieceMap(version.pieces, version.duration);
  } catch {
    return pieceMap(undefined, version.duration);
  }
}

/**
 * Where a moment of `from`'s timeline is on `to`'s: through the source time both versions' pieces share. A moment in a
 * snipped stretch has no place; `removed` then says so, and `time` is where the snip closed up (the start of the next
 * piece in the source, else the end).
 */
export function remapMoment(from: Version, to: Version, time: number): { time: number; removed: boolean } {
  const target = mapOf(to);
  const source = toSource(mapOf(from), time + JOIN_NUDGE);
  const placed = source === null ? null : toTimeline(target, source);
  if (placed !== null) return { time: roundTime(placed - JOIN_NUDGE), removed: false };
  const after = [...target.pieces].sort((a, b) => a.in - b.in).find((p) => source !== null && p.in >= source);
  return { time: roundTime(after ? after.at : target.length), removed: true };
}

/** The shot of `version` that plays at a time: the last one that has started, or the first when none has. */
function shotAt(version: Version, time: number): Shot | undefined {
  const ordered = [...version.shots].sort((a, b) => a.start - b.start);
  return [...ordered].reverse().find((s) => s.start <= time) ?? ordered[0];
}

/** The comment as the new version holds it: a new id, its pin on the remapped moment, marked when that moment is gone. */
function carriedComment(comment: StoredComment, from: Version, to: Version): StoredComment {
  const moment = remapMoment(from, to, comment.pin.time);
  const shot = shotAt(to, moment.time);
  const place = { version: to.number, section: shot?.section ?? null, shot: shot?.number ?? comment.pin.shot, time: moment.time };
  const removed = moment.removed || comment.state === MOMENT_REMOVED;
  return { ...comment, id: randomUUID(), pin: { ...comment.pin, ...place }, ...(removed ? { state: MOMENT_REMOVED } : {}) };
}

/**
 * Hands the unsent comments of version n-1 over to version n, once (F4, E15), whoever built n: each follows its moment
 * through source time. Comments already sent to an agent stay where they are, frozen with their batch. Both sides record
 * the outcome, and settling twice does nothing. Comments only ever move from the version right before.
 */
async function settle(projectDir: string, slug: string, n: number): Promise<void> {
  if (n < 2 || (await readState(stateFilePath(projectDir, slug, n), n)).carriedFrom !== undefined) return;
  await settle(projectDir, slug, n - 1);
  const file = stateFilePath(projectDir, slug, n);
  await serialized(file, async () => {
    const state = await readState(file, n);
    if (state.carriedFrom !== undefined) return;
    const previousFile = stateFilePath(projectDir, slug, n - 1);
    const previousState = await readState(previousFile, n - 1);
    // A version before that saved nothing leaves nothing to carry or wait on, and gets no file written for it.
    const hasHistory = previousState.comments.length > 0 || (previousState.waiting ?? []).length > 0 || Object.keys(previousState.handedOff ?? {}).length > 0;
    if (!hasHistory) return;
    const previous = await readVersionFiles(projectDir, slug, n - 1);
    const version = await readVersionFiles(projectDir, slug, n);
    const changed = new Set(version.changedSections ?? []);

    // Every unsent comment goes with its moment; sent ones stay with their batch.
    const carried: string[] = [];
    const moved: StoredComment[] = [];
    for (const comment of previousState.comments) {
      if (isSent(previousState.handedOff, comment.id)) continue;
      moved.push(carriedComment(comment, previous, version));
      carried.push(comment.id);
    }
    const stillWaiting = [...new Set([...(previousState.waiting ?? []), ...Object.keys(previousState.handedOff ?? {})])].filter(
      (id) => !changed.has(id) && version.sections.some((s) => s.id === id),
    );

    // The older version first: the marker on the new one is what says settling is done.
    await writeState(previousFile, { ...previousState, carriedTo: { version: n, carried } });
    await writeState(file, {
      ...state,
      comments: [...state.comments, ...moved],
      waiting: stillWaiting,
      carriedFrom: { version: n - 1, ids: moved.map((c) => c.id) },
    });
  });
}

/**
 * Settles the newest version of a reel if it has not been (and the ones before it). Anything that reads or changes
 * comments calls this first, so carry-forward happens on the first touch of a new version. Never throws: a reel that
 * cannot be read is left for the caller's own checks to report.
 */
export async function settleNewest(projectDir: string, slug: string): Promise<void> {
  try {
    await settle(projectDir, slug, await newestVersionNumber(await requireReelDir(projectDir, slug)));
  } catch {
    // Unreadable versions or state carry nothing forward yet; the next touch tries again.
  }
}

/** A version as the app sees it: its files, its changed sections, and the sections still waiting on an agent. */
export async function readVersion(projectDir: string, slug: string, number: number): Promise<Version> {
  await settleNewest(projectDir, slug);
  const version = await readVersionFiles(projectDir, slug, number);
  const state = await readState(stateFilePath(projectDir, slug, number), number).catch(() => null);
  if (state === null) return version;
  const waiting = new Set([...(state.waiting ?? []), ...Object.keys(state.handedOff ?? {})]);
  return { ...version, sections: version.sections.map((s) => (waiting.has(s.id) ? { ...s, waiting: true as const } : s)) };
}
