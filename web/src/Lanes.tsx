import type { CSSProperties } from 'react';
import type { Comment, Overlay, Section, Shot } from './api/index.ts';
import { NO_SHOT } from './sections.ts';
import { hasSections, sectionNumber } from './sections.ts';
import { formatAxisTime, formatDuration, formatTimecode } from './timecode.ts';

/** Candidate spacings between axis ticks, in seconds. */
const TICK_STEPS = [0.5, 1, 2, 3, 5, 10, 15, 20, 30, 60, 120, 300, 600];
const MIN_TICKS = 4;
const MAX_TICKS = 8;
/** A lane pin is 20px wide; the next pin on the same shot sits this far right of the last. */
const PIN_OFFSET_START = 4;
const PIN_OFFSET_STEP = 22;

/** Shared by every lane, so anything placed by time lines up. */
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
  /** Every shot of the reel. */
  shots: Shot[];
  comments: Comment[];
  overlays: Overlay[];
  sections: Section[];
  /** The section the grid shows: its shots are buttons on the shots lane, the reel's other shots are ticks. */
  currentSection: string;
  onSection(id: string): void;
  /** Open this shot; `opener` is the control that was used, so focus can return to it. */
  onOpen(shot: Shot, opener: HTMLElement): void;
}

/** Sections (on a multi-section reel), Shots, Pins and Overlays on one time axis under the grid. */
export function Lanes({ duration, shots, comments, overlays, sections, currentSection, onSection, onOpen }: LanesProps) {
  const multi = hasSections(sections);
  const inView = (shot: Shot): boolean => !multi || shot.section === currentSection;
  const shotByNumber = new Map(shots.map((shot) => [shot.number, shot]));
  const pinCount = new Map<string, number>();
  /** Pins at the same moment (frame pins of one shot, or two on one word) sit side by side. */
  const perMoment = new Map<number, number>();
  const pins = comments.flatMap((comment) => {
    const shot = shotByNumber.get(comment.pin.shot);
    if (shot === undefined && comment.pin.shot !== NO_SHOT) return [];
    if (shot !== undefined) pinCount.set(shot.number, (pinCount.get(shot.number) ?? 0) + 1);
    const k = perMoment.get(comment.pin.time) ?? 0;
    perMoment.set(comment.pin.time, k + 1);
    return [{ comment, shot, k }];
  });

  return (
    <section className="lanes" aria-label="Timeline">
      {multi && (
        <>
          <span>Sections</span>
          <div className="lane band-lane">
            {sections.map((section, i) => (
              <button
                key={section.id}
                type="button"
                className="band"
                style={{ flex: section.end - section.start }}
                aria-current={section.id === currentSection ? 'true' : undefined}
                title={`${sectionNumber(i)} ${section.name}`}
                aria-label={`Section ${sectionNumber(i)}, ${section.name}`}
                onClick={() => onSection(section.id)}
              >
                {sectionNumber(i)}
              </button>
            ))}
          </div>
        </>
      )}
      <span>Shots</span>
      <div className={multi ? 'lane shots-lane spread' : 'lane shots-lane'}>
        {shots.map((shot) => {
          if (!inView(shot)) return <span key={shot.number} className="tick" style={{ left: pct(shot.start, duration) }} aria-hidden="true" />;
          const end = formatTimecode(shot.start + shot.duration);
          const placed: CSSProperties = multi
            ? { left: pct(shot.start, duration), width: `${toPercent(shot.start + shot.duration, duration) - toPercent(shot.start, duration)}%` }
            : { flex: shot.duration };
          return (
            <button
              key={shot.number}
              type="button"
              className={pinCount.has(shot.number) ? 'seg has' : 'seg'}
              style={placed}
              title={`${shot.number} ${shot.title}, ${formatDuration(shot.duration)}`}
              aria-label={`Shot ${shot.number}, ${shot.title}, ${formatTimecode(shot.start)} to ${end}`}
              onClick={(e) => onOpen(shot, e.currentTarget)}
            >
              <b>{shot.number}</b>
              <span>{shot.title}</span>
            </button>
          );
        })}
      </div>
      <span>Pins</span>
      <div className="lane pins-lane">
        {pins.map(({ comment, shot, k }) => {
          const style = { left: `calc(${pct(comment.pin.time, duration)} + ${PIN_OFFSET_START + k * PIN_OFFSET_STEP}px)` };
          const glyph = (
            <>
              <svg viewBox="0 0 28 28" aria-hidden="true">
                <path d="M14 3l9.5 5.5v11L14 25 4.5 19.5v-11z" fill="var(--light)" stroke="var(--ground)" strokeWidth="2.2" strokeLinejoin="round" />
              </svg>
              <b aria-hidden="true">{comment.number}</b>
            </>
          );
          // A pin on a word of a reel with no shots has no shot to open.
          if (shot === undefined) {
            const word = comment.pin.kind === 'word' ? ` on word “${comment.pin.word}”` : '';
            return (
              <span key={comment.id} className="lpin" role="img" style={style} title={`${comment.number}. ${comment.text}`} aria-label={`Pin ${comment.number}${word}: ${comment.text}`}>
                {glyph}
              </span>
            );
          }
          return (
            <button
              key={comment.id}
              type="button"
              className="lpin"
              style={style}
              title={`${comment.number}. ${comment.text}`}
              aria-label={`Pin ${comment.number}, shot ${shot.number}: ${comment.text}`}
              onClick={(e) => onOpen(shot, e.currentTarget)}
            >
              {glyph}
            </button>
          );
        })}
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
              {formatAxisTime(t, duration)}
            </span>
          );
        })}
      </div>
    </section>
  );
}
