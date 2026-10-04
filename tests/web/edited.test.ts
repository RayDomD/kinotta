import { describe, expect, it } from 'vitest';
import { dropIndex } from '../../web/src/review/_internal/Lanes.tsx';
import { captionShifts, remap, sourceStretches } from '../../web/src/review/_internal/edited.ts';

const SAVED = [{ in: 0, out: 12 }];
/** Seconds 3 to 5 snipped. */
const EDITED = [{ in: 0, out: 3 }, { in: 5, out: 12 }];

describe('remap', () => {
  const map = remap(SAVED, EDITED);

  it('moves a time after the snip earlier, and drops one inside it', () => {
    expect(map.point(1)).toBe(1);
    expect(map.point(6)).toBe(4);
    expect(map.point(4)).toBeNull();
  });

  it('trims a span that crosses the snip and drops one inside it', () => {
    expect(map.span(2, 6)).toEqual({ start: 2, end: 4 });
    expect(map.span(3.5, 4.5)).toBeNull();
    expect(map.span(7, 9)).toEqual({ start: 5, end: 7 });
  });

  it('gives the saved time the page should show for an edited time', () => {
    expect(map.page(4)).toBe(6);
    expect(map.page(1)).toBe(1);
  });

  it('leaves everything where it is when there are no edits', () => {
    const none = remap(SAVED, SAVED);
    expect(none.point(4)).toBe(4);
    expect(none.page(4)).toBe(4);
  });
});

describe('remap with pieces moved', () => {
  // Cut at 6, second half moved first.
  const moved = remap([{ in: 0, out: 12 }], [{ in: 6, out: 12 }, { in: 0, out: 6 }]);

  it('moves a span with its piece and keeps a span across the cut in its longer half', () => {
    expect(moved.span(7, 9)).toEqual({ start: 1, end: 3 });
    expect(moved.span(1, 3)).toEqual({ start: 7, end: 9 });
    expect(moved.span(3.2, 6.2)).toEqual({ start: 9.2, end: 12 });
    expect(moved.point(2)).toBe(8);
  });

  it('gives the saved time for an edited time', () => {
    expect(moved.page(1)).toBe(7);
  });
});

describe('sourceStretches', () => {
  it('turns a stretch of the edited timeline into source stretches, merging ones with only a snipped gap between', () => {
    expect(sourceStretches([{ in: 0, out: 6 }, { in: 6, out: 12 }], 4, 8)).toEqual([{ from: 4, to: 8 }]);
    expect(sourceStretches(EDITED, 2, 4)).toEqual([{ from: 2, to: 6 }]);
    // Pieces played out of order stay separate.
    expect(sourceStretches([{ in: 6, out: 10 }, { in: 0, out: 4 }], 2, 6)).toEqual([{ from: 8, to: 10 }, { from: 0, to: 2 }]);
  });
});

describe('dropIndex', () => {
  const pieces = [{ in: 0, out: 4, at: 0 }, { in: 4, out: 8, at: 4 }, { in: 8, out: 12, at: 8 }];

  it('places a dragged piece after every other piece whose middle it has passed', () => {
    expect(dropIndex(pieces, 2, -3)).toBe(2);
    expect(dropIndex(pieces, 2, -5)).toBe(1);
    expect(dropIndex(pieces, 2, -9)).toBe(0);
    expect(dropIndex(pieces, 0, 5)).toBe(1);
    expect(dropIndex(pieces, 0, 9)).toBe(2);
    expect(dropIndex(pieces, 1, 1)).toBe(1);
  });
});

describe('captionShifts', () => {
  const words = [
    { text: 'hello', start: 0.5, end: 0.9 },
    { text: 'there', start: 1, end: 1.4 },
    { text: 'later', start: 8.2, end: 8.6 },
  ];
  const starts = [0.5, 8.2];
  const shown = (...args: Parameters<typeof captionShifts>) => captionShifts(...args)?.map(({ x, y, own }) => ({ x, y, own })) ?? null;
  const all = (x: number, y: number) => ({ id: 'a', kind: 'caption-position' as const, x, y });
  const one = (at: number, x: number, y: number) => ({ id: 'b', kind: 'caption-phrase-position' as const, at, x, y });

  it('is null when captions are off, and zero for a plan nobody moved', () => {
    expect(shown(undefined, [], words, starts)).toBeNull();
    expect(shown(true, [], words, starts)).toEqual([{ x: 0, y: 0, own: false }, { x: 0, y: 0, own: false }]);
  });

  it('shows the saved positions, and the unsaved ones over them: the reel-wide position replaces, the phrase adds to it', () => {
    const saved = { position: { x: 10, y: 0 }, phrases: [{ at: 8.2, x: 0, y: -50 }] };
    expect(shown(saved, [], words, starts)).toEqual([{ x: 10, y: 0, own: false }, { x: 10, y: -50, own: true }]);
    expect(shown(saved, [all(30, 5), one(0.5, 0, 9)], words, starts)).toEqual([{ x: 30, y: 14, own: true }, { x: 30, y: -45, own: true }]);
  });

  it('names the phrase by its first word as re-timed, and keeps the reel-wide part apart', () => {
    const moved = [all(30, 5), one(8.2, 0, -50), { id: 'c', kind: 'word-timing' as const, at: 8.2, start: 8.3, end: 8.6 }];
    const [, second] = captionShifts(true, moved, words, starts)!;
    expect(second).toMatchObject({ key: 8.3, wide: { x: 30, y: 5 }, x: 30, y: -45 });
  });

  it('follows a phrase whose first word is re-timed', () => {
    const moved = [one(8.2, 0, -50), { id: 'c', kind: 'word-timing' as const, at: 8.2, start: 8.3, end: 8.6 }];
    expect(shown(true, moved, words, starts)).toEqual([{ x: 0, y: 0, own: false }, { x: 0, y: -50, own: true }]);
  });
});
