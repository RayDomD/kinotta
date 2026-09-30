import type { CSSProperties, Ref } from 'react';

/** Size of a saved pin's anchor hex, in frame pixels. */
export const ANCHOR_SIZE = 12;

export interface PinMarkProps {
  number: number;
  /** Fractions of the frame. */
  x: number;
  y: number;
  /** Opened from the comments panel: a ring on the anchor and an ink edge on the tag. */
  marked?: boolean;
  /** The start of the comment, shown in the tag after the number. Stills show the number alone. */
  text?: string;
  /** Where the tag sits, relative to the anchor's box. Without it the tag sits below and to the right, flipped near the frame's edges. */
  tagStyle?: CSSProperties;
  tagRef?: Ref<HTMLSpanElement>;
  /** With the default spot: how many tag heights to step away, clear of nearby pins' tags. */
  stack?: number;
}

/** One stacking step for a tag in its default spot: its height plus a small gap, in pixels. */
const STACK_STEP = 22;

/**
 * A saved pin (D25): a small filled hex on the exact spot, and a tag with the comment number (and on the
 * enlarged frame, the start of the comment) placed off the element so neither covers the reel's content.
 */
export function PinMark({ number, x, y, marked = false, text, tagStyle, tagRef, stack = 0 }: PinMarkProps) {
  const flipY = y > 0.8;
  const flip = `${x > 0.75 ? ' flip-x' : ''}${flipY ? ' flip-y' : ''}`;
  const stacked: CSSProperties | undefined = stack > 0 ? (flipY ? { marginBottom: stack * STACK_STEP } : { marginTop: stack * STACK_STEP }) : undefined;
  return (
    <span
      className={`hexpin${marked ? ' marked' : ''}${tagStyle ? '' : flip}`}
      style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
      role="img"
      aria-label={marked ? `Comment ${number}, selected` : `Comment ${number}`}
    >
      <svg viewBox="0 0 28 28" aria-hidden="true">
        {marked && <path className="ring" d="M14 3l9.5 5.5v11L14 25 4.5 19.5v-11z" transform="translate(14 14) scale(1.7) translate(-14 -14)" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" />}
        <path d="M14 3l9.5 5.5v11L14 25 4.5 19.5v-11z" fill="var(--light)" stroke="var(--ground)" strokeWidth="3" strokeLinejoin="round" />
      </svg>
      <span ref={tagRef} className="pintag" style={tagStyle ?? stacked} aria-hidden="true">
        <b>{number}</b>
        {text && <span className="pintext">{text}</span>}
      </span>
    </span>
  );
}
