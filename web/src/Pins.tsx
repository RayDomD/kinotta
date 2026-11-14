import { PinMark } from './stage/index.ts';

/** How close two pins on a still are, in fractions of the frame, before the later one's tag steps clear of the earlier one's. */
const NEAR_X = 0.1;
const NEAR_Y = 0.1;

/** For each pin on a still, how many earlier pins sit close enough that its tag must stack below theirs. */
export function tagStacks(pins: Array<{ x: number; y: number }>): number[] {
  return pins.map((p, i) => pins.slice(0, i).filter((q) => Math.abs(q.x - p.x) < NEAR_X && Math.abs(q.y - p.y) < NEAR_Y).length);
}

/** A saved pin on a grid still: the small anchor hex and a tag with its comment number, placed at fractions of the frame. */
export function HexPin({ number, x, y, stack = 0 }: { number: number; x: number; y: number; stack?: number }) {
  return <PinMark number={number} x={x} y={y} stack={stack} />;
}

/** The count of pins on a shot, shown beside its title in the grid. */
export function PinsBadge({ count }: { count: number }) {
  return (
    <span className="pins-badge">
      <svg width="10" height="10" viewBox="0 0 28 28" aria-hidden="true">
        <path d="M14 3l9.5 5.5v11L14 25 4.5 19.5v-11z" fill="var(--light)" />
      </svg>
      {count}
      <span className="sr-only"> {count === 1 ? 'pin' : 'pins'}</span>
    </span>
  );
}
