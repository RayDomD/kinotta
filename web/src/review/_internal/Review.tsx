import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Operation } from '../../../../server/core/model.ts';
import { fetchMediaModel, footageUrl, versionPageUrl } from '../../api/index.ts';
import type { Comment, MediaEditingModel, NewComment, ReelSummary, Section, TranscriptionProgress, Version } from '../../api/index.ts';
import { Empty } from '../../Empty.tsx';
import type { CaptionMove, CaptionPhrase, CaptionText, ClipTiming, ElementChange, ElementEditing } from '../../stage/index.ts';
import { formatDuration } from '../../timecode.ts';
import { Lanes } from './Lanes.tsx';
import type { ClipPreview, PhraseCell, WordCell } from './Lanes.tsx';
import { Player } from './Player.tsx';
import { applyOperations, pieceMap, toSource, toTimelineSpan } from '../../../../server/core/model.ts';
import { captionShifts, clipIdForScene, codeClips, clipOffsets, editedClips, editedList, phraseTexts, remap, sourceStretches } from './edited.ts';
import type { Remap } from './edited.ts';
import { clipSpans, indexAt } from './model.ts';
import type { Span } from './model.ts';
import { Tools } from './Tools.tsx';
import type { Tool } from './Tools.tsx';
import type { EditsState } from './useEdits.ts';
import { FRAME_RATE, centerWindow, followWindow, timelineLength, wholeVideo, zoomWindow } from './timeline.ts';
import type { Piece, TimeWindow } from './timeline.ts';
import { laneProgress } from './transcribing.ts';
import { usePlayback } from './usePlayback.ts';
import { MediaEditor } from './MediaEditor.tsx';
import '../review.css';

/** The lanes open on this many seconds of the reel (all of it when it is shorter). */
const ZOOM_DEFAULT_SECONDS = 15;
const TYPING = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
/** The shortest stretch the keyboard marks (the same floor as a drag along the lanes), in seconds. */
const MIN_MARK = 0.05;
const ZOOM_IN = 0.5;
const ZOOM_OUT = 2;
/** Two source times this close are the same second. */
const SAME_SECOND = 1e-6;
const NO_PHRASES: CaptionPhrase[] = [];
const NO_OPERATIONS: readonly Operation[] = [];
/** One list for "no pieces", so a reel without footage maps its timeline to itself (two empty lists would be mapped as pieces of no length). */
const NO_PIECES: readonly Piece[] = [];
/** Seconds played before a selected stretch when its snip is previewed. */
const SNIP_LEAD_IN = 2;
const CODE_ONLY_REASON = 'Built from code: only elements can be moved. To change timing, ask your agent for a new version.';

