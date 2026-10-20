import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { Comment, Shot } from './api/index.ts';
import { formatClock, formatDuration } from './timecode.ts';
import { pieceMap, toSource, toTimeline, MIN_SNIP } from '../../server/core/model.ts';
import type { Piece, PieceMap, SnipOperation } from '../../server/core/model.ts';

export interface CutBlock {
  from: number;
  to: number;
  ops: SnipOperation[];
  isDeadAir: boolean;
}

export interface SimpleCutsValue {
  sourceDuration: number;
  basePieces: Piece[];
  keptPieces: Piece[];
  keptMap: PieceMap;
  cuts: CutBlock[];
  busy: boolean;
  restoreCut(cut: CutBlock): Promise<void>;
  replaceCut(oldOp: SnipOperation, from: number, to: number): Promise<boolean>;
}

export const SimpleCutsContext = createContext<SimpleCutsValue | null>(null);

function safeToSource(map: PieceMap, timelineTime: number): number {
  if (map.pieces.length === 0) return timelineTime;
  if (timelineTime <= 0) return map.pieces[0]!.in;
  const mapped = toSource(map, timelineTime);
  if (mapped !== null) return mapped;
  if (timelineTime >= map.length) return map.pieces[map.pieces.length - 1]!.out;
  return timelineTime;
}

function sourceToReel(map: PieceMap, sourceTime: number): number {
  if (map.pieces.length === 0) return sourceTime;
  const direct = toTimeline(map, sourceTime);
  if (direct !== null) return direct;
  const first = map.pieces[0]!;
  if (sourceTime <= first.in) return 0;
  const last = map.pieces[map.pieces.length - 1]!;
  if (sourceTime >= last.out) return map.length;
  for (let i = 0; i < map.pieces.length - 1; i += 1) {
    const cur = map.pieces[i]!;
    const next = map.pieces[i + 1]!;
    if (sourceTime >= cur.out && sourceTime <= next.in) {
      return sourceTime - cur.out < next.in - sourceTime ? cur.at + cur.out - cur.in : next.at;
    }
  }
  return 0;
}

