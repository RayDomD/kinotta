import { useMemo, useRef, useState } from 'react';
import type { Comment, Shot } from './api/index.ts';
import type {
  MediaCaptionPhrase,
  MediaPlacement,
  MediaPlan,
  MediaTimeline,
  Piece,
  PlacedPiece,
  PlanClip,
  SourcePlacement,
  mediaWords,
} from '../../server/core/model.ts';
import { formatClock } from './timecode.ts';
import { CaptionLane } from './review/_internal/CaptionLane.tsx';

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
  onSeek,
  onPin,
  onWord = () => {},
  onRetime = () => {},
  onPhrase = () => {},
}: SimpleTimelineProps) {
  const [snap, setSnap] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const duration = Math.max(0, total);

  const inside = (at: number) => Math.max(0, Math.min(Math.max(0, duration - 0.001), at));

  const addedBlocks = useMemo(
    () =>
      projectAddedLane(
        laneGraphics,
        media?.placements as { id: string; role?: string; at: number; duration: number; source?: string }[] | undefined,
      ),
    [laneGraphics, media?.placements],
  );

  const captionData = useMemo(
    () => projectCaptionsLane(captionsOption, phrases, words),
    [captionsOption, phrases, words],
  );

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
    () => [...new Set([...snapPoints, ...videoData.cutPoints])],
    [snapPoints, videoData.cutPoints],
  );

  const handleEmptyClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, input, [role="spinbutton"], .native-trim, .editorial-text-bar')) return;
    const box = trackRef.current?.getBoundingClientRect();
    if (!box || duration <= 0) return;
    const at = inside(((event.clientX - box.left) / box.width) * duration);
    onSeek(at);
    if (canPin) onPin(at);
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

  const pct = (s: number) => (duration > 0 ? `${(s / duration) * 100}%` : '0%');

  return (
    <section className="sm-timeline" aria-label="Simple timeline">
      <style>{`
        .sm-timeline { position: relative; margin-top: 14px; user-select: none; }
        .sm-ruler-wrap { position: relative; height: 24px; border-bottom: 1px solid var(--rule); margin-bottom: 6px; }
        .sm-tick { position: absolute; bottom: 0; width: 1px; height: 5px; background: var(--hairline); }
        .sm-tick.major { height: 10px; background: var(--ink-2); }
        .sm-tick span { position: absolute; bottom: 12px; left: 3px; font-size: 10px; color: var(--muted); white-space: nowrap; }
        .sm-lanes-stack { position: relative; display: flex; flex-direction: column; gap: 8px; }
        .sm-lane-row { position: relative; }
        .sm-lane-heading { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin: 6px 0 3px; display: flex; justify-content: space-between; align-items: center; }
        .sm-snap-toggle { background: none; border: 1px solid var(--hairline); color: var(--ink-2); font-size: 11px; padding: 2px 8px; border-radius: 2px; cursor: pointer; }
        .sm-snap-toggle.on, .sm-snap-toggle[aria-pressed="true"] { background: var(--light-wash); border-color: var(--light); color: var(--light); font-weight: 500; }
        .sm-lane-track { position: relative; height: 38px; background: var(--ground-deep); border: 1px solid var(--rule); border-radius: 3px; overflow: hidden; }
        .sm-lane-track.video-track { height: 46px; }
        .sm-clip-item { position: absolute; top: 3px; bottom: 3px; border-radius: 2px; overflow: hidden; display: flex; align-items: center; padding: 0 8px; font-size: 11px; border: 1px solid var(--rule); }
        .sm-clip-added { background: var(--card-raised); border-color: var(--hairline); color: var(--ink); }
        .sm-clip-video { background: oklch(.32 .02 106); border-color: var(--rule); color: var(--ink-2); }
        .sm-cut-line { position: absolute; top: 0; bottom: 0; width: 0; border-left: 2px dashed var(--light); opacity: .7; pointer-events: none; z-index: 3; }
        .sm-cut-icon { position: absolute; top: -14px; left: -6px; font-size: 10px; color: var(--light); }
        .sm-empty-text { font-size: 11px; color: var(--muted); line-height: 38px; padding-left: 12px; font-style: italic; }
        .sm-playhead-v { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--light); pointer-events: none; z-index: 10; }
        .sm-playhead-v::before { content: ""; position: absolute; top: 0; left: -4px; border: 5px solid transparent; border-top-color: var(--light); }
        .editorial-word.fixed, .w.fixed { border-color: var(--amber, oklch(.80 .13 75)) !important; color: var(--amber, oklch(.80 .13 75)) !important; }
        .editorial-word.fixed::before, .w.fixed::before { content: ""; position: absolute; top: 3px; right: 3px; width: 5px; height: 5px; border-radius: 50%; background: var(--amber, oklch(.80 .13 75)); pointer-events: none; }
      `}</style>

      <div className="sm-timeline-label">
        <span>Click the timeline to leave a note</span>
        <span className="num">{formatClock(duration)}</span>
      </div>

      <div
        ref={trackRef}
        className="sm-lanes-stack"
        onClick={handleEmptyClick}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (canPin) onPin(inside(time));
          }
        }}
        tabIndex={0}
        role="button"
        aria-label="Add a timeline pin"
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
                    left: pct(block.start),
                    width: `max(2px, ${((block.end - block.start) / Math.max(0.001, duration)) * 100}%)`,
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
            win={{ start: 0, length: Math.max(0.001, duration) }}
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
          <div className="sm-lane-track video-track" aria-label="Your video lane">
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
            {videoData.cuts.map((cut) => (
              <div
                key={cut.at}
                className="sm-cut-line"
                style={{ left: pct(cut.at) }}
                title={cut.gap ? `Cut (${cut.gap.skipped.toFixed(2)}s removed)` : 'Cut'}
              >
                <span className="sm-cut-icon">&#9986;</span>
              </div>
            ))}
            {/* Pin markers */}
            {comments
              .filter((comment) => !comment.state)
              .map((comment) => (
                <button
                  type="button"
                  key={comment.id}
                  className="sm-pin-mark num"
                  style={{ left: `${Math.min(98, duration > 0 ? (comment.pin.time / duration) * 100 : 0)}%` }}
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
        <div className="sm-playhead-v" style={{ left: pct(time) }} />
      </div>

      {/* Scrubber */}
      <label className="sm-scrub">
        Playhead{' '}
        <input
          type="range"
          aria-label="Simple playhead"
          min="0"
          max={duration}
          step="0.01"
          value={Math.min(time, duration)}
          onChange={(event) => onSeek(Number(event.target.value))}
        />
      </label>
    </section>
  );
}
