import { describe, expect, it } from 'vitest';
import { detectCutRange } from '../../web/src/SimpleTimeline.tsx';
import { anchorCutWindow, mapTimeThroughCut, percentIn } from '../../web/src/review/_internal/timeline.ts';

describe('SimpleTimeline cut anchoring and playhead mapping', () => {
  it('detects cut range when a piece is split by a closing cut', () => {
    const prevPieces = [{ in: 0, out: 12 }];
    const curPieces = [{ in: 0, out: 4 }, { in: 7, out: 12 }];
    const cut = detectCutRange(prevPieces, curPieces, 12, 9);
    expect(cut).toEqual({ cutStart: 4, cutEnd: 7 });
  });

  it('detects cut range when a placement is shortened by a closing cut', () => {
    const prevPlacements = [
      { id: 'p1', at: 0, duration: 6 },
      { id: 'p2', at: 6, duration: 6 },
    ];
    const curPlacements = [
      { id: 'p1', at: 0, duration: 4 },
      { id: 'p2', at: 4, duration: 6 },
    ];
    const cut = detectCutRange(prevPlacements, curPlacements, 12, 10);
    expect(cut).toEqual({ cutStart: 4, cutEnd: 6 });
  });

  it('keeps scale and screen x of next clip anchored across a closing cut', () => {
    const oldWin = { start: 0, length: 12 };
    const cut = { cutStart: 4, cutEnd: 7 };
    const newWin = anchorCutWindow(oldWin, cut.cutStart, cut.cutEnd);

    // Scale is preserved (length stays 12, not refit to 9)
    expect(newWin.length).toBe(12);

    // In old reel, cut began at 4s: screen x was (4 / 12) * 100 = 33.33%
    const oldCutScreenX = percentIn(oldWin, cut.cutStart);

    // In new reel, next clip begins at 4s: screen x stays at 33.33%
    const newClipScreenX = percentIn(newWin, cut.cutStart);
    expect(newClipScreenX).toBeCloseTo(oldCutScreenX, 5);

    // Playhead inside cut lands on the cut join
    expect(mapTimeThroughCut(5, cut.cutStart, cut.cutEnd, 9)).toBe(4);

    // Playhead after cut shifts earlier by cut duration
    expect(mapTimeThroughCut(8, cut.cutStart, cut.cutEnd, 9)).toBe(5);
  });
});
