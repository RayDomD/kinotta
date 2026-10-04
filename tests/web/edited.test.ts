import { describe, expect, it } from 'vitest';
import { remap, sourceStretches } from '../../web/src/review/_internal/edited.ts';

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

describe('sourceStretches', () => {
  it('turns a stretch of the edited timeline into source stretches, merging ones with only a snipped gap between', () => {
    expect(sourceStretches([{ in: 0, out: 6 }, { in: 6, out: 12 }], 4, 8)).toEqual([{ from: 4, to: 8 }]);
    expect(sourceStretches(EDITED, 2, 4)).toEqual([{ from: 2, to: 6 }]);
    // Pieces played out of order stay separate.
    expect(sourceStretches([{ in: 6, out: 10 }, { in: 0, out: 4 }], 2, 6)).toEqual([{ from: 8, to: 10 }, { from: 0, to: 2 }]);
  });
});
