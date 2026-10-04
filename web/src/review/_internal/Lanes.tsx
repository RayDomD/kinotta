import { memo, useCallback, useRef } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import type { Comment, TranscriptWord } from '../../api/index.ts';
import type { CaptionPhrase } from '../../stage/index.ts';
import { formatClock, formatTimecode } from '../../timecode.ts';
import { formatTransport } from './clock.ts';
import { pieceLetter } from './model.ts';
import type { ClipSpan, Span } from './model.ts';
import { centerWindow, percentIn, tickTimes } from './timeline.ts';
import type { Piece, TimeWindow } from './timeline.ts';

const FULL = 100;
const MS_PER_SECOND = 1000;
/** Less than this between two pieces' source times is a cut, not a snip. */
const SNIP_MIN = 0.005;
/** A drag shorter than this selects nothing. */
const MIN_SELECTION = 0.05;

const place = (win: TimeWindow, start: number, end: number): CSSProperties => ({
  left: `${percentIn(win, start)}%`,
  width: `${((end - start) / win.length) * FULL}%`,
});

const inWindow = (win: TimeWindow, start: number, end: number): boolean => end > win.start && start < win.start + win.length;

/** Time of a pointer position along a lane column, for the window. */
function timeAt(win: TimeWindow, rect: DOMRect, clientX: number): number {
  return win.start + (Math.min(Math.max(clientX - rect.left, 0), rect.width) / rect.width) * win.length;
}

const FootageLane = memo(function FootageLane({ win, pieces }: { win: TimeWindow; pieces: readonly Piece[] }) {
  return (
    <div className="lane rv-zone rv-foot">
      {pieces.map((piece, i) => {
        const end = piece.at + piece.out - piece.in;
        if (!inWindow(win, piece.at, end)) return null;
        return (
          <div key={i} className="rv-piece" style={place(win, piece.at, end)} data-piece={pieceLetter(i)}>
            <b>{pieceLetter(i)}</b>
            {`${formatTimecode(piece.in)} to ${formatTimecode(piece.out)}`}
          </div>
        );
      })}
      {pieces.slice(1).map((piece, i) => {
        if (piece.at < win.start || piece.at > win.start + win.length) return null;
        const gap = piece.in - pieces[i]!.out;
        const snip = gap > SNIP_MIN;
        const label = snip ? `SNIP −${gap.toFixed(1)}s` : Math.abs(gap) <= SNIP_MIN ? 'CUT' : null;
        return (
          <div key={i} className={snip ? 'rv-joint' : 'rv-joint cut'} style={{ left: `${percentIn(win, piece.at)}%` }}>
            {label !== null && <span>{label}</span>}
          </div>
        );
      })}
    </div>
  );
});

const ClipsLane = memo(function ClipsLane({ win, clips }: { win: TimeWindow; clips: readonly ClipSpan[] }) {
  const seen = clips.filter((clip) => inWindow(win, clip.start, clip.end));
  if (seen.length === 0) {
    return (
      <div className="lane ov-lane">
        <div className="ov-empty">
          <span>{clips.length === 0 ? 'None' : 'None here'}</span>
        </div>
      </div>
    );
  }
  return (
    <div className="lane ov-lane">
      {seen.map((clip) => (
        <div key={clip.id} className="ov" style={place(win, clip.start, clip.end)} title={`${clip.id} ${clip.title}, ${formatTimecode(clip.start)} to ${formatTimecode(clip.end)}`}>
          <b>{clip.id}</b>
          {clip.title}
        </div>
      ))}
    </div>
  );
});

const CaptionsLane = memo(function CaptionsLane({ win, phrases, current }: { win: TimeWindow; phrases: readonly CaptionPhrase[]; current: number }) {
  return (
    <div className="lane rv-caps">
      {phrases.map((phrase, i) =>
        inWindow(win, phrase.start, phrase.end) ? (
          <div key={i} className={i === current ? 'rv-phrase cur' : 'rv-phrase'} style={place(win, phrase.start, phrase.end)} title={phrase.text}>
            {phrase.text}
          </div>
        ) : null,
      )}
    </div>
  );
});

