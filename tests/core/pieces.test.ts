import { describe, expect, it } from 'vitest';
import { KinottaError, pieceMap, toSource, toSourceSpans, toTimeline, toTimelineSpan } from '../../server/core/index.ts';

const VIDEO = 12;
/** The first piece moved after the second: timeline 0-6 is source 6-12, timeline 6-9 is source 0-3. */
const REORDERED = pieceMap(
  [
    { in: 6, out: 12 },
    { in: 0, out: 3 },
  ],
  VIDEO,
);
/** Source 3 to 6 snipped and closed up. */
const SNIPPED = pieceMap(
  [
    { in: 0, out: 3 },
    { in: 6, out: 12 },
  ],
  VIDEO,
);

describe('piece mapping', () => {
  it('is one piece over the whole video when the plan has none', () => {
    const map = pieceMap(undefined, VIDEO);

    expect(map.length).toBe(VIDEO);
    expect(toTimeline(map, 4.5)).toBe(4.5);
    expect(toSource(map, 4.5)).toBe(4.5);
    expect(pieceMap([], VIDEO).length).toBe(VIDEO);
  });

  it('moves source times after a snip earlier by its length, and has no time for a snipped moment', () => {
    expect(toTimeline(SNIPPED, 2)).toBe(2);
    expect(toTimeline(SNIPPED, 7)).toBe(4);
    expect(toTimeline(SNIPPED, 4)).toBeNull();
    expect(toTimeline(SNIPPED, 3)).toBeNull();
    expect(toTimeline(SNIPPED, 6)).toBe(3);
    expect(SNIPPED.length).toBe(9);
  });

  it('converts back from the timeline, a join taking the piece that starts there', () => {
    expect(toSource(SNIPPED, 4)).toBe(7);
    expect(toSource(SNIPPED, 3)).toBe(6);
    expect(toSource(SNIPPED, 9)).toBe(12);
    expect(toSource(SNIPPED, 9.5)).toBeNull();
    expect(toSource(SNIPPED, -1)).toBeNull();
  });

  it('round-trips every kept source time, over reordered pieces too', () => {
    for (const map of [SNIPPED, REORDERED]) {
      for (const t of [0, 0.5, 2.9, 6, 7.25, 11.9]) {
        const at = toTimeline(map, t);
        if (at === null) continue;
        expect(toSource(map, at)).toBeCloseTo(t, 9);
      }
    }
  });

  it('places reordered pieces by their order in the list', () => {
    expect(REORDERED.length).toBe(9);
    expect(toTimeline(REORDERED, 6)).toBe(0);
    expect(toTimeline(REORDERED, 11)).toBe(5);
    expect(toTimeline(REORDERED, 1)).toBe(7);
    expect(toSource(REORDERED, 6.5)).toBe(0.5);
    expect(toSource(REORDERED, 5.5)).toBe(11.5);
  });

  it("maps a source range, trimming it to a snip's edge and closing the gap", () => {
    expect(toTimelineSpan(SNIPPED, 1, 2)).toEqual({ start: 1, end: 2 });
    expect(toTimelineSpan(SNIPPED, 3.5, 5.5)).toBeNull();
    expect(toTimelineSpan(SNIPPED, 2, 4.5)).toEqual({ start: 2, end: 3 });
    expect(toTimelineSpan(SNIPPED, 4.5, 8)).toEqual({ start: 3, end: 5 });
    expect(toTimelineSpan(SNIPPED, 2, 8)).toEqual({ start: 2, end: 5 });
  });

  it('keeps the longest stretch of a range that reordering splits apart', () => {
    // Source 2 to 8 is timeline 7-8 (source 2-3) and 0-2 (source 6-8).
    expect(toTimelineSpan(REORDERED, 2, 8)).toEqual({ start: 0, end: 2 });
    expect(toTimelineSpan(REORDERED, 1, 10)).toEqual({ start: 0, end: 4 });
  });

  it('lists the source ranges a timeline range plays, in play order', () => {
    expect(toSourceSpans(REORDERED, 5, 8)).toEqual([
      { start: 11, end: 12 },
      { start: 0, end: 2 },
    ]);
    expect(toSourceSpans(SNIPPED, 4, 5)).toEqual([{ start: 7, end: 8 }]);
  });

  it('rejects a malformed piece and overlapping pieces', () => {
    expect(() => pieceMap([{ in: 3, out: 3 }], VIDEO)).toThrow(KinottaError);
    expect(() => pieceMap([{ in: -1, out: 3 }], VIDEO)).toThrow(KinottaError);
    expect(() =>
      pieceMap(
        [
          { in: 0, out: 5 },
          { in: 4, out: 8 },
        ],
        VIDEO,
      ),
    ).toThrow('overlap');
  });
});