export interface ReviewProps {
  reel: ReelSummary;
  /** `none`: the reel has no version yet, so its footage plays alone. */
  state: 'loading' | 'error' | 'none' | 'ready';
  /** Why the version could not be read, when `state` is `error`. */
  message?: string;
  version?: Version;
  comments: Comment[];
  onSaveComment?(input: NewComment): Promise<void>;
  reveal?: { commentId: string; seq: number } | null;
  /** On a reel with several sections: the one the rail has selected. Choosing another moves the lanes to it. */
  section?: Section | null;
  /** The reel's edit list and the changes to it. Absent: the reel plays but cannot be edited. */
  edits?: EditsState;
  /** The reel's transcription, while its v1 waits for it. */
  transcription?: TranscriptionProgress | null;
  /** At the end of the heading row: Approve and Render for the version on show. */
  actions?: ReactNode;
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

function Playing({ reel, state, version, comments, section = null, edits, transcription, actions }: ReviewProps) {
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
  // A reel still being transcribed has no version: its footage is the whole of what plays, and edits collect against it.
  const awaitingV1 = version === undefined && state === 'none' && withFootage && savedPieces !== null;
  const editable = edits !== undefined && edits.list !== null && edits.list.stale !== true && ((version?.isNewest === true && version.pieces !== undefined) || awaitingV1);
  // A reel built from code takes element moves only: its page is the version, with no footage, pieces or plan to edit.
  const codeOnly = version?.code !== undefined;
  const moveable = editable || (codeOnly && edits !== undefined && version?.isNewest === true && edits.list !== null && edits.list.stale !== true);
  // An edit flagged as no longer applying (its target is gone from the newest version) is not previewed.
  const listed = moveable ? edits!.list! : null;
  const operations = useMemo(() => (listed ? listed.operations.filter((op) => listed.flagged?.[op.id] === undefined) : NO_OPERATIONS), [listed]);
  // What the reel plays and shows is the version with the unsaved edits applied over it.
  const pieces = useMemo(() => (savedPieces ? (editedList(savedPieces, operations) as readonly Piece[]) : null), [savedPieces, operations]);
  const total = operations.length > 0 && pieces ? timelineLength(pieces) : savedTotal;
  const [toolName, setTool] = useState<Tool>('select');
  const [selection, setSelection] = useState<Span | null>(null);
  // A stretch selected with the Snip tool plays as if snipped, before Snip makes it an edit.
  const previewSnip = editable && toolName === 'snip' ? selection : null;
  const playback = usePlayback(video, pieces ?? wholeVideo(total), total, hasVideo, previewSnip);
  const { time } = playback;
  const moved = useMemo(() => remap(savedPieces ?? NO_PIECES, pieces ?? NO_PIECES), [savedPieces, pieces]);

  // Clips: the plan's, in source time, with the unsaved trims and slides applied, placed on the edited timeline. A version without a plan shows its shots' clips.
  const planClips = useMemo(() => (version?.code ? codeClips(version.code) : version?.clips), [version]);
  const clips = useMemo(
    () => (planClips && pieces ? editedClips(planClips, operations, pieces) : remapped(clipSpans(version?.shots ?? []), moved)),
    [version, planClips, pieces, operations, moved],
  );
  const overview = useMemo(() => (clips.length > 0 ? clips : (pieces ?? []).map((p) => ({ start: p.at, end: p.at + p.out - p.in }))), [clips, pieces]);
  // Words: the saved version's, taken back to source time, with the unsaved word edits applied, then placed on the edited timeline.
  const sourceWords = useMemo(() => {
    if (!version?.transcript) return null;
    const was = pieceMap(savedPieces ?? [], 0);
    return version.transcript.flatMap((w) => {
      const start = toSource(was, w.start);
      return start === null ? [] : [{ text: w.text, start, end: start + (w.end - w.start) }];
    });
  }, [version, savedPieces]);
  const editedWords = useMemo(() => {
    if (!sourceWords) return null;
    try {
      return applyOperations({ plan: {}, words: sourceWords }, operations.filter((op) => op.kind === 'word-text' || op.kind === 'word-timing' || op.kind === 'phrase-text')).words;
    } catch {
      // The list no longer applies to these words; the saved words show.
      return sourceWords;
    }
  }, [sourceWords, operations]);
  const shownWords = useMemo(() => {
    if (!sourceWords || !editedWords) return null;
    const now = pieceMap(pieces ?? [], 0);
    // A retyped caption can change how many words there are; then a word is matched to the saved one starting with it.
    const counted = editedWords.length === sourceWords.length;
    return editedWords.flatMap((w, i) => {
      const span = toTimelineSpan(now, w.start, w.end);
      const before = counted ? sourceWords[i] : sourceWords.find((s) => Math.abs(s.start - w.start) < SAME_SECOND);
      return span ? [{ text: w.text, ...span, fixed: w.text !== before?.text, retimed: before === undefined || w.start !== before.start || w.end !== before.end, source: w }] : [];
    });
  }, [sourceWords, editedWords, pieces]);
  const words: WordCell[] | null = shownWords;
  // Caption positions: the saved ones with the unsaved moves over them, per phrase of the saved page.
  const placements = useMemo(() => {
    if (!sourceWords || !savedPieces) return null;
    const was = pieceMap(savedPieces, 0);
    return captionShifts(version?.captions, operations, sourceWords, phrases.map((p) => toSource(was, p.start) ?? Number.NaN));
  }, [version, sourceWords, savedPieces, operations, phrases]);
  // Caption words: each phrase's words with the unsaved word and caption edits, shown in the page and on the Captions lane.
  const captions = useMemo(() => {
    if (!sourceWords || !editedWords || !savedPieces) return null;
    const was = pieceMap(savedPieces, 0);
    const spans = phrases.map((p) => {
      const from = p.spoken ? toSource(was, p.spoken.start) : null;
      const to = p.spoken ? toSource(was, p.spoken.end - SAME_SECOND) : null;
      return from === null || to === null ? { from: Number.NaN, to: Number.NaN } : { from, to: to + SAME_SECOND };
    });
    return phraseTexts(spans, sourceWords, editedWords, savedPieces);
  }, [sourceWords, editedWords, savedPieces, phrases]);
  const captionWords = useMemo(() => (captions?.some((c) => c.page !== null) ? captions.map((c) => c.page) : null), [captions]);
  const shownPhrases = useMemo(
    () => remapped<PhraseCell>(phrases.map((p, i) => ({ ...p, own: placements?.[i]?.own, text: captions?.[i]?.page ? captions[i]!.page!.map((w) => w.text).join(' ') : p.text })), moved),
    [phrases, placements, captions, moved],
  );
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

  const live = useRef({ playback, win, total, time, selection, pieces, editable, moveable, edits, clips });
  live.current = { playback, win, total, time, selection, pieces, editable, moveable, edits, clips };
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

  // The picture follows a selection as it changes: paused on its end, the frame the snip would join to.
  useEffect(() => {
    if (!previewSnip) return;
    live.current.playback.pause();
    live.current.playback.seek(Math.min(previewSnip.end, live.current.total));
  }, [previewSnip]);
  /** Plays or pauses; with a stretch selected for a snip, playing starts a lead-in before it, so the join is heard. */
  const togglePlay = (): void => {
    const { playback: player, selection: chosen, editable: allowed } = live.current;
    if (!player.playing && chosen && allowed && tool.current === 'snip') player.seek(Math.max(0, chosen.start - SNIP_LEAD_IN));
    player.toggle();
  };
  const togglePlayRef = useRef(togglePlay);
  togglePlayRef.current = togglePlay;

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
  const slideClip = (id: string, by: number): void => {
    const { editable: allowed, edits: changes, clips: shown } = live.current;
    const clip = shown.find((c) => c.id === id);
    if (!allowed || !changes || changes.busy || !clip?.source) return;
    void changes.add({ kind: 'clip-slide', clip: id, delta: by });
  };
  /** An edge dragged by `by` seconds of the timeline: the new edge is where that lands in the footage, the other edge stays. */
  const trimClip = (id: string, edge: 'start' | 'end', by: number): void => {
    const { editable: allowed, edits: changes, clips: shown, pieces: current } = live.current;
    const clip = shown.find((c) => c.id === id);
    if (!allowed || !changes || changes.busy || !clip?.source || !current) return;
    const now = pieceMap(current, 0);
    // An out edge belongs to the footage before it, so ask for the second just inside.
    const found = edge === 'start' ? toSource(now, clip.start + by) : toSource(now, clip.end + by - SAME_SECOND);
    const edgeAt = found === null ? (edge === 'start' ? clip.source.in : clip.source.out) + by : found + (edge === 'end' ? SAME_SECOND : 0);
    void changes.add({ kind: 'clip-trim', clip: id, in: edge === 'start' ? edgeAt : clip.source.in, out: edge === 'end' ? edgeAt : clip.source.out });
  };
  const placementsRef = useRef(placements);
  placementsRef.current = placements;
  /** A drag or nudge of the caption on show: all captions, or with Alt that phrase alone, by what it moved. */
  const moveCaption = async ({ index, alt, dx, dy }: CaptionMove): Promise<void> => {
    const { editable: allowed, edits: changes } = live.current;
    const placed = placementsRef.current?.[index];
    if (!allowed || !changes || changes.busy || !placed) return;
    if (!alt) {
      await changes.add({ kind: 'caption-position', x: placed.wide.x + dx, y: placed.wide.y + dy });
      return;
    }
    await changes.add({ kind: 'caption-phrase-position', at: placed.key, x: placed.x - placed.wide.x + dx, y: placed.y - placed.wide.y + dy });
  };
  const captionsRef = useRef(captions);
  captionsRef.current = captions;
  /** The caption on show retyped in the frame: its words, from the first's start to the last's end, become the new text. */
  const retypeCaption = async ({ index, text }: CaptionText): Promise<void> => {
    const { editable: allowed, edits: changes } = live.current;
    const words = captionsRef.current?.[index]?.words;
    if (!allowed || !changes || changes.busy || !words || words.length === 0) return;
    await changes.add({ kind: 'phrase-text', from: words[0]!.start, to: words[words.length - 1]!.end, text, was: words.map((w) => w.text).join(' ') });
  };
  const changeElement = async ({ clip, element, x, y, scale }: ElementChange): Promise<void> => {
    const { moveable: allowed, edits: changes } = live.current;
    if (!allowed || !changes || changes.busy) return;
    await changes.add({ kind: 'element-offset', clip, element, x, y, scale });
  };
  const changeElementRef = useRef(changeElement);
  changeElementRef.current = changeElement;
  // Element offsets: the plan's, with the unsaved moves over them, shown on the page. Dragging is on with the Select tool.
  const offsets = useMemo(() => (planClips ? clipOffsets(planClips, operations) : null), [planClips, operations]);
  const dragElements = moveable && toolName === 'select';
  const elements = useMemo<ElementEditing | undefined>(
    () => (planClips && offsets ? { offsets, clipOf: (scene) => clipIdForScene(scene, planClips), onChange: dragElements ? (change) => changeElementRef.current(change) : undefined } : undefined),
    [planClips, offsets, dragElements],
  );
  // Clips slid or trimmed before Save, and the one being dragged, play at their new times in the picture: the page's
  // engine reads each scene's timing on every seek, so no rebuild is needed.
  const [clipDrag, setClipDrag] = useState<ClipPreview | null>(null);
  const pageOffset = moved.page(time) - time;
  const clipTiming = useMemo<ClipTiming | null>(() => {
    if (!planClips || codeOnly) return null;
    const ids = new Set(operations.flatMap((op) => (op.kind === 'clip-slide' || op.kind === 'clip-trim' ? [op.clip] : [])));
    if (clipDrag) ids.add(clipDrag.id);
    if (ids.size === 0) return null;
    const spans = new Map<string, { start: number; end: number }>();
    for (const clip of clips) {
      if (!ids.has(clip.id)) continue;
      const by = clipDrag?.id === clip.id ? clipDrag.by : 0;
      const mode = clipDrag?.id === clip.id ? clipDrag.mode : null;
      spans.set(clip.id, { start: clip.start + (mode === 'slide' || mode === 'start' ? by : 0), end: clip.end + (mode === 'slide' || mode === 'end' ? by : 0) });
    }
    return { clipOf: (scene) => clipIdForScene(scene, planClips), spans, offset: pageOffset };
  }, [planClips, codeOnly, operations, clipDrag, clips, pageOffset]);
  /** A clip drag as it goes: the picture follows it, with the playhead on the edge being moved. */
  const previewClip = (preview: ClipPreview | null): void => {
    if (preview !== null && clipDrag === null && playback.playing) playback.pause();
    setClipDrag(preview);
    const clip = preview && clips.find((c) => c.id === preview.id);
    if (!preview || !clip) return;
    // The end edge shows the clip's last frame, a frame inside its new end.
    const edge = preview.mode === 'end' ? clip.end + preview.by - 1 / FRAME_RATE : clip.start + preview.by;
    playback.seek(Math.max(0, edge));
  };
  const snipRef = useRef(snip);
  snipRef.current = snip;
  const zoom = (factor: number): void => {
    const { win: shown, total: length, time: now } = live.current;
    const inside = now >= shown.start && now <= shown.start + shown.length;
    setRaw(zoomWindow(shown, factor, inside ? now : shown.start + shown.length / 2, length));
  };
  const markIn = useRef<number | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      // Ctrl or Cmd with Z (Shift for redo) or Y steps the edit list, unless a field has its own undo.
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.defaultPrevented && /^[zy]$/i.test(e.key)) {
        const field = e.target instanceof HTMLElement && (TYPING.has(e.target.tagName) || e.target.isContentEditable);
        const { moveable: allowed, edits: changes } = live.current;
        if (field || !allowed || !changes || changes.busy) return;
        e.preventDefault();
        void (e.key.toLowerCase() === 'y' || e.shiftKey ? changes.redo() : changes.undo());
        return;
      }
      if (ignoresKey(e)) return;
      const { playback: player, total: length, editable: allowed, selection: chosen } = live.current;
      const frames = e.shiftKey ? FRAME_RATE : 1;
      if (e.key === ' ') togglePlayRef.current();
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
      } else if ((e.key === '[' || e.key === ']') && tool.current === 'snip' && allowed) {
        // The keyboard path to a stretch: [ marks where it starts, ] where it ends, both at the playhead.
        const at = live.current.time;
        if (e.key === '[') {
          markIn.current = at;
          setSelection(null);
        } else if (markIn.current !== null && at - markIn.current >= MIN_MARK) setSelection({ start: markIn.current, end: at });
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
          {version ? `v${version.number} · ${formatDuration(total)}${operations.length > 0 ? ' · unsaved edits' : ''}` : transcription?.state === 'running' ? 'No version yet. v1 is built when the words are in.' : 'No version yet. The footage plays alone.'}
        </span>
        {actions}
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
          // Without an edit list there are no tools at all.
          editable || (codeOnly && edits !== undefined) ? (
            <Tools
              unavailable={codeOnly ? CODE_ONLY_REASON : undefined}
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
        onToggle={togglePlay}
        onZoom={zoom}
        onPhrases={setPhrases}
        captionShifts={editable ? placements : null}
        onCaptionMove={editable && placements ? moveCaption : undefined}
        captionWords={captionWords}
        onCaptionText={editable && captions ? retypeCaption : undefined}
        elements={elements}
        clipTiming={clipTiming}
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
          transcribing={version === undefined ? laneProgress(transcription) : null}
          currentWord={words ? indexAt(words, time) : -1}
          onFixWord={editable && words ? fixWord : undefined}
          onRetimeWord={editable && words ? retimeWord : undefined}
          onSlideClip={editable && toolName === 'select' && planClips ? slideClip : undefined}
          onTrimClip={editable && toolName === 'select' && planClips ? trimClip : undefined}
          onPreviewClip={editable && toolName === 'select' && planClips ? previewClip : undefined}
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
  const [mediaModel, setMediaModel] = useState<MediaEditingModel | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [mediaAttempt, setMediaAttempt] = useState(0);
  const version = props.version;
  const adaptedVersion = useMemo(() => mediaModel && version ? { ...version, media: mediaModel.media, duration: mediaModel.duration, clips: mediaModel.clips ?? version.clips, mediaSections: mediaModel.sections, captions: mediaModel.captions === false ? undefined : mediaModel.captions ?? version.captions } : null, [version, mediaModel]);
  useEffect(() => {
    setMediaModel(null); setMediaError(null);
    if (state !== 'ready' || !version?.isNewest || version.media) return;
    let live = true;
    void fetchMediaModel(reel.slug).then((model) => { if (live) setMediaModel(model); }, (error: unknown) => { if (live) setMediaError(error instanceof Error ? error.message : 'The Review editor could not be loaded.'); });
    return () => { live = false; };
  }, [reel.slug, version?.number, version?.media, version?.isNewest, state, mediaAttempt]);
  if (state === 'loading') return <main className="main" aria-label="Review"><div className="state">Loading…</div></main>;
  if (state === 'error') return <main className="main" aria-label="Review"><Empty>{`Could not read the reel. ${message ?? ''}`.trim()}</Empty></main>;
  if (version?.media) return <MediaEditor key={`${reel.slug}/${version.number}`} {...props} />;
  if (mediaModel && adaptedVersion) return <MediaEditor key={`${reel.slug}/${adaptedVersion.number}`} {...props} sourceRoot={mediaModel.sourceRoot} legacySources={mediaModel.legacySources} version={adaptedVersion} />;
  if (version?.isNewest) return <main className="main" aria-label="Review">{mediaError ? <><p role="alert">{mediaError}</p><button type="button" className="rv-tool" onClick={() => setMediaAttempt((attempt) => attempt + 1)}>Retry Review</button></> : <div className="state">Preparing Review…</div>}</main>;
  return <Playing key={`${reel.slug}/${version?.number ?? 'footage'}`} {...props} />;
}
