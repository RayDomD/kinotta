import { randomUUID } from 'node:crypto';
import { readState, serialized, stateFilePath, writeState } from './state.ts';
import type { StoredComment } from './state.ts';
import type { CarryNotice, Shot, Version } from './types.ts';
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

/** Moves a comment's pin onto the shot of the new version that matches the old one, or null when none does. */
function carriedComment(comment: StoredComment, from: Version, to: Version, sectionId: string): StoredComment | null {
  const old = from.shots.find((s) => s.number === comment.pin.shot);
  if (!old) return null;
  const match = to.shots.find((s) => sectionOfShot(to, s) === sectionId && s.start === old.start && s.title === old.title);
  if (!match) return null;
  const section = match.section ?? null;
  const pin =
    comment.pin.kind === 'word'
      ? { ...comment.pin, version: to.number, section, shot: match.number }
      : { ...comment.pin, version: to.number, section, shot: match.number, time: match.start };
  return { ...comment, id: randomUUID(), pin };
}

/**
 * Hands the unsent comments of version n-1 over to version n, once (F4). Comments already sent to Claude stay where they
 * are, frozen with their batch; so do comments on sections the new version changed. Both sides record the outcome, and
 * settling twice does nothing. Comments only ever move from the version right before.
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

    const carried: string[] = [];
    const notCarried: string[] = [];
    const moved: StoredComment[] = [];
    for (const comment of previousState.comments) {
      if (isSent(previousState.handedOff, comment.id)) continue;
      const sectionId = sectionOfComment(previous, comment);
      const copy = changed.has(sectionId) ? null : carriedComment(comment, previous, version, sectionId);
      if (copy) {
        moved.push(copy);
        carried.push(comment.id);
      } else {
        notCarried.push(comment.id);
      }
    }
    const stillWaiting = [...new Set([...(previousState.waiting ?? []), ...Object.keys(previousState.handedOff ?? {})])].filter(
      (id) => !changed.has(id) && version.sections.some((s) => s.id === id),
    );

    // The older version first: the marker on the new one is what says settling is done.
    await writeState(previousFile, { ...previousState, carriedTo: { version: n, carried, notCarried } });
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

/** A version as the app sees it: its files, its changed sections, and the sections still waiting on Claude. */
export async function readVersion(projectDir: string, slug: string, number: number): Promise<Version> {
  await settleNewest(projectDir, slug);
  const version = await readVersionFiles(projectDir, slug, number);
  const state = await readState(stateFilePath(projectDir, slug, number), number).catch(() => null);
  if (state === null) return version;
  const waiting = new Set([...(state.waiting ?? []), ...Object.keys(state.handedOff ?? {})]);
  return { ...version, sections: version.sections.map((s) => (waiting.has(s.id) ? { ...s, waiting: true as const } : s)) };
}

/** The unsent comments version n-1 kept because their section changed, or null when there are none. */
export async function carryNotice(projectDir: string, slug: string, number: number): Promise<CarryNotice | null> {
  await settleNewest(projectDir, slug);
  if (number < 2) return null;
  const [state, previousState] = await Promise.all([
    readState(stateFilePath(projectDir, slug, number), number),
    readState(stateFilePath(projectDir, slug, number - 1), number - 1),
  ]);
  const left = new Set(state.carriedFrom ? (previousState.carriedTo?.notCarried ?? []) : []);
  if (left.size === 0) return null;
  const [previous, version] = await Promise.all([readVersionFiles(projectDir, slug, number - 1), readVersionFiles(projectDir, slug, number)]);
  const order = version.sections.map((s) => s.id);
  const rank = (id: string): number => (order.includes(id) ? order.indexOf(id) : order.length);
  const kept = previousState.comments.filter((c) => left.has(c.id));
  const sections = [...new Set(kept.map((c) => sectionOfComment(previous, c)))].sort((a, b) => rank(a) - rank(b));
  return { from: number - 1, count: kept.length, sections };
}
