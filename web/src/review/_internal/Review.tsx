import { useEffect, useMemo, useRef, useState } from 'react';
import type { Operation } from '../../../../server/core/model.ts';
import { footageUrl, versionPageUrl } from '../../api/index.ts';
import type { Comment, ReelSummary, Section, Version } from '../../api/index.ts';
import { Empty } from '../../Empty.tsx';
import type { CaptionPhrase } from '../../stage/index.ts';
import { formatDuration } from '../../timecode.ts';
import { Lanes } from './Lanes.tsx';
import type { WordCell } from './Lanes.tsx';
import { Player } from './Player.tsx';
import { applyOperations, pieceMap, toSource, toTimelineSpan } from '../../../../server/core/model.ts';
import { editedList, remap, sourceStretches } from './edited.ts';
import type { Remap } from './edited.ts';
import { clipSpans, indexAt } from './model.ts';
import type { Span } from './model.ts';
import { Tools } from './Tools.tsx';
import type { Tool } from './Tools.tsx';
import type { EditsState } from './useEdits.ts';
import { FRAME_RATE, centerWindow, followWindow, timelineLength, wholeVideo, zoomWindow } from './timeline.ts';
import type { Piece, TimeWindow } from './timeline.ts';
import { usePlayback } from './usePlayback.ts';
import '../review.css';

/** The lanes open on this many seconds of the reel (all of it when it is shorter). */
const ZOOM_DEFAULT_SECONDS = 15;
const TYPING = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
const ZOOM_IN = 0.5;
const ZOOM_OUT = 2;
const NO_PHRASES: CaptionPhrase[] = [];
const NO_OPERATIONS: readonly Operation[] = [];

export interface ReviewProps {
  reel: ReelSummary;
  /** `none`: the reel has no version yet, so its footage plays alone. */
  state: 'loading' | 'error' | 'none' | 'ready';
  /** Why the version could not be read, when `state` is `error`. */
  message?: string;
  version?: Version;
  comments: Comment[];
  /** On a reel with several sections: the one the rail has selected. Choosing another moves the lanes to it. */
  section?: Section | null;
  /** The reel's edit list and the changes to it. Absent: the reel plays but cannot be edited. */
  edits?: EditsState;
}

/** Keys the player owns. Typing in a field and a focused button's own Space are left alone. */
function ignoresKey(e: KeyboardEvent): boolean {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return true;
  const target = e.target;
  if (!(target instanceof HTMLElement)) return false;
  return TYPING.has(target.tagName) || target.isContentEditable || (e.key === ' ' && ['BUTTON', 'A', 'SUMMARY'].includes(target.tagName));
}

/** The items that survive the unsaved edits, moved to where they now sit. */
function remapped<T extends Span>(items: readonly T[], map: Remap): T[] {
  return items.flatMap((item) => {
    const span = map.span(item.start, item.end);
    return span ? [{ ...item, ...span }] : [];
  });
}

