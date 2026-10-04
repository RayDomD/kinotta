import { describe, expect, it } from 'vitest';
import { applyOperation, describeOperation, editedPieces, snipPieces } from '../../server/core/model.ts';

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
