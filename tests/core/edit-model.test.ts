import { describe, expect, it } from 'vitest';
import { applyOperation, operationTouches, describeOperation, editedPieces, snipPieces } from '../../server/core/model.ts';

describe('snipPieces', () => {
  it('splits a piece around the stretch, trims one it crosses and drops one it covers', () => {
    expect(snipPieces([{ in: 0, out: 10 }], 3, 5)).toEqual([{ in: 0, out: 3 }, { in: 5, out: 10 }]);
    expect(snipPieces([{ in: 0, out: 3 }, { in: 5, out: 10 }], 2, 6)).toEqual([{ in: 0, out: 2 }, { in: 6, out: 10 }]);
    expect(snipPieces([{ in: 0, out: 3 }, { in: 3, out: 5 }, { in: 5, out: 10 }], 3, 5)).toEqual([{ in: 0, out: 3 }, { in: 5, out: 10 }]);
  });

  it('keeps the play order of reordered pieces', () => {
    expect(snipPieces([{ in: 6, out: 10 }, { in: 0, out: 4 }], 1, 2)).toEqual([{ in: 6, out: 10 }, { in: 0, out: 1 }, { in: 2, out: 4 }]);
  });

  it('refuses a stretch that is already gone, and one that removes everything', () => {
    expect(() => snipPieces([{ in: 0, out: 3 }, { in: 5, out: 10 }], 3.5, 4.5)).toThrow(/already/);
    expect(() => snipPieces([{ in: 0, out: 10 }], 0, 10)).toThrow(/whole reel/);
  });
});

describe('applyOperation', () => {
  const sources = { plan: { duration: 12 }, words: [] };

  it('treats a plan without pieces as one piece over the video', () => {
    const next = applyOperation(sources, { id: 'a', kind: 'snip', from: 3, to: 5 });
    expect(next.plan.pieces).toEqual([{ in: 0, out: 3 }, { in: 5, out: 12 }]);
    expect(editedPieces(sources.plan, [{ id: 'a', kind: 'snip', from: 3, to: 5 }]).length).toBe(10);
  });

  it('describes a snip with its length and source times', () => {
    expect(describeOperation({ id: 'a', kind: 'snip', from: 36.9, to: 38.4 })).toEqual({ target: 'Footage', text: 'Snipped 1.5s (00:36.90 to 00:38.40)' });
  });
});

describe('cut and move-piece', () => {
  const whole = { plan: { duration: 12 }, words: [] };
  const withSections = {
    plan: { duration: 12, sections: [{ id: 'one', name: 'One', start: 0, end: 6 }, { id: 'two', name: 'Two', start: 6, end: 12 }] },
    words: [],
  };
  const cut = (at: number) => ({ id: 'c', kind: 'cut', at }) as const;
  const move = (from: number, to: number) => ({ id: 'm', kind: 'move-piece', from, to }) as const;

  it('cuts a piece into two and removes nothing', () => {
    const next = applyOperation(whole, cut(6));
    expect(next.plan.pieces).toEqual([{ in: 0, out: 6 }, { in: 6, out: 12 }]);
    expect(editedPieces(whole.plan, [cut(6)]).length).toBe(12);
  });

  it('refuses a cut where one already is, or outside the footage', () => {
    const cutOnce = applyOperation(whole, cut(6));
    expect(() => applyOperation(cutOnce, cut(6))).toThrow(/already a cut/);
    expect(() => applyOperation(whole, cut(0))).toThrow();
    expect(() => applyOperation(whole, cut(20))).toThrow(/not inside/);
  });

  it('moves a piece to a place in the order', () => {
    const cut3 = applyOperation(applyOperation(whole, cut(4)), cut(8));
    expect(applyOperation(cut3, move(2, 0)).plan.pieces).toEqual([{ in: 8, out: 12 }, { in: 0, out: 4 }, { in: 4, out: 8 }]);
    expect(applyOperation(cut3, move(0, 2)).plan.pieces).toEqual([{ in: 4, out: 8 }, { in: 8, out: 12 }, { in: 0, out: 4 }]);
    expect(() => applyOperation(cut3, move(1, 1))).toThrow(/already there/);
    expect(() => applyOperation(cut3, move(0, 3))).toThrow(/not in the reel/);
  });

  it('keeps every section one stretch: a move that splits one is refused, one that moves a whole section is allowed', () => {
    const cutAtEdge = applyOperation(withSections, cut(6));
    expect(applyOperation(cutAtEdge, move(1, 0)).plan.pieces).toEqual([{ in: 6, out: 12 }, { in: 0, out: 6 }]);
    // Cut inside section One, then move its second half past Two: One would be in two places.
    const cutInside = applyOperation(applyOperation(withSections, cut(6)), cut(4));
    expect(cutInside.plan.pieces).toEqual([{ in: 0, out: 4 }, { in: 4, out: 6 }, { in: 6, out: 12 }]);
    expect(() => applyOperation(cutInside, move(1, 2))).toThrow(/split the section "One"/);
    // Moving a piece within its own section is fine.
    expect(applyOperation(cutInside, move(1, 0)).plan.pieces).toEqual([{ in: 4, out: 6 }, { in: 0, out: 4 }, { in: 6, out: 12 }]);
  });

  it('describes both in plain words', () => {
    expect(describeOperation(cut(43.2))).toEqual({ target: 'Footage', text: 'Cut into two pieces at 00:43.20' });
    expect(describeOperation(move(1, 0)).text).toBe('Moved piece B to place 1');
  });
});

describe('word-text and word-timing', () => {
  const words = [
    { text: 'hello', start: 0.5, end: 0.9 },
    { text: 'there', start: 1, end: 1.4 },
  ];
  const sources = { plan: {}, words };
  const text = (at: number, value: string) => ({ id: 'a', kind: 'word-text' as const, at, text: value });
  const timing = (at: number, start: number, end: number) => ({ id: 'b', kind: 'word-timing' as const, at, start, end });

  it('changes the word that starts at the time, and leaves the rest', () => {
    expect(applyOperation(sources, text(1, ' where ')).words).toEqual([words[0], { text: 'where', start: 1, end: 1.4 }]);
    expect(applyOperation(sources, timing(1, 1.1, 1.6)).words[1]).toEqual({ text: 'there', start: 1.1, end: 1.6 });
    expect(words[1]!.text).toBe('there');
  });

  it('refuses a missing word, an empty one, a backwards re-time and one over its neighbour', () => {
    expect(() => applyOperation(sources, text(3, 'x'))).toThrow(/no word/);
    expect(() => applyOperation(sources, text(1, ''))).toThrow(/empty/);
    expect(() => applyOperation(sources, timing(1, 1.4, 1.2))).toThrow(/start before its end/);
    expect(() => applyOperation(sources, timing(1, 0.8, 1.4))).toThrow(/next to it/);
  });

  it('says what it did, and touches the section the word is in', () => {
    expect(describeOperation({ ...text(1, 'where'), was: 'there' })).toEqual({ target: 'Word', text: 'Changed “there” to “where”' });
    expect(describeOperation(timing(1, 1.1, 1.6)).text).toBe('Re-timed to 00:01.10 to 00:01.60');
    expect(operationTouches(text(1, 'x'), { start: 0, end: 2 })).toBe(true);
    expect(operationTouches(text(5, 'x'), { start: 0, end: 2 })).toBe(false);
  });
});
