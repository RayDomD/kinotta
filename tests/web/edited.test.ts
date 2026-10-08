import { describe, expect, it } from 'vitest';
import { dropIndex } from '../../web/src/review/_internal/Lanes.tsx';
import { captionShifts, clipIdForScene, clipOffsets, borrowedScene, codeClips, editedClips, phraseTexts, remap, sourceStretches } from '../../web/src/review/_internal/edited.ts';

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

describe('editedClips', () => {
  const clips = [
    { id: '01', title: 'One', in: 0, out: 3 },
    { id: '02', title: 'Two', in: 3, out: 6 },
    { id: '03', title: 'Three', in: 6, out: 9, slid: true },
  ];
  const whole = [{ in: 0, out: 12 }];
  const trim = { id: 't', kind: 'clip-trim' as const, clip: '02', in: 3, out: 5 };
  const slide = { id: 's', kind: 'clip-slide' as const, clip: '01', delta: 1 };

  it('places the saved clips on the timeline with their source time and slid flag', () => {
    expect(editedClips(clips, [], whole)).toEqual([
      { id: '01', title: 'One', start: 0, end: 3, source: { in: 0, out: 3 }, slid: false },
      { id: '02', title: 'Two', start: 3, end: 6, source: { in: 3, out: 6 }, slid: false },
      { id: '03', title: 'Three', start: 6, end: 9, source: { in: 6, out: 9 }, slid: true },
    ]);
  });

  it('applies unsaved trims and slides, and a slide marks the clip', () => {
    const shown = editedClips(clips, [trim, slide], whole);
    expect(shown.find((c) => c.id === '02')).toMatchObject({ start: 3, end: 5, slid: false });
    expect(shown.find((c) => c.id === '01')).toMatchObject({ start: 1, end: 4, slid: true, source: { in: 1, out: 4 } });
  });

  it('follows the snips, and leaves out a clip that is wholly inside one', () => {
    const snipped = [{ in: 0, out: 3 }, { in: 6, out: 12 }];
    expect(editedClips(clips, [], snipped).map((c) => [c.id, c.start, c.end])).toEqual([['01', 0, 3], ['03', 3, 6]]);
  });
});

describe('clipOffsets', () => {
  const clips = [
    { id: '01', in: 0, out: 3 },
    { id: '02', in: 3, out: 6, offsets: { badge: { x: 5, y: 6, scale: 1 }, title: { x: 1, y: 1, scale: 2 } } },
  ];
  const move = (clip: string, element: string, x: number, y: number, scale = 1) => ({ id: 'o', kind: 'element-offset' as const, clip, element, x, y, scale });

  it('is the saved offsets with the unsaved moves over them', () => {
    expect(clipOffsets(clips, [])).toEqual({ '02': { badge: { x: 5, y: 6, scale: 1 }, title: { x: 1, y: 1, scale: 2 } } });
    const next = clipOffsets(clips, [move('01', 'cursor', 9, 0), move('02', 'badge', 7, 8, 1.5)]);
    expect(next['01']).toEqual({ cursor: { x: 9, y: 0, scale: 1 } });
    expect(next['02']!.badge).toEqual({ x: 7, y: 8, scale: 1.5 });
  });

  it('keeps an element that was put back at home, so the preview can undo a saved offset', () => {
    expect(clipOffsets(clips, [move('02', 'badge', 0, 0)])['02']!.badge).toEqual({ x: 0, y: 0, scale: 1 });
  });
});

describe('clipIdForScene', () => {
  const clips = [{ id: '1', in: 0, out: 1 }, { id: '10', in: 1, out: 2 }, { id: '02', in: 2, out: 3, clip: 'motion/clips/conflict.html' }];

  it('finds a clip from its scene: the file name of its fragment, else the id before a dash', () => {
    expect(clipIdForScene('1-intro', clips)).toBe('1');
    expect(clipIdForScene('10-outro', clips)).toBe('10');
    expect(clipIdForScene('conflict', clips)).toBe('02');
    expect(clipIdForScene('cap-001', clips)).toBeUndefined();
  });
});

describe('codeClips', () => {
  const clips = codeClips({ scenes: ['cube-lands', 'cta'], offsets: { cta: { '@clip': { x: 0, y: 12, scale: 1 } } } });

  it('stands each scene of a code-only page in as a clip, carrying the offsets its stylesheet holds', () => {
    expect(clips.map((c) => c.id)).toEqual(['cube-lands', 'cta']);
    expect(clips[1]!.offsets).toEqual({ '@clip': { x: 0, y: 12, scale: 1 } });
    expect(clipIdForScene('cta', clips)).toBe('cta');
  });

  it('lets the unsaved moves apply over the saved offsets', () => {
    const move = { id: 'a', kind: 'element-offset' as const, clip: 'cube-lands', element: 'cube', x: 5, y: 6, scale: 1 };
    expect(clipOffsets(clips, [move])).toEqual({ 'cube-lands': { cube: { x: 5, y: 6, scale: 1 } }, cta: { '@clip': { x: 0, y: 12, scale: 1 } } });
  });
});

describe('phraseTexts', () => {
  const saved = [
    { text: 'hello', start: 0.5, end: 0.9 },
    { text: 'there', start: 1, end: 1.4 },
    { text: 'later', start: 6, end: 6.5 },
  ];
  const spans = [{ from: 0.5, to: 1.4 }, { from: 6, to: 6.5 }];

  it('leaves a phrase the edits do not touch as built', () => {
    expect(phraseTexts(spans, saved, saved, SAVED)).toEqual([
      { words: saved.slice(0, 2), page: null },
      { words: saved.slice(2), page: null },
    ]);
  });

  it('gives a retyped phrase its words now, placed on the saved page', () => {
    const edited = [{ text: 'hi', start: 0.5, end: 0.8 }, { text: 'all', start: 0.8, end: 1.4 }, saved[2]!];
    // On a page built with 3 to 5 snipped, source 6 is page 4.
    const [first, second] = phraseTexts(spans, saved, edited, EDITED);
    expect(first).toEqual({ words: edited.slice(0, 2), page: edited.slice(0, 2) });
    expect(second!.page).toBeNull();
    const fixed = [saved[0]!, saved[1]!, { text: 'soon', start: 6, end: 6.5 }];
    expect(phraseTexts(spans, saved, fixed, EDITED)[1]!.page).toEqual([{ text: 'soon', start: 4, end: 4.5 }]);
  });

  it('gives an emptied phrase no words', () => {
    expect(phraseTexts(spans, saved, saved.slice(2), SAVED)[0]).toEqual({ words: [], page: [] });
  });
});

describe('borrowedScene: the saved scene an unsaved split part plays in until Save', () => {
  const saved = [{ id: '01', in: 0, out: 1 }, { id: '01~a~2', in: 2, out: 3, splitFrom: '01' }];
  it('uses the nearest saved ancestor, so a part split from a saved part keeps the scene and offsets of that part', () => {
    expect(borrowedScene({ id: '01~a~2~b~2', splitFrom: '01' }, saved)).toBe('01~a~2');
    expect(borrowedScene({ id: '01~c~3', splitFrom: '01' }, saved)).toBe('01');
  });
  it('falls back to the root fragment for an id it cannot trace, and lends nothing to a saved clip', () => {
    expect(borrowedScene({ id: 'odd', splitFrom: '01' }, saved)).toBe('01');
    expect(borrowedScene({ id: '01~a~2', splitFrom: '01' }, saved)).toBeNull();
    expect(borrowedScene({ id: '02' }, saved)).toBeNull();
  });
});
