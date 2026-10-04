import { memo, useCallback, useRef, useState } from 'react';
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
/** A press on a piece that moves less than this many pixels is a click, not a drag. */
const DRAG_THRESHOLD = 4;

const place = (win: TimeWindow, start: number, end: number): CSSProperties => ({
  left: `${percentIn(win, start)}%`,
  width: `${((end - start) / win.length) * FULL}%`,
});

const inWindow = (win: TimeWindow, start: number, end: number): boolean => end > win.start && start < win.start + win.length;

/** Time of a pointer position along a lane column, for the window. */
function timeAt(win: TimeWindow, rect: DOMRect, clientX: number): number {
  return win.start + (Math.min(Math.max(clientX - rect.left, 0), rect.width) / rect.width) * win.length;
}

/** What the Footage lane shows of a piece being dragged: which one, and how far it is from where it started. */
interface PieceDrag {
  index: number;
  /** Pixels. */
  dx: number;
}

/** Where a dragged piece lands in the play order: after every other piece whose middle it has passed. */
export function dropIndex(pieces: readonly Piece[], index: number, shiftSeconds: number): number {
  const middle = (p: Piece): number => p.at + (p.out - p.in) / 2;
  const dragged = middle(pieces[index]!) + shiftSeconds;
  return pieces.filter((p, i) => i !== index && middle(p) < dragged).length;
}

const FootageLane = memo(function FootageLane({
  win,
  pieces,
  drag,
  onMove,
}: {
  win: TimeWindow;
  pieces: readonly Piece[];
  drag: PieceDrag | null;
  /** Present when the pieces can be reordered: Alt with an arrow key moves the focused piece one place. */
  onMove: ((from: number, to: number) => void) | undefined;
}) {
  // A cut or a snip is marked where the piece before it in the source ends, so it stays with its footage when pieces move.
  const marks = [...pieces.keys()]
    .sort((a, b) => pieces[a]!.in - pieces[b]!.in)
    .flatMap((i, k, order) => {
      const next = pieces[order[k + 1] ?? -1];
      return next ? [{ piece: pieces[i]!, gap: next.in - pieces[i]!.out }] : [];
    });
  return (
    <div className="lane rv-zone rv-foot">
      {pieces.map((piece, i) => {
        const end = piece.at + piece.out - piece.in;
        if (!inWindow(win, piece.at, end)) return null;
        const dragging = drag?.index === i;
        return (
          <div
            key={i}
            className={dragging ? 'rv-piece dragging' : onMove ? 'rv-piece movable' : 'rv-piece'}
            style={{ ...place(win, piece.at, end), ...(dragging ? { transform: `translateX(${drag.dx}px)` } : {}) }}
            data-piece={pieceLetter(i)}
            data-index={i}
            tabIndex={onMove ? 0 : undefined}
            aria-label={onMove ? `Piece ${pieceLetter(i)}. Alt with the arrow keys moves it.` : undefined}
            onKeyDown={(e) => {
              if (!onMove || !e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
              const to = i + (e.key === 'ArrowRight' ? 1 : -1);
              if (to < 0 || to >= pieces.length) return;
              e.preventDefault();
              onMove(i, to);
            }}
          >
            <b>{pieceLetter(i)}</b>
            {`${formatTimecode(piece.in)} to ${formatTimecode(piece.out)}`}
          </div>
        );
      })}
      {marks.map(({ piece, gap }, i) => {
        const edge = piece.at + piece.out - piece.in;
        if (edge < win.start || edge > win.start + win.length) return null;
        const snip = gap > SNIP_MIN;
        if (!snip && Math.abs(gap) > SNIP_MIN) return null;
        return (
          <div key={i} className={snip ? 'rv-joint' : 'rv-joint cut'} style={{ left: `${percentIn(win, edge)}%` }}>
            <span>{snip ? `SNIP −${gap.toFixed(1)}s` : 'CUT'}</span>
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
  /** The Blade tool is on: pressing the lanes cuts the footage at that time instead of scrubbing. */
  blading: boolean;
  onCut(time: number): void;
  /** Present when the pieces can be reordered: a piece is dragged to a new place in the order. */
  onMovePiece?(from: number, to: number): void;
}

/** The overview of the reel and the zoomed lanes under it, on one time axis with one playhead. */
export function Lanes(props: LanesProps) {
  const { win, total, time, pieces, clips, phrases, currentPhrase, words, currentWord, comments, overview, onWindow, onScrub, snipping, selection, onSelect, blading, onCut, onMovePiece } = props;
  const plane = useRef<HTMLDivElement>(null);
  const scrubbing = useRef(false);
  const selecting = useRef<{ anchor: number; band: Span | null } | null>(null);
  const press = useRef<{ index: number; startX: number; active: boolean } | null>(null);
  const [drag, setDrag] = useState<PieceDrag | null>(null);
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
  /** Ends a press on a piece: a drag drops it in a new place, a click scrubs to where it was pressed. */
  const endPress = (e: PointerEvent): void => {
    const started = press.current;
    press.current = null;
    setDrag(null);
    if (!started) return;
    if (!started.active) {
      scrub(e);
      return;
    }
    const rect = plane.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || !pieces || !onMovePiece) return;
    const to = dropIndex(pieces, started.index, ((e.clientX - started.startX) / rect.width) * win.length);
    if (to !== started.index) onMovePiece(started.index, to);
  };
  const visible = time >= win.start && time <= win.start + win.length;

  return (
    <section className="lanes rv-lanes" aria-label="Timeline">
      <span>Reel</span>
      <Overview win={win} total={total} time={time} blocks={overview} onWindow={onWindow} />
      <div
        className={snipping ? 'rv-zoomed snipping' : blading ? 'rv-zoomed blading' : 'rv-zoomed'}
        onPointerDown={(e) => {
          if (e.button !== 0 || (e.target as Element).closest('button') !== null) return;
          const rect = plane.current?.getBoundingClientRect();
          if (blading) {
            if (rect && rect.width > 0) onCut(timeAt(win, rect, e.clientX));
            return;
          }
          e.currentTarget.setPointerCapture(e.pointerId);
          const piece = onMovePiece && !snipping ? (e.target as Element).closest('.rv-piece') : null;
          if (piece) {
            press.current = { index: Number((piece as HTMLElement).dataset.index), startX: e.clientX, active: false };
            return;
          }
          if (snipping && rect && rect.width > 0) {
            selecting.current = { anchor: timeAt(win, rect, e.clientX), band: null };
            onSelect(null);
            return;
          }
          scrubbing.current = true;
          scrub(e);
        }}
        onPointerMove={(e) => {
          const started = press.current;
          if (started) {
            const dx = e.clientX - started.startX;
            if (started.active || Math.abs(dx) >= DRAG_THRESHOLD) {
              started.active = true;
              setDrag({ index: started.index, dx });
            }
          } else if (selecting.current) select(e);
          else if (scrubbing.current) scrub(e);
        }}
        onPointerUp={(e) => (press.current ? endPress(e) : selecting.current ? endSelecting() : (scrubbing.current = false))}
        onPointerCancel={() => {
          press.current = null;
          setDrag(null);
          if (selecting.current) endSelecting();
          else scrubbing.current = false;
        }}
      >
        {pieces !== null && (
          <>
            <span>Footage</span>
            <FootageLane win={win} pieces={pieces} drag={drag} onMove={onMovePiece} />
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
