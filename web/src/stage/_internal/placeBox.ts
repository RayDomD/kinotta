export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Space between the target and the box placed beside it, in frame pixels. */
export const PLACE_GAP = 8;

function overlapArea(a: Rect, b: Rect): number {
  const width = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const height = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return width > 0 && height > 0 ? width * height : 0;
}

function clamp(value: number, max: number): number {
  return Math.max(0, Math.min(value, max));
}

/**
 * Where to put a small box (the name tag, the comment input) beside `target` inside a frame of size `bounds`.
 * Tries above, below, right, left, then above and below aligned to the target's right edge. The first
 * candidate that, once clamped inside the frame, overlaps neither the target nor any obstacle wins.
 * When none is clean, the candidate with the least overlap wins. The result never leaves the frame.
 */
export function placeBox(target: Rect, box: Size, obstacles: Rect[], bounds: Size, gap: number = PLACE_GAP): Rect {
  const right = target.left + target.width;
  const bottom = target.top + target.height;
  const candidates: Array<{ left: number; top: number }> = [
    { left: target.left, top: target.top - gap - box.height },
    { left: target.left, top: bottom + gap },
    { left: right + gap, top: target.top },
    { left: target.left - gap - box.width, top: target.top },
    { left: right - box.width, top: target.top - gap - box.height },
    { left: right - box.width, top: bottom + gap },
  ];
  const avoid = [target, ...obstacles];
  let best: Rect | null = null;
  let bestOverlap = Infinity;
  for (const candidate of candidates) {
    const placed: Rect = {
      left: clamp(candidate.left, bounds.width - box.width),
      top: clamp(candidate.top, bounds.height - box.height),
      width: box.width,
      height: box.height,
    };
    const overlap = avoid.reduce((sum, rect) => sum + overlapArea(placed, rect), 0);
    if (overlap === 0) return placed;
    if (overlap < bestOverlap) {
      best = placed;
      bestOverlap = overlap;
    }
  }
  return best!;
}
