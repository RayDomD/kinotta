import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Comment, Shot } from './api/index.ts';
import type {
  MediaCaptionPhrase,
  MediaPlacement,
  MediaPlan,
  MediaTimeline,
  Piece,
  PieceMap,
  SnipOperation,
  PlacedPiece,
  PlanClip,
  SourcePlacement,
  mediaWords,
} from '../../server/core/model.ts';
import { toSource, toTimeline, MIN_SNIP } from '../../server/core/model.ts';
import { formatClock, formatDuration } from './timecode.ts';
import { CaptionLane } from './review/_internal/CaptionLane.tsx';
import {
  anchorCutWindow,
  mapTimeThroughCut,
  percentIn,
  type TimeWindow,
} from './review/_internal/timeline.ts';

export interface CutBlock {
  from: number;
  to: number;
  ops: SnipOperation[];
  isDeadAir: boolean;
  joinAt?: number;
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


type Word = ReturnType<typeof mediaWords>[number];

export interface AddedBlock {
  id: string;
  title: string;
  start: number;
  end: number;
  duration: number;
}

export interface CaptionLaneData {
  enabled: boolean;
  phrases: readonly MediaCaptionPhrase[];
  words: readonly Word[];
}

export interface VideoBlock {
  id: string;
  start: number;
  end: number;
  duration: number;
  source: string;
  sourceIn: number;
  sourceOut: number;
}

export interface VideoGap {
  at: number;
  source: string;
  skipped: number;
}

export interface VideoCut {
  at: number;
  gap?: VideoGap;
}

export interface VideoLaneData {
  blocks: VideoBlock[];
  cuts: VideoCut[];
  cutPoints: number[];
}



export function detectCutRange(
  prevItems: readonly (Piece | PlacedPiece | { at?: number; duration?: number; in?: number; out?: number })[] | undefined,
  curItems: readonly (Piece | PlacedPiece | { at?: number; duration?: number; in?: number; out?: number })[] | undefined,
  prevDuration: number,
  curDuration: number,
): { cutStart: number; cutEnd: number } | null {
  if (curDuration >= prevDuration - 0.001 || prevDuration <= 0) return null;
  const cutDuration = prevDuration - curDuration;
  let cutStart = -1;
  let prevAt = 0;

  if (prevItems && curItems) {
    for (let i = 0; i < prevItems.length; i++) {
      const prev = prevItems[i]!;
      const cur = curItems[i];
      const prevDur = typeof prev.duration === 'number' ? prev.duration : (typeof prev.out === 'number' && typeof prev.in === 'number' ? prev.out - prev.in : 0);
      if (!cur) {
        cutStart = prevAt;
        break;
      }
      const curDur = typeof cur.duration === 'number' ? cur.duration : (typeof cur.out === 'number' && typeof cur.in === 'number' ? cur.out - cur.in : 0);
      const curIn = typeof cur.in === 'number' ? cur.in : 0;
      const prevIn = typeof prev.in === 'number' ? prev.in : 0;

      if (Math.abs(curDur - prevDur) > 0.001 || Math.abs(curIn - prevIn) > 0.001) {
        if (curIn > prevIn) {
          cutStart = prevAt;
        } else {
          cutStart = prevAt + Math.min(prevDur, curDur);
        }
        break;
      }
      prevAt += prevDur;
    }
  }

  if (cutStart < 0) {
    cutStart = Math.max(0, curDuration);
  }
  return { cutStart, cutEnd: cutStart + cutDuration };
}

export function mapCutResizeDelta(
  initialValue: number,
  deltaX: number,
  trackWidth: number,
  sourceDuration: number,
  min: number,
  max: number,
): number {
  if (trackWidth <= 0) return initialValue;
  const sourceDelta = (deltaX / trackWidth) * sourceDuration;
  const nextValue = initialValue + sourceDelta;
  return Math.round(Math.max(min, Math.min(max, nextValue)) * 100) / 100;
}

export function projectAddedLane(
  graphics?: readonly PlanClip[] | null,
  visualInserts?: readonly { id: string; role?: string; at: number; duration: number; source?: string }[] | null,
): AddedBlock[] {
  const blocks: AddedBlock[] = [];
  if (graphics) {
    for (const clip of graphics) {
      blocks.push({
        id: clip.id,
        title: clip.title ?? clip.id,
        start: clip.in,
        end: clip.out,
        duration: Math.max(0, clip.out - clip.in),
      });
    }
  }
  if (visualInserts) {
    for (const insert of visualInserts) {
      if (insert.role !== 'main' && insert.role !== 'audio' && insert.role !== 'gap') {
        const already = blocks.some(
          (b) => b.id === insert.id || (Math.abs(b.start - insert.at) < 0.01 && Math.abs(b.duration - insert.duration) < 0.01),
        );
        if (!already) {
          blocks.push({
            id: insert.id,
            title: insert.source ?? insert.id,
            start: insert.at,
            end: insert.at + insert.duration,
            duration: insert.duration,
          });
        }
      }
    }
  }
  return blocks.sort((a, b) => a.start - b.start);
}

export function projectCaptionsLane(
  captionsOption: boolean | { look?: string } | undefined,
  phrases: readonly MediaCaptionPhrase[],
  words: readonly Word[],
): CaptionLaneData {
  if (captionsOption === false || (typeof captionsOption === 'object' && captionsOption.look === 'off')) {
    return { enabled: false, phrases: [], words: [] };
  }
  return { enabled: true, phrases, words };
}

export function projectVideoLane(input: {
  pieces?: readonly (Piece | PlacedPiece)[] | null;
  placements?: readonly (MediaPlacement & { at: number; duration: number; source?: string; in?: number; out?: number })[] | null;
  total?: number;
}): VideoLaneData {
  const blocks: VideoBlock[] = [];

  if (input.pieces && input.pieces.length > 0) {
    let currentAt = 0;
    for (let i = 0; i < input.pieces.length; i++) {
      const piece = input.pieces[i];
      const at = 'at' in piece && typeof (piece as PlacedPiece).at === 'number' ? (piece as PlacedPiece).at : currentAt;
      const duration = Math.max(0, piece.out - piece.in);
      blocks.push({
        id: `piece-${i}`,
        start: at,
        end: at + duration,
        duration,
        source: 'legacy',
        sourceIn: piece.in,
        sourceOut: piece.out,
      });
      currentAt = at + duration;
    }
  } else if (input.placements && input.placements.length > 0) {
    const mains = (input.placements.filter((p) => p.role === 'main') as (SourcePlacement & { at: number; duration: number })[])
      .slice()
      .sort((a, b) => a.at - b.at);
    for (const p of mains) {
      blocks.push({
        id: p.id,
        start: p.at,
        end: p.at + p.duration,
        duration: p.duration,
        source: p.source,
        sourceIn: p.in,
        sourceOut: p.out ?? p.in + p.duration,
      });
    }
  }

  const cuts: VideoCut[] = [];
  const cutPoints: number[] = [];

  for (let i = 0; i < blocks.length - 1; i++) {
    const current = blocks[i];
    const next = blocks[i + 1];
    const at = current.end;
    cutPoints.push(at);

    // Skipped gap only for adjacent forward spans of the same source
    if (current.source === next.source && next.sourceIn > current.sourceOut) {
      cuts.push({
        at,
        gap: {
          at,
          source: current.source,
          skipped: next.sourceIn - current.sourceOut,
        },
      });
    } else {
      cuts.push({ at });
    }
  }

  return { blocks, cuts, cutPoints };
}

export interface SimpleTimelineProps {
  time: number;
  total: number;
  shots?: readonly Shot[];
  comments?: readonly Comment[];
  canPin?: boolean;
  pinMode?: boolean;
  laneGraphics?: readonly PlanClip[];
  media?: MediaPlan;
  timeline?: MediaTimeline;
  pieces?: readonly (Piece | PlacedPiece)[];
  words?: readonly Word[];
  phrases?: readonly MediaCaptionPhrase[];
  captionsOption?: boolean | { look?: string };
  captionEditable?: boolean;
  isWordChanged?: (word: Word) => boolean;
  snapPoints?: readonly number[];
  win?: TimeWindow;
  onSeek(time: number): void;
  onPin(time: number): void;
  onWord?: (word: Word, text: string) => void;
  onRetime?: (word: Word, start: number, end: number) => void;
  onPhrase?: (index: number, text: string) => void;
}

export function SimpleTimeline({
  time,
  total,
  shots = [],
  comments = [],
  canPin = true,
  pinMode = false,
  laneGraphics = [],
  media,
  timeline,
  pieces,
  words = [],
  phrases = [],
  captionsOption,
  captionEditable = false,
  isWordChanged,
  snapPoints = [],
  win: propsWin,
  onSeek,
  onPin,
  onWord = () => {},
  onRetime = () => {},
  onPhrase = () => {},
}: SimpleTimelineProps) {
  const [snap, setSnap] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const cuts = useContext(SimpleCutsContext);
  const duration = Math.max(0, total > 0 ? total : (cuts ? cuts.keptMap.length : 0));
  const trackDuration = duration;
  const displayTime = (at: number) => at;
  const [openCutIndex, setOpenCutIndex] = useState<number | null>(null);
  const [draftCut, setDraftCut] = useState<{ cutIndex: number; edge: 'start' | 'end'; from: number; to: number } | null>(null);
  const dragState = useRef<{ pointerId: number; target: HTMLElement; cutIndex: number; edge: 'start' | 'end'; trackRect: DOMRect; startClientX: number; initialFrom: number; initialTo: number; lastDraft: { from: number; to: number } } | null>(null);
  const cutTrackRef = useRef<HTMLDivElement>(null);

  const [internalWin, setInternalWin] = useState<TimeWindow>(() => ({
    start: 0,
    length: Math.max(0.001, duration),
  }));
  const win = propsWin ?? internalWin;

  const prevDurationRef = useRef<number>(duration);
  const prevItemsRef = useRef<any>(pieces ?? timeline?.placements);

  useEffect(() => {
    const prevDuration = prevDurationRef.current;
    const prevItems = prevItemsRef.current;
    const currentItems = pieces ?? timeline?.placements;

    prevDurationRef.current = duration;
    prevItemsRef.current = currentItems;

    if (duration < prevDuration - 0.001 && prevDuration > 0) {
      const cut = detectCutRange(prevItems, currentItems, prevDuration, duration);
      if (cut) {
        setInternalWin((prev) => anchorCutWindow(prev, cut.cutStart, cut.cutEnd));
        const mapped = mapTimeThroughCut(time, cut.cutStart, cut.cutEnd, duration);
        if (Math.abs(mapped - time) > 0.001) {
          onSeek(mapped);
        }
      }
    } else if (duration > prevDuration + 0.001) {
      setInternalWin({ start: 0, length: Math.max(0.001, duration) });
    }
  }, [duration, pieces, timeline?.placements, time, onSeek]);

  const inside = (at: number) => Math.max(0, Math.min(Math.max(0, total - 0.001), at));

  const addedBlocks = useMemo(
    () =>
      projectAddedLane(
        laneGraphics,
        media?.placements as { id: string; role?: string; at: number; duration: number; source?: string }[] | undefined,
      ),
    [laneGraphics, media?.placements],
  );

  const captionData = useMemo(() => {
    return projectCaptionsLane(captionsOption, phrases, words);
  }, [captionsOption, phrases, words]);

  const videoData = useMemo(
    () =>
      projectVideoLane({
        pieces,
        placements:
          timeline?.placements ??
          (media?.placements as (MediaPlacement & { at: number; duration: number })[] | undefined),
        total: duration,
      }),
    [pieces, timeline?.placements, media?.placements, duration],
  );

  const allCutPoints = useMemo(
    () => [...new Set([...snapPoints, ...videoData.cutPoints].map((at) => cuts ? safeToSource(cuts.keptMap, at) : at))],
    [snapPoints, videoData.cutPoints, cuts],
  );

  const handleEmptyClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, input, [role="slider"], [role="spinbutton"], .native-trim, .editorial-text-bar')) return;
    const box = trackRef.current?.getBoundingClientRect();
    if (!box || win.length <= 0) return;
    const clickTime = win.start + ((event.clientX - box.left) / box.width) * win.length;
    const at = inside(clickTime);
    onSeek(at);
    if (canPin && pinMode) onPin(at);
  };

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
    const track = cutTrackRef.current;
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
      startClientX: event.clientX,
      initialFrom: cut.from,
      initialTo: cut.to,
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
    const deltaX = event.clientX - drag.startClientX;
    const prevCut = drag.cutIndex > 0 ? cuts.cuts[drag.cutIndex - 1] : undefined;
    const nextCut = drag.cutIndex < cuts.cuts.length - 1 ? cuts.cuts[drag.cutIndex + 1] : undefined;