const WordsLane = memo(function WordsLane({ win, words, lit }: { win: TimeWindow; words: readonly TranscriptWord[]; lit: number }) {
  return (
    <div className="lane rv-words">
      {words.map((word, i) =>
        inWindow(win, word.start, word.end) ? (
          <span key={i} className={i === lit ? 'rv-w lit' : 'rv-w'} style={place(win, word.start, word.end)}>
            {word.text}
          </span>
        ) : null,
      )}
    </div>
  );
});

const PinsLane = memo(function PinsLane({ win, comments, onSeek }: { win: TimeWindow; comments: readonly Comment[]; onSeek(time: number): void }) {
  return (
    <div className="lane pins-lane rv-pins">
      {comments.map((comment) =>
        comment.pin.time >= win.start && comment.pin.time <= win.start + win.length ? (
          <button
            key={comment.id}
            type="button"
            className="lpin"
            style={{ left: `${percentIn(win, comment.pin.time)}%` }}
            title={`${comment.number}. ${comment.text}`}
            aria-label={`Pin ${comment.number} at ${formatTransport(comment.pin.time)}: ${comment.text}`}
            onClick={() => onSeek(comment.pin.time)}
          >
            <svg viewBox="0 0 28 28" aria-hidden="true">
              <path d="M14 3l9.5 5.5v11L14 25 4.5 19.5v-11z" fill="var(--light)" stroke="var(--ground)" strokeWidth="2.2" strokeLinejoin="round" />
            </svg>
            <b aria-hidden="true">{comment.number}</b>
          </button>
        ) : null,
      )}
    </div>
  );
});

const Axis = memo(function Axis({ win, total }: { win: TimeWindow; total: number }) {
  return (
    <div className="lane axis" aria-hidden="true">
      {tickTimes(win).map((t) => (
        <span key={t} style={{ left: `${percentIn(win, t)}%` }}>
          {Number.isInteger(t) && total >= 1 ? formatClock(t) : formatTransport(t)}
        </span>
      ))}
    </div>
  );
});

interface OverviewProps {
  win: TimeWindow;
  total: number;
  time: number;
  blocks: readonly Span[];
  onWindow(win: TimeWindow): void;
}

/** The whole reel on one line: what is in it, the zoom window as a box, and the playhead. A press or drag moves the window. */
function Overview({ win, total, time, blocks, onWindow }: OverviewProps) {
  const lane = useRef<HTMLDivElement>(null);
  const moving = useRef(false);
  const move = useCallback(
    (e: PointerEvent) => {
      const rect = lane.current?.getBoundingClientRect();
      if (rect && rect.width > 0) onWindow(centerWindow(win, ((e.clientX - rect.left) / rect.width) * total, total));
    },
    [onWindow, total, win],
  );
  const whole: TimeWindow = { start: 0, length: total };
  return (
    <div
      ref={lane}
      className="lane rv-over"
      aria-label="Overview of the whole reel"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        moving.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e);
      }}
      onPointerMove={(e) => moving.current && move(e)}
      onPointerUp={() => (moving.current = false)}
      onPointerCancel={() => (moving.current = false)}
    >
      {blocks.map((block, i) => (
        <i key={i} style={place(whole, block.start, block.end)} />
      ))}
      <div className="rv-win" style={place(whole, win.start, win.start + win.length)} />
      <div className="rv-ph rv-ph-over" style={{ left: `${(time / total) * FULL}%` }} />
    </div>
  );
}

export interface LanesProps {
  win: TimeWindow;
  total: number;
  time: number;
  /** Footage reels only. */
  pieces: readonly Piece[] | null;
  clips: readonly ClipSpan[];
  phrases: readonly CaptionPhrase[];
  currentPhrase: number;
  /** Footage reels with a transcript only. */
  words: readonly TranscriptWord[] | null;
  currentWord: number;
  comments: readonly Comment[];
  /** What the overview draws: the clips, or the pieces when there are none. */
  overview: readonly Span[];
  onWindow(win: TimeWindow): void;
  /** Dragging along the lanes, or pressing a pin. */
  onScrub(time: number): void;
  /** The Snip tool is on: dragging along the lanes selects a stretch instead of scrubbing. */
  snipping: boolean;
  /** The selected stretch of the timeline, shown as a band over the lanes. */
  selection: Span | null;
  onSelect(selection: Span | null): void;
}

