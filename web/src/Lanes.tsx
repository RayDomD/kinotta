import type { CSSProperties } from 'react';
import type { Comment, Overlay, Shot } from './api/index.ts';
import { formatDuration, formatTimecode } from './timecode.ts';

/** Candidate spacings between axis ticks, in seconds. */
const TICK_STEPS = [0.5, 1, 2, 3, 5, 10, 15, 20, 30, 60, 120, 300, 600];
const MIN_TICKS = 4;
const MAX_TICKS = 8;
/** A lane pin is 20px wide; the next pin on the same shot sits this far right of the last. */
const PIN_OFFSET_START = 4;
const PIN_OFFSET_STEP = 22;

/** Shared by every lane, so anything placed by time lines up (and T12 can place section bands the same way). */
export function toPercent(time: number, duration: number): number {
  return (Math.min(Math.max(time, 0), duration) / duration) * 100;
}

const pct = (time: number, duration: number): string => `${toPercent(time, duration)}%`;

/** The step between ticks: 4 to 8 ticks, preferring a step that lands exactly on the end of the reel. */
export function tickStep(duration: number): number {
  const count = (step: number): number => Math.floor(duration / step) + 1;
  const fits = TICK_STEPS.filter((step) => count(step) <= MAX_TICKS && count(step) >= MIN_TICKS);
  const exact = fits.find((step) => duration % step === 0);
  return exact ?? fits[0] ?? TICK_STEPS.find((step) => count(step) <= MAX_TICKS) ?? TICK_STEPS[TICK_STEPS.length - 1]!;
}

function axisTicks(duration: number): number[] {
  const step = tickStep(duration);
  const ticks: number[] = [];
  for (let t = 0; t <= duration; t += step) ticks.push(t);
  return ticks;
}

export interface LanesProps {
  duration: number;
  shots: Shot[];
  comments: Comment[];
  overlays: Overlay[];
  /** Open the shot at this index; `opener` is the control that was used, so focus can return to it. */
  onOpen(index: number, opener: HTMLElement): void;
}

/** Shots, Pins and Overlays on one time axis under the grid. */
export function Lanes({ duration, shots, comments, overlays, onOpen }: LanesProps) {
  const indexOf = new Map(shots.map((shot, i) => [shot.number, i]));
  const pinCount = new Map<string, number>();
  const pins = comments.flatMap((comment) => {
    const index = indexOf.get(comment.pin.shot);
    if (index === undefined) return [];
    const shot = shots[index]!;
    const k = pinCount.get(shot.number) ?? 0;
    pinCount.set(shot.number, k + 1);
    return [{ comment, index, shot, k }];
  });

  return (
    <section className="lanes" aria-label="Timeline">
      <span>Shots</span>
      <div className="lane shots-lane">
        {shots.map((shot, i) => {
          const end = formatTimecode(shot.start + shot.duration);
          return (
            <button
              key={shot.number}
              type="button"
              className={pinCount.has(shot.number) ? 'seg has' : 'seg'}
              style={{ flex: shot.duration }}
              title={`${shot.number} ${shot.title}, ${formatDuration(shot.duration)}`}
              aria-label={`Shot ${shot.number}, ${shot.title}, ${formatTimecode(shot.start)} to ${end}`}
              onClick={(e) => onOpen(i, e.currentTarget)}
            >
              <b>{shot.number}</b>
              <span>{shot.title}</span>
            </button>
          );
        })}
      </div>
      <span>Pins</span>
      <div className="lane pins-lane">
        {pins.map(({ comment, index, shot, k }) => (
          <button
            key={comment.id}
            type="button"
            className="lpin"
            style={{ left: `calc(${pct(shot.start, duration)} + ${PIN_OFFSET_START + k * PIN_OFFSET_STEP}px)` }}
            title={`${comment.number}. ${comment.text}`}
            aria-label={`Pin ${comment.number}, shot ${shot.number}: ${comment.text}`}
            onClick={(e) => onOpen(index, e.currentTarget)}
          >
            <svg viewBox="0 0 28 28" aria-hidden="true">
              <path d="M14 3l9.5 5.5v11L14 25 4.5 19.5v-11z" fill="var(--light)" stroke="var(--ground)" strokeWidth="2.2" strokeLinejoin="round" />
            </svg>
            <b aria-hidden="true">{comment.number}</b>
          </button>
        ))}
      </div>
      <span>Overlays</span>
      <div className="lane ov-lane">
        {overlays.length > 0 ? (
          overlays.map((overlay) => (
            <div
              key={`${overlay.kind}-${overlay.start}-${overlay.name}`}
              className="ov"
              style={{ left: pct(overlay.start, duration), width: `${toPercent(overlay.end, duration) - toPercent(overlay.start, duration)}%` }}
              title={`${overlay.name}, ${formatTimecode(overlay.start)} to ${formatTimecode(overlay.end)}`}
            >
              <b>{overlay.kind}</b>
              {overlay.name}
            </div>
          ))
        ) : (
          <div className="ov-empty">
            <span>None</span>
            <div className="terrain" />
          </div>
        )}
      </div>
      <span />
      <div className="lane axis" aria-hidden="true">
        {axisTicks(duration).map((t) => {
          const style: CSSProperties = { left: pct(t, duration) };
          const edge = t === 0 ? 'first' : t === duration ? 'last' : undefined;
          return (
            <span key={t} className={edge} style={style}>
              {formatTimecode(t)}
            </span>
          );
        })}
      </div>
    </section>
  );
}
