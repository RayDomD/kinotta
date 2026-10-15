import type { Comment, Shot } from './api/index.ts';

/** The shot a comment is pinned on: by its parts name when it has one, else by its number. */
export function pinnedShot(comment: Comment, shots: readonly Shot[]): Shot | undefined {
  const name = comment.pin.kind === 'frame' ? comment.pin.shotName : undefined;
  return shots.find((shot) => name ? shot.name === name : shot.number === comment.pin.shot);
}

/** False for a pin placed on an alternate that is not the one in the reel: it belongs on that alternate only. */
export function onReelAlternate(comment: Comment, shots: readonly Shot[]): boolean {
  const alternate = comment.pin.kind === 'frame' ? comment.pin.alternate : undefined;
  if (!alternate) return true;
  const shot = pinnedShot(comment, shots);
  return !shot || shot.revision === alternate;
}

/** The letter of the alternate a pin is on ("B"), or null for a pin on no particular alternate. */
export function alternateLabel(comment: Comment, shots: readonly Shot[]): string | null {
  const alternate = comment.pin.kind === 'frame' ? comment.pin.alternate : undefined;
  if (!alternate) return null;
  return pinnedShot(comment, shots)?.alternates?.find((candidate) => candidate.revision === alternate)?.label ?? null;
}