/** The overview of the reel and the zoomed lanes under it, on one time axis with one playhead. */
export function Lanes(props: LanesProps) {
  const { win, total, time, pieces, clips, phrases, currentPhrase, words, currentWord, comments, overview, onWindow, onScrub, snipping, selection, onSelect } = props;
  const plane = useRef<HTMLDivElement>(null);
  const scrubbing = useRef(false);
  const selecting = useRef<{ anchor: number; band: Span | null } | null>(null);
  const scrub = useCallback(
    (e: PointerEvent) => {
      const rect = plane.current?.getBoundingClientRect();
      if (rect && rect.width > 0) onScrub(timeAt(win, rect, e.clientX));
    },
    [onScrub, win],
  );
  const select = useCallback(
    (e: PointerEvent) => {
      const rect = plane.current?.getBoundingClientRect();
      const drag = selecting.current;
      if (!rect || rect.width <= 0 || !drag) return;
      const at = timeAt(win, rect, e.clientX);
      drag.band = { start: Math.min(drag.anchor, at), end: Math.max(drag.anchor, at) };
      onSelect(drag.band);
    },
    [onSelect, win],
  );
  const endSelecting = (): void => {
    const band = selecting.current?.band ?? null;
    selecting.current = null;
    onSelect(band !== null && band.end - band.start >= MIN_SELECTION ? band : null);
  };
  const visible = time >= win.start && time <= win.start + win.length;

  return (
    <section className="lanes rv-lanes" aria-label="Timeline">
      <span>Reel</span>
      <Overview win={win} total={total} time={time} blocks={overview} onWindow={onWindow} />
      <div
        className={snipping ? 'rv-zoomed snipping' : 'rv-zoomed'}
        onPointerDown={(e) => {
          if (e.button !== 0 || (e.target as Element).closest('button') !== null) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const rect = plane.current?.getBoundingClientRect();
          if (snipping && rect && rect.width > 0) {
            selecting.current = { anchor: timeAt(win, rect, e.clientX), band: null };
            onSelect(null);
            return;
          }
          scrubbing.current = true;
          scrub(e);
        }}
        onPointerMove={(e) => (selecting.current ? select(e) : scrubbing.current && scrub(e))}
        onPointerUp={() => (selecting.current ? endSelecting() : (scrubbing.current = false))}
        onPointerCancel={() => (selecting.current ? endSelecting() : (scrubbing.current = false))}
      >
        {pieces !== null && (
          <>
            <span>Footage</span>
            <FootageLane win={win} pieces={pieces} />
          </>
        )}
        <span>Clips</span>
        <ClipsLane win={win} clips={clips} />
        <span>Captions</span>
        <CaptionsLane win={win} phrases={phrases} current={currentPhrase} />
        {words !== null && (
          <>
            <span>Words</span>
            <WordsLane win={win} words={words} lit={currentWord} />
          </>
        )}
        <span>Pins</span>
        <PinsLane win={win} comments={comments} onSeek={onScrub} />
        <span />
        <Axis win={win} total={total} />
        <div ref={plane} className="rv-plane">
          {selection !== null && inWindow(win, selection.start, selection.end) && (
            <div className="rv-sel" style={place(win, selection.start, selection.end)} aria-label="Selected stretch">
              <span>{`−${(selection.end - selection.start).toFixed(1)}s`}</span>
            </div>
          )}
          {visible && (
            <div
              className="rv-ph"
              style={{ left: `${percentIn(win, time)}%` }}
              role="slider"
              aria-label="Playhead"
              aria-valuemin={0}
              aria-valuemax={Math.round(total * MS_PER_SECOND) / MS_PER_SECOND}
              aria-valuenow={Math.round(time * MS_PER_SECOND) / MS_PER_SECOND}
              aria-valuetext={formatTransport(time)}
            />
          )}
        </div>
      </div>
    </section>
  );
}
