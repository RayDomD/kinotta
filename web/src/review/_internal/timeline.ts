/**
 * Pure time arithmetic for the Review tab: the pieces' mapping between the reel's timeline and the source video,
 * how playback follows the pieces, and the zoom window the lanes show. No React, no DOM.
 */

/** A stretch of the source video kept in the reel, with where it starts on the timeline (seconds). */
export interface Piece {
  in: number;
  out: number;
  at: number;
}

/** The part of the timeline the lanes show. */
export interface TimeWindow {
  start: number;
  length: number;
}

/** What one step of playback reports after reading the video's clock. */
export interface Follow {
  /** The piece now playing. */
  index: number;
  /** Timeline seconds. */
  time: number;
  /** Source second to jump the video to (a snip or a reordered piece), or null to let it run on. */
  seekTo: number | null;
  /** The last piece has played out. */
  ended: boolean;
}

/** Frames per second of a frame step. Footage frame rates vary; 30 is the step the keyboard moves by. */
export const FRAME_RATE = 30;
/** A video within this many seconds of a piece's out has played it: the clock never lands exactly on it. */
const END_TOLERANCE = 0.02;
/** The window never shows less than this, or more than the reel. */
const MIN_WINDOW = 2;
/** Where the playhead lands in the window when it has to page: this fraction in from the left. */
const PAGE_MARGIN = 0.1;
const TICK_STEPS = [0.5, 1, 2, 3, 5, 10, 15, 20, 30, 60, 120, 300, 600, 1800, 3600];
const MAX_TICKS = 8;

const clamp = (value: number, low: number, high: number): number => Math.min(Math.max(value, low), high);

/** One piece over a whole video of `length` seconds: a reel with no pieces yet. */
export function wholeVideo(length: number): Piece[] {
  return [{ in: 0, out: length, at: 0 }];
}

/** The pieces' total length: the reel's length on the timeline. */
export function timelineLength(pieces: readonly Piece[]): number {
  const last = pieces[pieces.length - 1];
  return last ? last.at + last.out - last.in : 0;
}

/** Index of the piece a timeline time falls in. A time on a join takes the piece that starts there; past the end takes the last. */
export function pieceIndexAt(pieces: readonly Piece[], time: number): number {
  const found = pieces.findIndex((p) => time >= p.at && time < p.at + p.out - p.in);
  return found >= 0 ? found : time <= 0 ? 0 : pieces.length - 1;
}

/** Source second of a timeline time, clamped to the timeline. */
export function sourceAt(pieces: readonly Piece[], time: number): number {
  const piece = pieces[pieceIndexAt(pieces, time)];
  if (!piece) return 0;
  return clamp(piece.in + time - piece.at, piece.in, piece.out);
}

/**
 * Reads the video's clock while piece `index` plays. Inside the piece it gives the timeline time; at the piece's out
 * it moves on to the next one, jumping the video only when that piece does not carry on from the same source second,
 * which is how a snip is skipped and a reordered piece is followed; after the last piece it reports the end.
 */
export function follow(pieces: readonly Piece[], index: number, sourceTime: number): Follow {
  const piece = pieces[index]!;
  if (sourceTime < piece.out - END_TOLERANCE) {
    return { index, time: piece.at + Math.max(0, sourceTime - piece.in), seekTo: null, ended: false };
  }
  const next = pieces[index + 1];
  if (!next) return { index, time: piece.at + piece.out - piece.in, seekTo: null, ended: true };
  return { index: index + 1, time: next.at, seekTo: next.in === piece.out ? null : next.in, ended: false };
}

/** A time moved by whole frames, kept on the timeline. */
export function stepTime(time: number, frames: number, length: number): number {
  return clamp(time + frames / FRAME_RATE, 0, length);
}

const fit = (win: TimeWindow, total: number): TimeWindow => {
  const length = clamp(win.length, Math.min(MIN_WINDOW, total), total);
  return { start: clamp(win.start, 0, total - length), length };
};

/** The window `factor` times as long (0.5 zooms in), keeping the time `around` at the same place in it. */
export function zoomWindow(win: TimeWindow, factor: number, around: number, total: number): TimeWindow {
  const length = clamp(win.length * factor, Math.min(MIN_WINDOW, total), total);
  const fraction = (around - win.start) / win.length;
  return fit({ start: around - fraction * length, length }, total);
}

/** The window moved so `time` is at its middle. */
export function centerWindow(win: TimeWindow, time: number, total: number): TimeWindow {
  return fit({ start: time - win.length / 2, length: win.length }, total);
}

/** The window the playhead needs: unchanged while it is inside, else paged so the playhead sits near the left edge. */
export function followWindow(win: TimeWindow, time: number, total: number): TimeWindow {
  if (time >= win.start && time <= win.start + win.length) return win;
  return fit({ start: time - win.length * PAGE_MARGIN, length: win.length }, total);
}

/** Axis ticks inside the window: at most 8, on round times. */
export function tickTimes(win: TimeWindow): number[] {
  const step = TICK_STEPS.find((s) => Math.floor(win.length / s) + 1 <= MAX_TICKS) ?? TICK_STEPS[TICK_STEPS.length - 1]!;
  const ticks: number[] = [];
  for (let t = Math.ceil(win.start / step) * step; t <= win.start + win.length + 1e-9; t += step) ticks.push(Math.round(t * 1000) / 1000);
  return ticks;
}

/** Where a time sits in the window, as a percentage of its width (outside 0 to 100 when it is off to one side). */
export function percentIn(win: TimeWindow, time: number): number {
  return ((time - win.start) / win.length) * 100;
}