function Playing({ reel, state, version, comments, section = null, edits }: ReviewProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [videoLength, setVideoLength] = useState(0);
  const [videoFailed, setVideoFailed] = useState(false);
  const [phrases, setPhrases] = useState<CaptionPhrase[]>(NO_PHRASES);
  const [raw, setRaw] = useState<TimeWindow>({ start: 0, length: 0 });

  const withFootage = version ? version.footage?.exists === true : state === 'none';
  const hasVideo = withFootage && !videoFailed;
  const savedTotal = version ? version.duration : videoLength;
  const savedPieces: readonly Piece[] | null = useMemo(() => version?.pieces ?? (withFootage && savedTotal > 0 ? wholeVideo(savedTotal) : null), [version, withFootage, savedTotal]);
  // The reel can be edited when this is the newest version of a footage reel and its edit list is for it.
  const editable = edits !== undefined && version?.isNewest === true && version.pieces !== undefined && edits.list !== null && edits.list.stale !== true;
  const operations = editable ? edits.list!.operations : NO_OPERATIONS;
  // What the reel plays and shows is the version with the unsaved edits applied over it.
  const pieces = useMemo(() => (savedPieces ? (editedList(savedPieces, operations) as readonly Piece[]) : null), [savedPieces, operations]);
  const total = operations.length > 0 && pieces ? timelineLength(pieces) : savedTotal;
  const playback = usePlayback(video, pieces ?? wholeVideo(total), total, hasVideo);
  const { time } = playback;
  const moved = useMemo(() => remap(savedPieces ?? [], pieces ?? []), [savedPieces, pieces]);

  const clips = useMemo(() => remapped(clipSpans(version?.shots ?? []), moved), [version, moved]);
  const overview = useMemo(() => (clips.length > 0 ? clips : (pieces ?? []).map((p) => ({ start: p.at, end: p.at + p.out - p.in }))), [clips, pieces]);
  // Words: the saved version's, taken back to source time, with the unsaved word edits applied, then placed on the edited timeline.
  const shownWords = useMemo(() => {
    if (!version?.transcript) return null;
    const was = pieceMap(savedPieces ?? [], 0);
    const now = pieceMap(pieces ?? [], 0);
    const source = version.transcript.flatMap((w) => {
      const start = toSource(was, w.start);
      return start === null ? [] : [{ text: w.text, start, end: start + (w.end - w.start) }];
    });
    let edited = source;
    try {
      edited = applyOperations({ plan: {}, words: source }, operations.filter((op) => op.kind === 'word-text' || op.kind === 'word-timing')).words;
    } catch {
      // The list no longer applies to these words; the saved words show.
    }
    return edited.flatMap((w, i) => {
      const span = toTimelineSpan(now, w.start, w.end);
      const before = source[i]!;
      return span ? [{ text: w.text, ...span, fixed: w.text !== before.text, retimed: w.start !== before.start || w.end !== before.end, source: w }] : [];
    });
  }, [version, savedPieces, pieces, operations]);
  const words: WordCell[] | null = shownWords;
  const shownPhrases = useMemo(() => remapped(phrases, moved), [phrases, moved]);
  const shownComments = useMemo(
    () =>
      comments.flatMap((c) => {
        const at = moved.point(c.pin.time);
        return at === null ? [] : [{ ...c, pin: { ...c.pin, time: at } }];
      }),
    [comments, moved],
  );
  const win = useMemo<TimeWindow>(() => ({ start: Math.min(raw.start, Math.max(0, total - raw.length)), length: Math.min(raw.length, total) }), [raw, total]);

  // The lanes open on the first stretch of the reel once its length is known.
  useEffect(() => {
    if (total > 0) setRaw((w) => (w.length === 0 || w.length > total ? { start: 0, length: Math.min(total, ZOOM_DEFAULT_SECONDS) } : w));
  }, [total]);

  // The window follows the playhead, so the zoomed lanes and the overview stay in step with it.
  useEffect(() => {
    if (total > 0) setRaw((w) => (w.length === 0 ? w : followWindow(w, time, total)));
  }, [time, total]);

  // Choosing another section in the rail moves the window to it.
  const shownSection = useRef(section?.id);
  useEffect(() => {
    if (section && section.id !== shownSection.current && total > 0) setRaw((w) => centerWindow(w, section.start + w.length / 2, total));
    shownSection.current = section?.id;
  }, [section, total]);

  const [toolName, setTool] = useState<Tool>('select');
  const [selection, setSelection] = useState<Span | null>(null);
  const live = useRef({ playback, win, total, time, selection, pieces, editable, edits });
  live.current = { playback, win, total, time, selection, pieces, editable, edits };
  const tool = useRef(toolName);
  tool.current = toolName;
  const afterSnip = useRef<number | null>(null);
  const shownWordsRef = useRef(shownWords);
  shownWordsRef.current = shownWords;

  // The playhead goes to where a snip was, or stays put, once the edited reel is what plays.
  const operationCount = operations.length;
  const seenCount = useRef(operationCount);
  useEffect(() => {
    if (seenCount.current === operationCount) return;
    seenCount.current = operationCount;
    const target = afterSnip.current ?? live.current.time;
    afterSnip.current = null;
    live.current.playback.seek(Math.min(target, live.current.total));
  }, [operationCount]);

  const snip = async (): Promise<void> => {
    const { selection: chosen, pieces: shown, editable: allowed, edits: changes } = live.current;
    if (!chosen || !shown || !allowed || !changes || changes.busy) return;
    afterSnip.current = chosen.start;
    setSelection(null);
    for (const { from, to } of sourceStretches(shown, chosen.start, chosen.end)) {
      if (!(await changes.add({ kind: 'snip', from, to }))) break;
    }
  };
  /** Cuts the footage at a timeline time. A time already on a join is refused by the core, and its reason shows in the Edits panel. */
  const cutAt = async (at: number): Promise<void> => {
    const { pieces: shown, editable: allowed, edits: changes } = live.current;
    if (!shown || !allowed || !changes || changes.busy) return;
    const source = toSource(pieceMap(shown, 0), at);
    if (source !== null) await changes.add({ kind: 'cut', at: source });
  };
  const cutRef = useRef(cutAt);
  cutRef.current = cutAt;
  const movePiece = (from: number, to: number): void => {
    const { editable: allowed, edits: changes } = live.current;
    if (!allowed || !changes || changes.busy) return;
    void changes.add({ kind: 'move-piece', from, to });
  };
  const fixWord = (index: number, text: string): void => {
    const { editable: allowed, edits: changes } = live.current;
    const word = shownWordsRef.current?.[index];
    if (!allowed || !changes || changes.busy || !word) return;
    void changes.add({ kind: 'word-text', at: word.source.start, text, was: word.text });
  };
  const retimeWord = (index: number, startBy: number, endBy: number): void => {
    const { editable: allowed, edits: changes } = live.current;
    const word = shownWordsRef.current?.[index];
    if (!allowed || !changes || changes.busy || !word) return;
    void changes.add({ kind: 'word-timing', at: word.source.start, start: word.source.start + startBy, end: word.source.end + endBy });
  };
  const snipRef = useRef(snip);
  snipRef.current = snip;
  const zoom = (factor: number): void => {
    const { win: shown, total: length, time: now } = live.current;
    const inside = now >= shown.start && now <= shown.start + shown.length;
    setRaw(zoomWindow(shown, factor, inside ? now : shown.start + shown.length / 2, length));
  };
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      // Ctrl or Cmd with Z (Shift for redo) or Y steps the edit list, unless a field has its own undo.
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.defaultPrevented && /^[zy]$/i.test(e.key)) {
        const field = e.target instanceof HTMLElement && (TYPING.has(e.target.tagName) || e.target.isContentEditable);
        const { editable: allowed, edits: changes } = live.current;
        if (field || !allowed || !changes || changes.busy) return;
        e.preventDefault();
        void (e.key.toLowerCase() === 'y' || e.shiftKey ? changes.redo() : changes.undo());
        return;
      }
      if (ignoresKey(e)) return;
      const { playback: player, total: length, editable: allowed, selection: chosen } = live.current;
      const frames = e.shiftKey ? FRAME_RATE : 1;
      if (e.key === ' ') player.toggle();
      else if (e.key === 'ArrowRight') player.step(frames);
      else if (e.key === 'ArrowLeft') player.step(-frames);
      else if (e.key === 'Home') player.seek(0);
      else if (e.key === 'End') player.seek(length);
      else if ((e.key === 's' || e.key === 'S') && allowed) setTool('snip');
      else if ((e.key === 'b' || e.key === 'B') && allowed) {
        setTool('blade');
        setSelection(null);
      } else if (e.key === 'Enter' && tool.current === 'blade' && allowed) void cutRef.current(live.current.time);
      else if ((e.key === 'v' || e.key === 'V') && allowed) {
        setTool('select');
        setSelection(null);
      } else if (e.key === 'Enter' && chosen !== null && allowed) void snipRef.current();
      else if (e.key === 'Escape' && chosen !== null) setSelection(null);
      else if (e.key === '+' || e.key === '=') zoomRef.current(ZOOM_IN);
      else if (e.key === '-') zoomRef.current(ZOOM_OUT);
      else return;
      e.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const problem =
    withFootage && videoFailed ? 'The footage could not be loaded.' : !withFootage && version !== undefined && version.footage?.exists === false ? 'The footage file is missing.' : null;
  const pageUrl = version ? versionPageUrl(reel.slug, version.number) : undefined;
  const playable = total > 0 && win.length > 0;

  return (
    <main className="main rv-main" aria-label="Review">
      <div className="head">
        <h1>{reel.title}</h1>
        <span className="meta">
          {version ? `v${version.number} · ${formatDuration(total)}${operations.length > 0 ? ' · unsaved edits' : ''}` : 'No version yet. The footage plays alone.'}
        </span>
      </div>
      <Player
        title={reel.title}
        footageSrc={withFootage ? footageUrl(reel.slug) : undefined}
        video={video}
        pageUrl={pageUrl}
        problem={problem}
        time={time}
        pageTime={moved.page(time)}
        total={total}
        playing={playback.playing}
        win={win}
        tools={
          editable ? (
            <Tools
              tool={toolName}
              onTool={(next) => {
                setTool(next);
                if (next === 'select') setSelection(null);
              }}
              selection={selection}
              busy={edits?.busy === true}
              onSnip={() => void snip()}
              onCutAtPlayhead={() => void cutAt(time)}
            />
          ) : undefined
        }
        onToggle={playback.toggle}
        onZoom={zoom}
        onPhrases={setPhrases}
        onVideoMetadata={setVideoLength}
        onVideoError={() => setVideoFailed(true)}
      />
      {playable && (
        <Lanes
          win={win}
          total={total}
          time={time}
          pieces={withFootage ? pieces : null}
          clips={clips}
          phrases={shownPhrases}
          currentPhrase={indexAt(shownPhrases, time)}
          words={words}
          currentWord={words ? indexAt(words, time) : -1}
          onFixWord={editable && words ? fixWord : undefined}
          onRetimeWord={editable && words ? retimeWord : undefined}
          comments={shownComments}
          overview={overview}
          onWindow={setRaw}
          onScrub={playback.seek}
          snipping={editable && toolName === 'snip'}
          blading={editable && toolName === 'blade'}
          onCut={(at) => void cutAt(at)}
          onMovePiece={editable && withFootage ? movePiece : undefined}
          selection={selection}
          onSelect={setSelection}
        />
      )}
    </main>
  );
}

/** The Review tab: the reel in the Gate well, playing, with the lanes under it. */
export function Review(props: ReviewProps) {
  const { state, message, reel } = props;
  if (state === 'loading') return <main className="main" aria-label="Review"><div className="state">Loading…</div></main>;
  if (state === 'error') return <main className="main" aria-label="Review"><Empty>{`Could not read the reel. ${message ?? ''}`.trim()}</Empty></main>;
  // A new reel or version starts from the top, with its own window and its own page.
  return <Playing key={`${reel.slug}/${props.version?.number ?? 'footage'}`} {...props} />;
}