    if (drag.edge === 'start') {
      const minFrom = prevCut ? prevCut.to + MIN_SNIP : 0;
      const maxFrom = cut.to - (MIN_SNIP + 0.001);
      const clampedFrom = mapCutResizeDelta(drag.initialFrom, deltaX, drag.trackRect.width, cuts.sourceDuration, minFrom, maxFrom);
      drag.lastDraft = { from: clampedFrom, to: cut.to };
      setDraftCut({ cutIndex: drag.cutIndex, edge: 'start', from: clampedFrom, to: cut.to });
    } else {
      const minTo = cut.from + (MIN_SNIP + 0.001);
      const maxTo = nextCut ? nextCut.from - MIN_SNIP : cuts.sourceDuration;
      const clampedTo = mapCutResizeDelta(drag.initialTo, deltaX, drag.trackRect.width, cuts.sourceDuration, minTo, maxTo);
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
      const maxTo = nextCut ? nextCut.from - MIN_SNIP : cuts.sourceDuration;
      nextTo = Math.round(Math.max(minTo, Math.min(maxTo, cut.to + delta)) * 10) / 10;
    }

    if (Math.abs(nextFrom - cut.from) > 1e-3 || Math.abs(nextTo - cut.to) > 1e-3) {
      await cuts.replaceCut(cut.ops[0]!, nextFrom, nextTo);
    }
  };


  // Generate ruler ticks: every 1s minor, every 5s major
  const ticks = useMemo(() => {
    if (duration <= 0) return [];
    const result: { s: number; major: boolean }[] = [];
    const endSec = Math.ceil(duration);
    for (let s = 0; s <= endSec; s++) {
      result.push({ s, major: s % 5 === 0 });
    }
    return result;
  }, [duration]);

  const pct = (s: number) => `${percentIn(win, s)}%`;

  return (
    <section className="sm-timeline" aria-label="Simple timeline" data-verify-cuts={cuts ? cuts.cuts.length : 0}>
      <style>{`
        .sm-timeline { position: relative; margin-top: 14px; user-select: none; }
        .sm-ruler-wrap { position: relative; height: 24px; border-bottom: 1px solid var(--rule); margin-bottom: 6px; }
        .sm-tick { position: absolute; bottom: 0; width: 1px; height: 5px; background: var(--hairline); }
        .sm-tick.major { height: 10px; background: var(--ink-2); }
        .sm-tick span { position: absolute; bottom: 12px; left: 3px; font-size: 10px; color: var(--muted); white-space: nowrap; }
        .sm-lanes-stack { position: relative; display: flex; flex-direction: column; gap: 8px; }
        .sm-lane-row { position: relative; }
        .sm-lane-heading { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin: 6px 0 3px; display: flex; justify-content: space-between; align-items: center; }
        .sm-snap-toggle { background: none; border: 1px solid var(--hairline); color: var(--ink-2); font-size: 11px; padding: 2px 8px; cursor: pointer; }
        .sm-snap-toggle.on, .sm-snap-toggle[aria-pressed="true"] { background: var(--light-wash); border-color: var(--light); color: var(--light); font-weight: 500; }
        .sm-lane-track { position: relative; height: 38px; background: var(--ground-deep); border: 1px solid var(--rule); overflow: hidden; }
        .sm-lane-track.video-track { height: 46px; }
        .sm-clip-item { position: absolute; top: 3px; bottom: 3px; overflow: hidden; display: flex; align-items: center; padding: 0 8px; font-size: 11px; border: 1px solid var(--rule); }
        .sm-clip-added { background: var(--card-raised); border-color: var(--hairline); color: var(--ink); }
        .sm-clip-video { background: oklch(.32 .02 106); border-color: var(--rule); color: var(--ink-2); }
        .sm-cut-line { position: absolute; top: 0; bottom: 0; width: 0; border-left: 2px dashed var(--light); opacity: .7; pointer-events: none; z-index: 3; }
        .sm-cut-icon { position: absolute; top: -14px; left: -6px; font-size: 10px; color: var(--light); }
        .sm-empty-text { font-size: 11px; color: var(--muted); line-height: 38px; padding-left: 12px; font-style: italic; }
        .sm-playhead-v { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--light); pointer-events: none; z-index: 10; }
        .sm-playhead-v::before { content: ""; position: absolute; top: 0; left: -4px; border: 5px solid transparent; border-top-color: var(--light); }
        .editorial-word.fixed, .w.fixed { border-color: var(--changed) !important; color: var(--changed) !important; }
        .editorial-word.fixed::before, .w.fixed::before { content: ""; position: absolute; top: 3px; right: 3px; width: 5px; height: 5px; background: var(--changed); pointer-events: none; }
      `}</style>

      <div className="sm-timeline-label">
        <span>{pinMode ? 'Click the picture or timeline to leave a note' : 'Click the timeline to seek'}</span>
        <span className="num">{formatClock(duration)}</span>
      </div>

      <div
        ref={trackRef}
        className="sm-lanes-stack"
        data-pin-mode={pinMode && canPin}
        onClick={handleEmptyClick}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            onSeek(inside(event.key === 'Home' ? 0 : event.key === 'End' ? total : time + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 1 : 1 / 30)));
            return;
          }
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (canPin && pinMode) onPin(inside(time));
          }
        }}
        tabIndex={0}
        role="button"
        aria-label={pinMode && canPin ? 'Add a timeline pin' : 'Seek timeline'}
      >
        {/* Full ruler */}
        <div className="sm-ruler-wrap" aria-label="Simple timeline ruler">
          {ticks.map((t) => (
            <div key={t.s} className={`sm-tick${t.major ? ' major' : ''}`} style={{ left: pct(t.s) }}>
              {t.major && <span className="num">{formatClock(t.s)}</span>}
            </div>
          ))}
        </div>

        {/* Lane 1: Added by Kinotta */}
        <div className="sm-lane-row" data-lane="added">
          <div className="sm-lane-heading">
            <span>Added by Kinotta</span>
          </div>
          <div className="sm-lane-track" aria-label="Added by Kinotta lane">
            {addedBlocks.length === 0 ? (
              <div className="sm-empty-text">Nothing added yet</div>
            ) : (
              addedBlocks.map((block) => (
                <div
                  key={block.id}
                  className="sm-clip-item sm-clip-added"
                  style={{
                    left: pct(displayTime(block.start)),
                    width: `max(2px, ${((displayTime(block.end) - displayTime(block.start)) / Math.max(0.001, duration)) * 100}%)`,
                  }}
                  title={block.title}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {block.title}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Lane 2: Captions */}
        <div className="sm-lane-row" data-lane="captions">
          <CaptionLane
            win={win}
            words={captionData.words}
            phrases={captionData.phrases}
            editable={captionEditable}
            canPin={false}
            snap={snap}
            snapPoints={allCutPoints}
            isWordChanged={isWordChanged}
            onWord={onWord}
            onRetime={onRetime}
            onPhrase={onPhrase}
            header={
              <div className="sm-lane-heading">
                <span>Captions</span>
                <button
                  type="button"
                  className={`sm-snap-toggle${snap ? ' on' : ''}`}
                  aria-pressed={snap}
                  aria-label="Toggle snap"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSnap((s) => !s);
                  }}
                >
                  {snap ? 'Snap' : 'Free'}
                </button>
              </div>
            }
          />
        </div>

        {/* Lane 3: Your video */}
        <div className="sm-lane-row" data-lane="video">
          <div className="sm-lane-heading">
            <span>Your video</span>
          </div>
          <div ref={cutTrackRef} className="sm-lane-track video-track sm-pin-track" aria-label="Your video lane" style={cuts ? { overflow: 'visible' } : undefined}>
            {videoData.blocks.map((block) => (
              <div
                key={block.id}
                className="sm-clip-item sm-clip-video"
                style={{
                  left: pct(block.start),
                  width: `max(2px, ${(block.duration / Math.max(0.001, duration)) * 100}%)`,
                }}
                title={`Video span: ${block.duration.toFixed(2)}s`}
              />
            ))}
            {/* Cut marks */}
            {!cuts && videoData.cuts.map((cut) => (
              <div
                key={cut.at}
                className="sm-cut-line"
                style={{ left: pct(cut.at) }}
                title={cut.gap ? `Cut (${cut.gap.skipped.toFixed(2)}s removed)` : 'Cut'}
              >
                <span className="sm-cut-icon">&#9986;</span>
              </div>
            ))}
      {cuts && cuts.cuts.map((cut, index) => {
        const isDraft = draftCut?.cutIndex === index;
        const displayFrom = isDraft ? draftCut.from : cut.from;
        const displayTo = isDraft ? draftCut.to : cut.to;
        const joinAt = cut.joinAt ?? (cuts ? sourceToReel(cuts.keptMap, cut.from) : cut.from);
        const leftPct = duration > 0 ? (joinAt / duration) * 100 : 0;
        const labelPrefix = cut.isDeadAir ? 'Cut pause' : 'Cut';
        const blockAriaLabel = `${labelPrefix}, ${(cut.to - cut.from).toFixed(1)} seconds at ${formatClock(cut.from)}`;
        const prevCut = index > 0 ? cuts.cuts[index - 1] : undefined;
        const nextCut = index < cuts.cuts.length - 1 ? cuts.cuts[index + 1] : undefined;
        const minFrom = prevCut ? prevCut.to + MIN_SNIP : 0;
        const maxFrom = cut.to - (MIN_SNIP + 0.001);
        const minTo = cut.from + (MIN_SNIP + 0.001);
        const maxTo = nextCut ? nextCut.from - MIN_SNIP : cuts.sourceDuration;

        return (
          <div
            key={`cut-${index}-${cut.from}`}
            className="sm-cut"
            data-cut-start={cut.from}
            data-cut-end={cut.to}
            data-cut-deadair={String(cut.isDeadAir)}
            style={{ left: `${leftPct}%` }}
          >
            <div className="sm-cut-join-line" />
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
                  right: leftPct > 50 ? 0 : 'auto',
                  left: leftPct > 50 ? 'auto' : 0,
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
            {/* Pin markers */}
            {comments
              .filter((comment) => !comment.state)
              .map((comment) => (
                <button
                  type="button"
                  key={comment.id}
                  className="sm-pin-mark num"
                  style={{ left: `${Math.min(98, duration > 0 ? (displayTime(comment.pin.time) / duration) * 100 : 0)}%` }}
                  aria-label={`Jump to pin ${comment.number}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSeek(comment.pin.time);
                  }}
                >
                  {comment.number}
                </button>
              ))}
          </div>
        </div>

        {/* Playhead line across the stack */}
        <div className="sm-playhead-v" style={{ left: pct(displayTime(time)) }} />
      </div>

    </section>
  );
}