export function SimpleTimeline({ time, total, shots, comments, onSeek, onPin, canPin = true }: {
  canPin?: boolean;
  time: number;
  total: number;
  shots: Shot[];
  comments: Comment[];
  onSeek(time: number): void;
  onPin(time: number): void;
}) {
  const cuts = useContext(SimpleCutsContext);
  const trackDuration = cuts ? cuts.sourceDuration : total;
  const inside = (at: number) => Math.max(0, Math.min(Math.max(0, total - 0.001), at));
  const playheadSource = cuts ? safeToSource(cuts.keptMap, time) : time;
  const playheadPercent = trackDuration > 0 ? (playheadSource / trackDuration) * 100 : 0;

  const [openCutIndex, setOpenCutIndex] = useState<number | null>(null);
  const [draftCut, setDraftCut] = useState<{ cutIndex: number; edge: 'start' | 'end'; from: number; to: number } | null>(null);
  const dragState = useRef<{ pointerId: number; target: HTMLElement; cutIndex: number; edge: 'start' | 'end'; trackRect: DOMRect; lastDraft: { from: number; to: number } } | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (openCutIndex === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpenCutIndex(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openCutIndex]);

  useEffect(() => {
    if (openCutIndex === null) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.sm-cut, .sm-cut-popover')) return;
      setOpenCutIndex(null);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [openCutIndex]);

  const onHandlePointerDown = (event: React.PointerEvent<HTMLElement>, cutIndex: number, edge: 'start' | 'end') => {
    if (!cuts || cuts.busy || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const track = trackRef.current;
    if (!track) return;
    const trackRect = track.getBoundingClientRect();
    const cut = cuts.cuts[cutIndex];
    if (!cut) return;
    dragState.current = {
      pointerId: event.pointerId,
      target,
      cutIndex,
      edge,
      trackRect,
      lastDraft: { from: cut.from, to: cut.to },
    };
    setDraftCut({ cutIndex, edge, from: cut.from, to: cut.to });
    setOpenCutIndex(null);
  };

  const onHandlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragState.current;
    if (!cuts || !drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const cut = cuts.cuts[drag.cutIndex];
    if (!cut) return;
    const ratio = Math.max(0, Math.min(1, (event.clientX - drag.trackRect.left) / drag.trackRect.width));
    const pointerTime = ratio * trackDuration;
    const prevCut = drag.cutIndex > 0 ? cuts.cuts[drag.cutIndex - 1] : undefined;
    const nextCut = drag.cutIndex < cuts.cuts.length - 1 ? cuts.cuts[drag.cutIndex + 1] : undefined;

    if (drag.edge === 'start') {
      const minFrom = prevCut ? prevCut.to + MIN_SNIP : 0;
      const maxFrom = cut.to - (MIN_SNIP + 0.001);
      const clampedFrom = Math.round(Math.max(minFrom, Math.min(maxFrom, pointerTime)) * 100) / 100;
      drag.lastDraft = { from: clampedFrom, to: cut.to };
      setDraftCut({ cutIndex: drag.cutIndex, edge: 'start', from: clampedFrom, to: cut.to });
    } else {
      const minTo = cut.from + (MIN_SNIP + 0.001);
      const maxTo = nextCut ? nextCut.from - MIN_SNIP : trackDuration;
      const clampedTo = Math.round(Math.max(minTo, Math.min(maxTo, pointerTime)) * 100) / 100;
      drag.lastDraft = { from: cut.from, to: clampedTo };
      setDraftCut({ cutIndex: drag.cutIndex, edge: 'end', from: cut.from, to: clampedTo });
    }
  };

  const onHandlePointerUp = async (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragState.current;
    if (!cuts || !drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      drag.target.releasePointerCapture(event.pointerId);
    } catch { /* ignore */ }
    dragState.current = null;
    const cut = cuts.cuts[drag.cutIndex];
    const { from: newFrom, to: newTo } = drag.lastDraft;
    setDraftCut(null);

    if (cut && cut.ops.length === 1 && (Math.abs(newFrom - cut.from) > 1e-3 || Math.abs(newTo - cut.to) > 1e-3)) {
      await cuts.replaceCut(cut.ops[0]!, newFrom, newTo);
    }
  };

  const onHandleLostPointerCapture = (event: React.PointerEvent<HTMLElement>) => {
    if (dragState.current?.pointerId === event.pointerId) {
      dragState.current = null;
      setDraftCut(null);
    }
  };

  const onHandleKeyDown = async (event: React.KeyboardEvent<HTMLElement>, cutIndex: number, edge: 'start' | 'end') => {
    if (!cuts || cuts.busy) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    event.stopPropagation();
    const cut = cuts.cuts[cutIndex];
    if (!cut || cut.ops.length !== 1) return;
    const delta = event.key === 'ArrowRight' ? 0.1 : -0.1;
    const prevCut = cutIndex > 0 ? cuts.cuts[cutIndex - 1] : undefined;
    const nextCut = cutIndex < cuts.cuts.length - 1 ? cuts.cuts[cutIndex + 1] : undefined;

    let nextFrom = cut.from;
    let nextTo = cut.to;

    if (edge === 'start') {
      const minFrom = prevCut ? prevCut.to + MIN_SNIP : 0;
      const maxFrom = cut.to - (MIN_SNIP + 0.001);
      nextFrom = Math.round(Math.max(minFrom, Math.min(maxFrom, cut.from + delta)) * 10) / 10;
    } else {
      const minTo = cut.from + (MIN_SNIP + 0.001);
      const maxTo = nextCut ? nextCut.from - MIN_SNIP : trackDuration;
      nextTo = Math.round(Math.max(minTo, Math.min(maxTo, cut.to + delta)) * 10) / 10;
    }

    if (Math.abs(nextFrom - cut.from) > 1e-3 || Math.abs(nextTo - cut.to) > 1e-3) {
      await cuts.replaceCut(cut.ops[0]!, nextFrom, nextTo);
    }
  };

  return <section className="sm-timeline" aria-label="Simple timeline" data-verify-cuts={cuts ? cuts.cuts.length : 0}>
    <div className="sm-timeline-label"><span>Click the timeline to leave a note</span><span className="num">{formatClock(trackDuration)}</span></div>
    <div className="sm-pin-track" ref={trackRef}>
      <button type="button" className="sm-timeline-target" aria-label="Add a timeline pin" disabled={trackDuration <= 0 || !canPin}
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          if (cuts) {
            const atSource = Math.max(0, Math.min(cuts.sourceDuration, ((event.clientX - box.left) / box.width) * cuts.sourceDuration));
            const atReel = inside(sourceToReel(cuts.keptMap, atSource));
            onSeek(atReel);
            onPin(atReel);
          } else {
            const at = inside(((event.clientX - box.left) / box.width) * total);
            onSeek(at);
            onPin(at);
          }
        }} onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onPin(inside(time)); }
        }}>
        {shots.map((shot) => {
          let left = total > 0 ? (shot.start / total) * 100 : 0;
          let width = total > 0 ? (shot.duration / total) * 100 : 0;
          if (cuts && trackDuration > 0) {
            const sourceStart = safeToSource(cuts.keptMap, shot.start);
            const sourceEnd = safeToSource(cuts.keptMap, shot.start + shot.duration);
            left = (sourceStart / trackDuration) * 100;
            width = (Math.max(0, sourceEnd - sourceStart) / trackDuration) * 100;
          }
          return <span key={shot.number} className="sm-timeline-shot" style={{ left: `${left}%`, width: `${width}%` }}><span className="num">{shot.number}</span> {shot.title}</span>;
        })}
      </button>
      {cuts && cuts.cuts.map((cut, index) => {
        const isDraft = draftCut?.cutIndex === index;
        const displayFrom = isDraft ? draftCut.from : cut.from;
        const displayTo = isDraft ? draftCut.to : cut.to;
        const leftPct = trackDuration > 0 ? (displayFrom / trackDuration) * 100 : 0;
        const widthPct = trackDuration > 0 ? Math.max(0.01, ((displayTo - displayFrom) / trackDuration) * 100) : 0;
        const labelPrefix = cut.isDeadAir ? 'Cut pause' : 'Cut';
        const blockAriaLabel = `${labelPrefix}, ${(cut.to - cut.from).toFixed(1)} seconds at ${formatClock(cut.from)}`;
        const prevCut = index > 0 ? cuts.cuts[index - 1] : undefined;
        const nextCut = index < cuts.cuts.length - 1 ? cuts.cuts[index + 1] : undefined;
        const minFrom = prevCut ? prevCut.to + MIN_SNIP : 0;
        const maxFrom = cut.to - (MIN_SNIP + 0.001);
        const minTo = cut.from + (MIN_SNIP + 0.001);
        const maxTo = nextCut ? nextCut.from - MIN_SNIP : trackDuration;

        return (
          <div
            key={`cut-${index}-${cut.from}`}
            className="sm-cut"
            data-cut-start={cut.from}
            data-cut-end={cut.to}
            data-cut-deadair={String(cut.isDeadAir)}
            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
          >
            <button
              type="button"
              className="sm-cut-block"
              aria-label={blockAriaLabel}
              disabled={cuts.busy}
              onClick={(event) => {
                event.stopPropagation();
                setOpenCutIndex(openCutIndex === index ? null : index);
              }}
            >
              <span className="sm-cut-length num">{formatDuration(displayTo - displayFrom)}</span>
            </button>
            {cut.ops.length === 1 && (
              <>
                <span
                  role="slider"
                  tabIndex={cuts.busy ? -1 : 0}
                  aria-label={`Resize start of cut at ${formatClock(cut.from)}`}
                  aria-valuemin={minFrom}
                  aria-valuemax={maxFrom}
                  aria-valuenow={displayFrom}
                  aria-disabled={cuts.busy}
                  className="sm-cut-handle sm-cut-handle-start"
                  onPointerDown={(event) => onHandlePointerDown(event, index, 'start')}
                  onPointerMove={onHandlePointerMove}
                  onPointerUp={onHandlePointerUp}
                  onLostPointerCapture={onHandleLostPointerCapture}
                  onKeyDown={(event) => onHandleKeyDown(event, index, 'start')}
                  onClick={(event) => event.stopPropagation()}
                />
                <span
                  role="slider"
                  tabIndex={cuts.busy ? -1 : 0}
                  aria-label={`Resize end of cut at ${formatClock(cut.from)}`}
                  aria-valuemin={minTo}
                  aria-valuemax={maxTo}
                  aria-valuenow={displayTo}
                  aria-disabled={cuts.busy}
                  className="sm-cut-handle sm-cut-handle-end"
                  onPointerDown={(event) => onHandlePointerDown(event, index, 'end')}
                  onPointerMove={onHandlePointerMove}
                  onPointerUp={onHandlePointerUp}
                  onLostPointerCapture={onHandleLostPointerCapture}
                  onKeyDown={(event) => onHandleKeyDown(event, index, 'end')}
                  onClick={(event) => event.stopPropagation()}
                />
              </>
            )}
            {openCutIndex === index && (
              <div
                className="sm-cut-popover"
                role="dialog"
                aria-label={cut.isDeadAir ? 'Pause details' : 'Cut details'}
                style={{
                  right: (cut.from / trackDuration) > 0.5 ? 0 : 'auto',
                  left: (cut.from / trackDuration) > 0.5 ? 'auto' : 0,
                }}
              >
                <span className="sm-cut-length num">{formatDuration(cut.to - cut.from)}</span>
                {cut.ops.length > 0 && (
                  <button
                    type="button"
                    className="btn quiet sm-cut-keep"
                    disabled={cuts.busy}
                    onClick={async (event) => {
                      event.stopPropagation();
                      if (cuts.busy) return;
                      await cuts.restoreCut(cut);
                      setOpenCutIndex(null);
                    }}
                  >
                    {cut.isDeadAir ? 'Keep this pause' : 'Keep this cut'}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
      {comments.filter((comment) => !comment.state).map((comment) => {
        const pinTime = cuts ? safeToSource(cuts.keptMap, comment.pin.time) : comment.pin.time;
        const leftPct = trackDuration > 0 ? (pinTime / trackDuration) * 100 : 0;
        return <button type="button" key={comment.id} className="sm-pin-mark num" style={{ left: `${Math.min(98, leftPct)}%` }} aria-label={`Jump to pin ${comment.number}`} onClick={() => onSeek(comment.pin.time)}>{comment.number}</button>;
      })}
      <span className="sm-playhead" style={{ left: `${playheadPercent}%` }} />
    </div>
    <label className="sm-scrub">Playhead <input type="range" aria-label="Simple playhead" min="0" max={total} step="0.01" value={Math.min(time, total)} onChange={(event) => onSeek(Number(event.target.value))} /></label>
  </section>;
}
