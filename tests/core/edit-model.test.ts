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

describe('caption-position and caption-phrase-position', () => {
  const words = [
    { text: 'hello', start: 0.5, end: 0.9 },
    { text: 'there', start: 1, end: 1.4 },
  ];
  const sources = { plan: { captions: true as const }, words };
  const all = (x: number, y: number) => ({ id: 'a', kind: 'caption-position' as const, x, y });
  const one = (at: number, x: number, y: number) => ({ id: 'b', kind: 'caption-phrase-position' as const, at, x, y });

  it('writes the reel-wide position into the plan, turning `true` into an object, and a second move replaces the first', () => {
    const first = applyOperation(sources, all(40, -20));
    expect(first.plan.captions).toEqual({ position: { x: 40, y: -20 } });
    expect(applyOperation(first, all(5, 6)).plan.captions).toEqual({ position: { x: 5, y: 6 } });
    expect(applyOperation(first, all(0, 0)).plan.captions).toEqual({});
    expect(sources.plan.captions).toBe(true);
  });

  it('keeps look and colour, and writes a phrase position keyed by its first word start', () => {
    const next = applyOperation({ plan: { captions: { look: 'words' } }, words }, one(1, 0, -100));
    expect(next.plan.captions).toEqual({ look: 'words', phrases: [{ at: 1, x: 0, y: -100 }] });
    expect(applyOperation(next, one(1, 3, 4)).plan.captions).toEqual({ look: 'words', phrases: [{ at: 1, x: 3, y: 4 }] });
    expect(applyOperation(next, one(1, 0, 0)).plan.captions).toEqual({ look: 'words' });
  });

  it('moves a phrase position with its first word when that word is re-timed, and leaves the others', () => {
    const placed = applyOperation(applyOperation(sources, one(1, 0, -100)), one(0.5, 7, 7));
    const next = applyOperation(placed, { id: 'c', kind: 'word-timing', at: 1, start: 1.1, end: 1.4 });
    expect(next.plan.captions).toEqual({ phrases: [{ at: 0.5, x: 7, y: 7 }, { at: 1.1, x: 0, y: -100 }] });
    // A re-time of a word that opens no phrase changes nothing in the plan's captions.
    expect(applyOperation(sources, { id: 'c', kind: 'word-timing', at: 1, start: 1.1, end: 1.4 }).plan.captions).toBe(true);
  });

  it('refuses when captions are off, a position that is not a number, and a phrase with no word at its time', () => {
    expect(() => applyOperation({ plan: {}, words }, all(1, 1))).toThrow(/Captions are off/);
    expect(() => applyOperation({ plan: { captions: false }, words }, one(1, 1, 1))).toThrow(/Captions are off/);
    expect(() => applyOperation(sources, all(Number.NaN, 1))).toThrow(/numbers/);
    expect(() => applyOperation(sources, one(3, 1, 1))).toThrow(/no word/);
  });

  it('says what it did, and touches the sections whose captions it moves', () => {
    expect(describeOperation(all(40, -20))).toEqual({ target: 'Captions', text: 'Moved all captions to 40, -20' });
    expect(describeOperation(one(1, 0, -100))).toEqual({ target: 'Captions', text: 'Moved one caption to 0, -100' });
    expect(operationTouches(all(1, 1), { start: 5, end: 9 })).toBe(true);
    expect(operationTouches(one(1, 1, 1), { start: 0, end: 2 })).toBe(true);
    expect(operationTouches(one(1, 1, 1), { start: 2, end: 4 })).toBe(false);
  });
});

describe('clip trim and slide', () => {
  const clips = [
    { id: '01', title: 'One', in: 0, out: 3, still: 2.5 },
    { id: '02', title: 'Two', in: 3, out: 6, section: 'a', stills: [{ from: 0, title: 'a' }, { from: 1, title: 'b', still: 1.5 }, { from: 2, title: 'c' }] },
  ];
  const sources = { plan: { duration: 12, clips }, words: [] };
  const trim = (clip: string, from: number, to: number) => ({ id: 't', kind: 'clip-trim' as const, clip, in: from, out: to });
  const slide = (clip: string, delta: number) => ({ id: 's', kind: 'clip-slide' as const, clip, delta });

  it('trims a clip to a new in and out and leaves the others', () => {
    const next = applyOperation(sources, trim('01', 0.5, 2));
    expect(next.plan.clips).toEqual([{ id: '01', title: 'One', in: 0.5, out: 2 }, clips[1]]);
  });

  it('drops the states that begin outside the trimmed clip, and a still that no longer falls inside its state', () => {
    const shorter = applyOperation(sources, trim('02', 3, 4.5)).plan.clips![1]!;
    expect(shorter.stills).toEqual([{ from: 0, title: 'a' }, { from: 1, title: 'b' }]);
    const one = applyOperation(sources, trim('02', 3, 3.8)).plan.clips![1]!;
    expect(one.stills).toEqual([{ from: 0, title: 'a' }]);
    // Trimming the front moves the clip's start, not its states, which are clip-local.
    expect(applyOperation(sources, trim('02', 3.5, 6)).plan.clips![1]!.stills).toHaveLength(3);
  });

  it('drops a clip-level still that falls outside the trimmed clip', () => {
    expect(applyOperation(sources, trim('01', 0, 2)).plan.clips![0]).not.toHaveProperty('still');
    expect(applyOperation(sources, trim('01', 0, 2.9)).plan.clips![0]).toHaveProperty('still', 2.5);
  });

  it('slides a clip along the footage and marks it slid, states untouched', () => {
    const next = applyOperation(sources, slide('02', 1.5));
    expect(next.plan.clips![1]).toMatchObject({ in: 4.5, out: 7.5, slid: true, stills: clips[1]!.stills });
    expect(applyOperation(next, slide('02', -1.5)).plan.clips![1]).toMatchObject({ in: 3, out: 6, slid: true });
    expect(next.plan.clips![0]).not.toHaveProperty('slid');
    expect(applyOperation(sources, trim('02', 3, 5)).plan.clips![1]).not.toHaveProperty('slid');
  });

  it('refuses an unknown clip, a clip too short, a trim that changes nothing, and a move off the footage', () => {
    expect(() => applyOperation(sources, trim('09', 0, 1))).toThrow(/no clip/);
    expect(() => applyOperation(sources, trim('01', 1, 1.1))).toThrow(/at least/);
    expect(() => applyOperation(sources, trim('01', -1, 2))).toThrow(/at least/);
    expect(() => applyOperation(sources, trim('01', 0, 3))).toThrow(/already/);
    expect(() => applyOperation(sources, trim('01', 0, 13))).toThrow(/past the end/);
    expect(() => applyOperation(sources, slide('01', -0.5))).toThrow(/before the start/);
    expect(() => applyOperation(sources, slide('02', 7))).toThrow(/past the end/);
    expect(() => applyOperation(sources, slide('01', 0))).toThrow(/distance/);
  });

  it('says what it did', () => {
    expect(describeOperation(trim('05', 12, 15.4))).toEqual({ target: 'Clip 05', text: 'Trimmed to 00:12.00 to 00:15.40' });
    expect(describeOperation(slide('05', 0.4))).toEqual({ target: 'Clip 05', text: 'Slid +0.4s' });
    expect(describeOperation(slide('05', -1.25))).toEqual({ target: 'Clip 05', text: 'Slid −1.3s' });
  });
});
