import { describe, expect, it } from 'vitest';
import {
  anchorCutWindow,
  centerWindow,
  follow,
  followWindow,
  mapTimeThroughCut,
  pieceIndexAt,
  sourceAt,
  stepTime,
  tickTimes,
  zoomWindow,
} from '../../web/src/review/_internal/timeline.ts';

/** Seconds 3 to 5 of a 12 s video are snipped. */
const SNIPPED = [
  { in: 0, out: 3, at: 0 },
  { in: 5, out: 12, at: 3 },
];
/** The same two stretches in the other order. */
const SWAPPED = [
  { in: 5, out: 12, at: 0 },
  { in: 0, out: 3, at: 7 },
];

describe('mapping a timeline time to the source', () => {
  it('finds the piece and the source time, with a time on a join taking the piece that starts there', () => {
    expect(pieceIndexAt(SNIPPED, 1)).toBe(0);
    expect(pieceIndexAt(SNIPPED, 3)).toBe(1);
    expect(sourceAt(SNIPPED, 2.5)).toBe(2.5);
    expect(sourceAt(SNIPPED, 3)).toBe(5);
    expect(sourceAt(SNIPPED, 4)).toBe(6);
    expect(sourceAt(SWAPPED, 7.5)).toBe(0.5);
  });

  it('clamps to the ends of the timeline', () => {
    expect(sourceAt(SNIPPED, -1)).toBe(0);
    expect(sourceAt(SNIPPED, 99)).toBe(12);
    expect(pieceIndexAt(SNIPPED, 99)).toBe(1);
  });
});

describe('following the pieces during playback', () => {
  it('reports the timeline time while inside a piece', () => {
    expect(follow(SNIPPED, 0, 2)).toEqual({ index: 0, time: 2, seekTo: null, ended: false });
    expect(follow(SNIPPED, 1, 6)).toEqual({ index: 1, time: 4, seekTo: null, ended: false });
  });

  it('jumps over a snip when a piece ends, to where the next one starts', () => {
    expect(follow(SNIPPED, 0, 3)).toEqual({ index: 1, time: 3, seekTo: 5, ended: false });
  });

  it('does not seek when the next piece carries on from the same source time (a cut)', () => {
    const cut = [
      { in: 0, out: 4, at: 0 },
      { in: 4, out: 12, at: 4 },
    ];
    expect(follow(cut, 0, 4)).toEqual({ index: 1, time: 4, seekTo: null, ended: false });
  });

  it('follows the order of the pieces, not the source', () => {
    expect(follow(SWAPPED, 0, 12)).toEqual({ index: 1, time: 7, seekTo: 0, ended: false });
  });

  it('ends on the last piece\'s out', () => {
    expect(follow(SNIPPED, 1, 12)).toEqual({ index: 1, time: 10, seekTo: null, ended: true });
  });

  it('treats a video that has ended as past the piece\'s out', () => {
    expect(follow(SNIPPED, 0, Number.POSITIVE_INFINITY).index).toBe(1);
  });

  it('never reports a time before the piece starts, while a seek is still landing', () => {
    expect(follow(SNIPPED, 1, 3.2).time).toBe(3);
  });
});

describe('stepping a frame', () => {
  it('moves by whole frames and stays on the timeline', () => {
    expect(stepTime(1, 1, 10)).toBeCloseTo(1 + 1 / 30, 9);
    expect(stepTime(1, -3, 10)).toBeCloseTo(1 - 3 / 30, 9);
    expect(stepTime(0, -1, 10)).toBe(0);
    expect(stepTime(10, 1, 10)).toBe(10);
  });
});

describe('the zoom window', () => {
  const total = 120;

  it('zooms in around a point and keeps that point where it was', () => {
    const next = zoomWindow({ start: 30, length: 20 }, 0.5, 40, total);
    expect(next.length).toBe(10);
    expect(next.start).toBe(35);
  });

  it('cannot zoom out past the reel, or in past the smallest window', () => {
    expect(zoomWindow({ start: 0, length: 100 }, 4, 50, total)).toEqual({ start: 0, length: 120 });
    expect(zoomWindow({ start: 10, length: 2 }, 0.25, 11, total).length).toBe(2);
  });

  it('stays inside the reel', () => {
    expect(centerWindow({ start: 0, length: 20 }, 1, total)).toEqual({ start: 0, length: 20 });
    expect(centerWindow({ start: 0, length: 20 }, 119, total)).toEqual({ start: 100, length: 20 });
    expect(centerWindow({ start: 0, length: 20 }, 60, total)).toEqual({ start: 50, length: 20 });
  });

  it('leaves the window alone while the playhead is inside it', () => {
    const win = { start: 30, length: 20 };
    expect(followWindow(win, 49, total)).toBe(win);
  });

  it('pages to bring the playhead back, with it near the left edge going forward', () => {
    expect(followWindow({ start: 30, length: 20 }, 51, total)).toEqual({ start: 49, length: 20 });
    expect(followWindow({ start: 30, length: 20 }, 29, total).start).toBeCloseTo(27, 9);
  });

  it('has 4 to 8 ticks across the window, on round times', () => {
    const ticks = tickTimes({ start: 34, length: 12 });
    expect(ticks[0]).toBe(34);
    expect(ticks.length).toBeGreaterThanOrEqual(4);
    expect(ticks.length).toBeLessThanOrEqual(8);
    expect(ticks.every((t) => t >= 34 && t <= 46)).toBe(true);
  });
});

describe('mapTimeThroughCut', () => {
  it('leaves times before the cut unchanged', () => {
    expect(mapTimeThroughCut(2, 4, 7)).toBe(2);
    expect(mapTimeThroughCut(0, 4, 7)).toBe(0);
    expect(mapTimeThroughCut(3.99, 4, 7)).toBe(3.99);
  });

  it('maps times within the cut to the cut start', () => {
    expect(mapTimeThroughCut(4, 4, 7)).toBe(4);
    expect(mapTimeThroughCut(5.5, 4, 7)).toBe(4);
    expect(mapTimeThroughCut(7, 4, 7)).toBe(4);
  });

  it('shifts times after the cut earlier by cut duration', () => {
    expect(mapTimeThroughCut(8, 4, 7)).toBe(5);
    expect(mapTimeThroughCut(10, 4, 7)).toBe(7);
  });

  it('clamps to [0, newTotal] when newTotal is provided', () => {
    expect(mapTimeThroughCut(10, 4, 7, 6)).toBe(6);
    expect(mapTimeThroughCut(8, 4, 7, 6)).toBe(5);
    expect(mapTimeThroughCut(-2, 4, 7, 6)).toBe(0);
  });
});

describe('anchorCutWindow', () => {
  it('keeps seconds-per-pixel scale unchanged (length remains win.length)', () => {
    const win = { start: 10, length: 15 };
    const anchored = anchorCutWindow(win, 12, 14);
    expect(anchored.length).toBe(15);
  });

  it('shifts window earlier when cutEnd <= win.start', () => {
    // Cut is [2, 5], duration is 3. win is [10, 25].
    // cutEnd (5) <= win.start (10) -> shifted earlier by 3: start = 7.
    expect(anchorCutWindow({ start: 10, length: 15 }, 2, 5)).toEqual({ start: 7, length: 15 });
    // Clamping to start >= 0
    expect(anchorCutWindow({ start: 2, length: 15 }, 0, 4)).toEqual({ start: 0, length: 15 });
  });

  it('sets start = cutStart when cutStart <= win.start and win.start < cutEnd', () => {
    // Cut is [4, 8]. win.start is 6.
    // 4 <= 6 && 6 < 8 -> start = 4.
    expect(anchorCutWindow({ start: 6, length: 15 }, 4, 8)).toEqual({ start: 4, length: 15 });
    // Exact boundary at cutStart: win.start = 4
    expect(anchorCutWindow({ start: 4, length: 15 }, 4, 8)).toEqual({ start: 4, length: 15 });
  });

  it('leaves start unchanged when win.start < cutStart', () => {
    // Cut is [8, 12]. win.start is 5.
    // win.start (5) < cutStart (8) -> start remains 5.
    expect(anchorCutWindow({ start: 5, length: 15 }, 8, 12)).toEqual({ start: 5, length: 15 });
  });
});
