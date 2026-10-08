import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { NativeLanes } from './NativeLanes.tsx';
import { actionForKey, keyChord } from './editor-settings.ts';
import type { EditorAction } from './editor-settings.ts';
import { EditorToolbar } from './EditorToolbar.tsx';
import type { EditorTool } from './EditorToolbar.tsx';
import { FRAME_RATE, followWindow, tickTimes, zoomWindow } from './timeline.ts';
import type { TimeWindow } from './timeline.ts';
import { EditorialLanes } from './EditorialLanes.tsx';
import { TimelineOverview } from './TimelineOverview.tsx';
import { MediaLibrary } from './MediaLibrary.tsx';
import type { LibraryRow } from './MediaLibrary.tsx';
import { MediaPreview } from './MediaPreview.tsx';
import { ClipSettings } from './ClipSettings.tsx';
import { MIN_CLIP, applyOperations, captionPhrases, describeOverload, mediaPlanTimeline, mediaEditingPlan, mediaWithTracks, mediaSpans, mediaTimeline, mediaWords, remapMediaMoment, timelineMoment } from '../../../../server/core/model.ts';
import type { MediaSource, MediaTimeline, SourcePlacement, Sources } from '../../../../server/core/model.ts';
import { duplicateOf, replacementFor, snapDelta, snapPoints, trimToPlayhead } from './placement-edits.ts';
import { borrowedScene, clipIdForScene, clipOffsets, codeClips } from './edited.ts';
import { fetchMedia, fetchMediaModel, fetchOverload, fetchProjectMedia, fetchSpeech, fetchWaveform, footageUrl, importMedia, mediaUrl, referenceMedia, relinkMedia, transcribeMedia, versionPageUrl } from '../../api/index.ts';
import type { MediaEntry, MediaSpeech, MediaWaveform, MixOverload, NewComment, ProjectMediaFile } from '../../api/index.ts';
import { PagePlayer } from '../../stage/index.ts';
import type { CaptionMove, CaptionText, ElementChange, ElementEditing, FramePick } from '../../stage/index.ts';
import type { ReviewProps } from './Review.tsx';
import { useMediaPlayback } from './useMediaPlayback.ts';
import { useEditorWorkspace } from './EditorWorkspace.tsx';
import '../review.css';

/** How often a running transcription is checked on. */
const SPEECH_POLL_MS = 1000;
/** Shift moves ten of the viewer's configured nudge steps. */
const SHIFT_NUDGE_FACTOR = 10;
/** How far past a step an edge still stops on the playhead or a cut. */
const SNAP_REACH = 0.05;
/** A split needs this much on each side. */
const SPLIT_MARGIN = 0.01;
/** Defaults shared with engine/build.py's caption style and source-start tolerance. */
const CAPTION_COLOR = '#FF5A1F';
const CAPTION_AT = 0.005;
const SOURCE_TIME_PRECISION = 1_000_000;
const PIN_FRAME_WINDOW = 1 / 30;
const SNIP_PREVIEW_LEAD = 2;
/** While playing, the picture is put back on the sound's clock only when it is more than a frame (at 30 fps) away. */
const PICTURE_DRIFT = 1 / 30;
/** Edits arrive in bursts (a drag, typed levels): the mix is measured once they settle. */
const OVERLOAD_SETTLE_MS = 400;

type Placed = MediaTimeline['placements'][number];

function verifyAttrs(count: number, playing: boolean, ready: boolean, error: string | null, menu: string) {
  return { 'data-verify-unit': 'MediaEditor', 'data-verify-count': count, 'data-verify-empty': String(count === 0), 'data-verify-playing': String(playing), 'data-verify-loading': String(!ready), 'data-verify-error': String(!!error), 'data-verify-status': error ? 'error' : ready ? 'ready' : 'preparing', 'data-verify-menu': menu };
}

/** Native placements share the saved edit list and the same envelope used by rendering. */
export function MediaEditor({ reel, version, section, edits, actions, comments, onSaveComment, reveal, sourceRoot: initialRoot, legacySources }: ReviewProps & { sourceRoot?: string; legacySources?: Sources }) {
  const workspace = useEditorWorkspace();
  const base = version!.media!;
  const ops = useMemo(() => edits?.list?.operations.filter((op) => !edits.list!.flagged?.[op.id]) ?? [], [edits?.list]);
  const edited = useMemo(() => {
    const sources = applyOperations(legacySources ?? { plan: { media: base, duration: version!.duration, clips: version!.clips, captions: version!.captions, sections: version!.mediaSections ?? version!.sections }, words: version!.transcript ?? [] }, ops);
    return legacySources ? mediaEditingPlan(sources) : sources.plan;
  }, [base, version, ops, legacySources]);
  const media = useMemo(() => mediaWithTracks(edited.media!), [edited.media]);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedGraphic, setSelectedGraphic] = useState<string | null>(null);
  const [graphicDraft, setGraphicDraft] = useState<{ id: string; edge: 'start' | 'end' | 'move'; delta: number } | null>(null);
  const [clipMenu, setClipMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!clipMenu) return;
    const close = (event: PointerEvent) => { if (!(event.target as Element).closest('.editor-clip-menu')) setClipMenu(null); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [clipMenu]);
  const [tool, setTool] = useState<EditorTool>('select');
  const [snipRange, setSnipRange] = useState<{ from: number; to: number } | null>(null);
  const snipMark = useRef<number | null>(null);
  useEffect(() => { if (selected && !media.placements.some((p) => p.id === selected)) setSelected(null); }, [media.placements, selected]);
  const authored = useMemo(() => mediaPlanTimeline(edited), [edited]);
  const previewAuthored = useMemo(() => {
    const c = graphicDraft && edited.clips?.find((clip) => clip.id === graphicDraft.id);
    if (!graphicDraft || !c) return authored;
    const { edge, delta } = graphicDraft;
    try {
      return mediaPlanTimeline(applyOperations({ plan: edited, words: [] }, [edge === 'move'
        ? { id: 'preview', kind: 'clip-slide', clip: c.id, ...(c.placement ? { placement: c.placement } : {}), delta }
        : { id: 'preview', kind: 'clip-trim', clip: c.id, ...(c.placement ? { placement: c.placement } : {}), in: c.in + (edge === 'start' ? delta : 0), out: c.out + (edge === 'end' ? delta : 0) }]).plan);
    } catch { return authored; }
  }, [authored, edited, graphicDraft]);
  const timeline = useMemo(() => mediaTimeline(media, version!.duration), [media, version!.duration]);
  const laneGraphics = useMemo(() => (previewAuthored.clips ?? []).map((clip) => {
    if (!clip.attachmentBroken) return clip;
    const source = edited.clips?.find((item) => item.id === clip.id);
    const parts = source?.placement ? mediaSpans(media, source.placement, source.in, source.out, timeline.duration, source.cycle) : [];
    const start = parts.length ? Math.min(...parts.map((part) => part.start)) : Math.min(clip.in, Math.max(0, timeline.duration - MIN_CLIP));
    const end = parts.length ? Math.max(...parts.map((part) => part.end)) : start + MIN_CLIP;
    return { ...clip, in: start, out: end };
  }), [previewAuthored.clips, edited.clips, media, timeline.duration]);
  const savedTimeline = useMemo(() => mediaTimeline(base, version!.duration), [base, version!.duration]);
  const [pinning, setPinning] = useState(false);
  const [pinDraft, setPinDraft] = useState<{ pin: NewComment['pin']; label: string } | null>(null);
  const [pinText, setPinText] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSaving, setPinSaving] = useState(false);
  const [soloState, setSolo] = useState<string[]>([]);
  // A removed track must not keep soloing, or it silences everything left. Undo does not revive Solo.
  const solo = useMemo(() => soloState.filter((id) => media.tracks?.some((track) => track.id === id)), [soloState, media.tracks]);
  useEffect(() => { if (solo.length !== soloState.length) setSolo(solo); }, [solo, soloState]);
  const [library, setLibrary] = useState<MediaEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [failedImport, setFailedImport] = useState<{ file: File; error: string } | null>(null);
  const [projectFiles, setProjectFiles] = useState<ProjectMediaFile[]>([]);
  const [previewEntry, setPreviewEntry] = useState<MediaEntry | null>(null);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const snap = workspace.settings.snap;
  const [replacing, setReplacing] = useState<Record<string, string>>({});
  const [waveforms, setWaveforms] = useState<Record<string, MediaWaveform>>({});
  const [sourceRoot, setSourceRoot] = useState(initialRoot ?? null);
  const video = useRef<HTMLVideoElement>(null);
  const editable = version!.isNewest && !!edits?.list && !edits.list.stale && sourceRoot !== null;
  const sourceUrl = useCallback((id: string) => base.legacy && id.startsWith('legacy:') ? footageUrl(reel.slug) : mediaUrl(id, base.sources.some((s) => s.id === id) ? { reel: reel.slug, version: version!.number } : undefined), [base, reel.slug, version!.number]);
  const playback = useMediaPlayback(media, timeline.duration, sourceUrl, undefined, solo, snipRange);
  const { time, playing, ready } = playback;
  const selectSnip = (range: { from: number; to: number } | null) => {
    setSnipRange(range);
    if (range) playback.seek(range.to);
  };
  const togglePlayback = () => {
    if (!playing && snipRange) playback.seek(Math.max(0, snipRange.from - SNIP_PREVIEW_LEAD));
    setPreviewEntry(null); void playback.toggle();
  };
  useEffect(() => {
    if (section) playback.seek(authored.sections?.find((candidate) => candidate.id === section.id || candidate.partOf === section.id)?.start ?? section.start);
  }, [section?.id]);
  const [rawWindow, setRawWindow] = useState<TimeWindow | null>(null);
  const windowTotal = Math.max(timeline.duration, 1);
  const win = useMemo(() => rawWindow ? zoomWindow(rawWindow, 1, rawWindow.start, windowTotal) : { start: 0, length: windowTotal }, [rawWindow, windowTotal]);
  useEffect(() => { setRawWindow((current) => current ? followWindow(current, time, windowTotal) : null); }, [time, windowTotal]);
  const zoom = (factor: number) => setRawWindow(zoomWindow(win, factor, Math.max(win.start, Math.min(win.start + win.length, time)), windowTotal));
  // The overload of the mix this preview plays: pending edits while editing, else the saved version's (AM29, AM38).
  const overloadKey = `${version!.number}:${editable ? ops.map((op) => op.id).join(',') : 'saved'}`;
  const [measuredOverload, setMeasuredOverload] = useState<{ key: string; overload: MixOverload } | null>(null);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      fetchOverload(reel.slug, editable ? undefined : version!.number).then((overload) => live && setMeasuredOverload({ key: overloadKey, overload }), () => undefined);
    }, OVERLOAD_SETTLE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [overloadKey, reel.slug]);
  const overload = measuredOverload?.key === overloadKey && measuredOverload.overload.spans.length > 0 ? measuredOverload.overload : null;
  const shownPins = useMemo(() => comments.map((c) => ({ ...c, moment: remapMediaMoment(savedTimeline, timeline, c.pin.time, c.pin) })), [comments, savedTimeline, timeline]);
  const draftMoment = pinDraft?.pin.kind === 'frame' && pinDraft.pin.time !== undefined ? remapMediaMoment(savedTimeline, timeline, pinDraft.pin.time, pinDraft.pin) : null;
  useEffect(() => {
    const found = reveal && shownPins.find((c) => c.id === reveal.commentId);
    if (found && !found.moment.removed) playback.seek(found.moment.time);
  }, [reveal]);
  const graphicTiming = useMemo(() => ({
    clipOf: (scene: string) => {
      const saved = version!.clips ?? [];
      const id = clipIdForScene(scene, saved);
      // Pending split parts play in their nearest saved ancestor's scene until Save builds separate scenes.
      return (previewAuthored.clips ?? []).find((c) => !c.attachmentBroken && time >= c.in && time < c.out && (c.id === id || borrowedScene(c, saved) === id))?.id ?? id;
    },
    spans: new Map((previewAuthored.clips ?? []).map((c) => [c.id, c.attachmentBroken ? { start: 0, end: 0 } : { start: c.in, end: c.out }])),
    offset: 0,
  }), [previewAuthored, version, time]);
  // Named elements stay movable with media: a code-only page's scenes, or a footage reel's graphic clips (S10).
  const elementClips = useMemo(() => (version!.code ? codeClips(version!.code) : version!.clips ?? []), [version]);
  const elementOffsets = useMemo(() => clipOffsets(elementClips, edits?.list?.operations ?? []), [elementClips, edits?.list]);
  const changeElement = useRef<(change: ElementChange) => Promise<void>>(async () => undefined);
  changeElement.current = async ({ clip, element, x, y, scale }) => {
    if (!editable || edits!.busy) return;
    await edits!.add({ kind: 'element-offset', clip, element, x, y, scale });
  };
  const elements = useMemo<ElementEditing>(() => ({
    offsets: elementOffsets,
    clipOf: (scene) => clipIdForScene(scene, elementClips),
    onChange: editable && !pinning ? (change) => changeElement.current(change) : undefined,
  }), [elementOffsets, elementClips, editable, pinning]);
  const active = timeline.placements.filter((p) => !p.attachmentBroken && p.role !== 'gap' && p.role !== 'audio' && time >= p.at && time < p.at + p.duration);
  const picture = active.at(-1);
  const source = picture && picture.role !== 'gap' ? media.sources.find((s) => s.id === picture.source) : undefined;
  const framing = picture && picture.role !== 'gap' ? picture.framing : undefined;
  const moment = timelineMoment(timeline, time);
  const followable = !!moment && media.sources.find((s) => s.id === moment.source)?.kind === 'video';
  const pictureStyle = { objectFit: framing?.mode === 'fit' ? 'contain' as const : 'cover' as const, objectPosition: `${(framing?.x ?? 0.5) * 100}% ${(framing?.y ?? 0.5) * 100}%` };
  const savedPinMoment = (at: number, placement?: string, sourceTime?: number) => {
    const mapped = remapMediaMoment(timeline, savedTimeline, at, { placement, sourceTime });
    if (mapped.removed) throw new Error('Save this new or changed moment as a version before pinning it.');
    const named = timeline.placements.find((p) => p.id === placement);
    const root = named?.origin ?? named?.id;
    const original = named && savedTimeline.placements.find((p) => (p.id === named.id || (p.origin ?? p.id) === root) && p.at <= mapped.time && p.at + p.duration > mapped.time);
    return { time: mapped.time, ...(!base.legacy && original ? { placement: original.id } : {}) };
  };
  const pickFrame = (pick: FramePick) => {
    try {
      const target = picture ?? timeline.placements.find((p) => p.role === 'gap' && p.at <= time && p.at + p.duration > time);
      const saved = savedPinMoment(time, target?.id);
      workspace.setPanelTab('comments');
      setPinDraft({ pin: { kind: 'frame', shot: '', ...saved, ...pick }, label: `Frame at ${time.toFixed(2)}s` });
      setPinText(''); setPinError(null); setPinning(false);
    } catch (failure) { setPinError(failure instanceof Error ? failure.message : 'The pin moment could not be found.'); setPinning(false); }
  };
  const hasSound = (id: string) => { const source = media.sources.find((s) => s.id === id)!; return source.kind !== 'image' && source.audio !== false; };
  const savedFor = useCallback((id: string) => base.sources.some((s) => s.id === id) ? { reel: reel.slug, version: version!.number } : undefined, [base, reel.slug, version!.number]);
  const usesSpeech = (p: SourcePlacement) => p.role === 'main' ? p.speech !== false : p.speech === true;
  // Speech is transcribed the first time a source supplies it. Words already in the plan need nothing.
  const unspoken = [...new Set(media.placements.filter((p): p is SourcePlacement => p.role !== 'gap' && usesSpeech(p)).map((p) => p.source))]
    .filter((id) => { const s = media.sources.find((source) => source.id === id)!; return !s.words && !id.startsWith('legacy:') && hasSound(id); });
  const [speech, setSpeech] = useState<Record<string, MediaSpeech>>({});
  const spoken = useMemo(() => ({ ...media, sources: media.sources.map((s) => { const state = speech[s.id]; return !s.words && state?.state === 'ready' ? { ...s, words: state.words } : s; }) }), [media, speech]);
  const words = useMemo(() => mediaWords(spoken, timeline.duration), [spoken, timeline.duration]);
  const pinWord = (word: typeof words[number]) => {
    try {
      const saved = savedPinMoment(word.start, word.placement, word.sourceStart);
      const original = mediaWords(base, version!.duration).find((w) => (!saved.placement || w.placement === saved.placement) && Math.abs(w.start - saved.time) <= CAPTION_AT);
      if (!original) throw new Error('Save this new or changed word as a version before pinning it.');
      workspace.setPanelTab('comments');
      setPinDraft({ pin: { kind: 'word', shot: '', ...saved, word: original.text }, label: `Word “${word.text}” at ${word.start.toFixed(2)}s` });
      setPinText(''); setPinError(null); setPinning(false); playback.seek(word.start);
    } catch (failure) { setPinError(failure instanceof Error ? failure.message : 'The pin word could not be found.'); }
  };
  const savePin = async () => {
    if (!pinDraft || !onSaveComment || !pinText.trim() || pinSaving) return;
    setPinSaving(true); setPinError(null);
    try { await onSaveComment({ pin: pinDraft.pin, text: pinText.trim() }); setPinDraft(null); setPinText(''); }
    catch (failure) { setPinError(failure instanceof Error ? failure.message : 'The comment could not be saved.'); }
    finally { setPinSaving(false); }
  };
  const phrases = useMemo(() => edited.captions ? captionPhrases(words) : [], [edited.captions, words]);
  const captionStyle = typeof edited.captions === 'object' ? edited.captions : {};
  const captionPreview = useMemo(() => phrases.map((phrase) => ({ ...phrase, placement: phrase.words[0]!.placement!, sourceStart: phrase.words[0]!.sourceStart!, look: typeof edited.captions === 'object' ? edited.captions.look ?? 'highlight' : 'highlight', color: typeof edited.captions === 'object' ? edited.captions.color ?? CAPTION_COLOR : CAPTION_COLOR })), [phrases, edited.captions]);
  const captionShifts = useMemo(() => captionPreview.map((phrase) => {
    const opts = typeof edited.captions === 'object' ? edited.captions : {};
    const own = opts.phrases?.find((p) => p.placement === phrase.placement && Math.abs(p.at - phrase.sourceStart) <= CAPTION_AT);
    return { x: (opts.position?.x ?? 0) + (own?.x ?? 0), y: (opts.position?.y ?? 0) + (own?.y ?? 0) };
  }), [captionPreview, edited.captions]);
  const moveCaption = async ({ index, alt, dx, dy }: CaptionMove) => {
    const phrase = captionPreview[index];
    const shift = captionShifts[index];
    if (!editable || !phrase || !shift || edits!.busy) return;
    const wide = captionStyle.position ?? { x: 0, y: 0 };
    await edits!.add(alt ? { kind: 'caption-phrase-position', placement: phrase.placement, at: phrase.sourceStart, x: shift.x - wide.x + dx, y: shift.y - wide.y + dy } : { kind: 'caption-position', x: wide.x + dx, y: wide.y + dy });
  };
  /** The phrase on show retyped through the caption handle: only its own placement's words change (S2). */
  const retypeCaption = async ({ index, text }: CaptionText) => {
    const phrase = captionPreview[index];
    if (!editable || !phrase || edits!.busy) return;
    const first = phrase.words[0]!;
    const last = phrase.words.at(-1)!;
    const used = media.placements.find((p) => p.id === first.placement);
    const spoken = used && used.role !== 'gap' ? used.words ?? media.sources.find((s) => s.id === used.source)?.words ?? [] : [];
    // The last word's own end in source time; its reel end can be cut short by the placement.
    const lastEnd = spoken.find((w) => Math.abs(w.start - last.sourceStart!) <= CAPTION_AT)?.end ?? last.sourceStart! + last.end - last.start;
    await edits!.add({ kind: 'phrase-text', placement: phrase.placement, from: first.sourceStart!, to: lastEnd, text, was: phrase.words.map((w) => w.text).join(' ') });
  };
  const askSpeech = useCallback((id: string) => transcribeMedia(id, savedFor(id)).then((state) => setSpeech((before) => ({ ...before, [id]: state })), (failure: unknown) => setSpeech((before) => ({ ...before, [id]: { state: 'failed', error: failure instanceof Error ? failure.message : 'Speech could not be transcribed.' } }))), [savedFor]);
  const unspokenKey = unspoken.join('\n');
  useEffect(() => { for (const id of unspokenKey ? unspokenKey.split('\n') : []) if (!speech[id]) void askSpeech(id); }, [unspokenKey, speech, askSpeech]);
  const running = unspoken.filter((id) => speech[id]?.state === 'running').join('\n');
  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => { for (const id of running.split('\n')) void fetchSpeech(id, savedFor(id)).then((state) => setSpeech((before) => ({ ...before, [id]: state })), () => undefined); }, SPEECH_POLL_MS);
    return () => clearTimeout(timer);
  }, [running, speech, savedFor]);
  // Shots, overlays and code scenes are where authored graphics live. Without them the page draws nothing.
  const graphicsAbsent = version!.shots.length === 0 && version!.overlays.length === 0 && !version!.code;

  const loadLibrary = useCallback(() => fetchMedia().then(setLibrary, (failure: unknown) => setLibraryError(failure instanceof Error ? failure.message : 'The library could not be loaded.')), []);
  const loadProjectFiles = useCallback(() => fetchProjectMedia().then(setProjectFiles, (failure: unknown) => setLibraryError(failure instanceof Error ? failure.message : 'The project files could not be loaded.')), []);
  useEffect(() => { void loadLibrary(); void loadProjectFiles(); }, [loadLibrary, loadProjectFiles]);
  useEffect(() => {
    let current = true;
    if (!initialRoot) void fetchMediaModel(reel.slug).then((model) => { if (current) setSourceRoot(model.sourceRoot); }).catch((failure: unknown) => { if (current) setLibraryError(failure instanceof Error ? failure.message : 'The editing paths could not be loaded.'); });
    return () => { current = false; };
  }, [reel.slug, initialRoot]);
  useEffect(() => {
    let current = true;
    for (const source of media.sources) {
      if (source.kind === 'image' || source.audio === false) continue;
      void fetchWaveform(source.id, base.sources.some((s) => s.id === source.id) ? { reel: reel.slug, version: version!.number } : undefined).then((wave) => { if (current) setWaveforms((before) => ({ ...before, [source.id]: wave })); }).catch(() => undefined);
    }
    return () => { current = false; };
  }, [media.sources, base, reel.slug, version!.number]);
  // The picture runs on the sound's clock. Until the video is actually playing, the sound and the clock hold, so a picture
  // that cannot keep up pauses the reel rather than drifting (AM36). A picture that fails stops playback with Retry.
  const [pictureRunning, setPictureRunning] = useState(false);
  const [pictureErrors, setPictureErrors] = useState<Record<string, string>>({});
  const [pictureAttempts, setPictureAttempts] = useState<Record<string, number>>({});
  const pictureError = source ? pictureErrors[source.id] ?? null : null;
  const placementsHere = timeline.placements.filter((p) => time >= p.at && time < p.at + p.duration);
  const soundFailureHere = placementsHere.some((p) => p.role !== 'gap' && playback.failures[p.source]);
  const speechFailureHere = placementsHere.some((p) => p.role !== 'gap' && usesSpeech(p) && speech[p.source]?.state === 'failed');
  const videoPicture = source?.kind === 'video';
  const waitingForPicture = playing && videoPicture && !pictureRunning && pictureError === null;
  useEffect(() => { playback.hold(waitingForPicture); }, [waitingForPicture, playback.hold]);
  useEffect(() => { setPictureRunning(false); }, [source?.id]);
  const pictureFailed = (message: string) => {
    if (source) setPictureErrors((before) => ({ ...before, [source.id]: message }));
    if (playing) void playback.toggle();
  };
  useEffect(() => {
    const element = video.current;
    if (!element || !picture || picture.role === 'gap' || pictureError !== null) return;
    const target = picture.in + time - picture.at;
    if (!playing) {
      element.pause();
      if (Math.abs(element.currentTime - target) > 1 / 60) element.currentTime = target;
    } else if (element.paused) {
      element.currentTime = target;
      element.play().catch((failure: unknown) => {
        // A pause or a new source interrupting play() is not a failure of the picture.
        if (failure instanceof DOMException && failure.name === 'AbortError') return;
        pictureFailed(`The picture for ${source?.name ?? source?.path.split('/').at(-1) ?? 'this placement'} could not be played.`);
      });
    } else if (pictureRunning && Math.abs(element.currentTime - target) > PICTURE_DRIFT) element.currentTime = target;
  }, [time, playing, picture, version, pictureRunning, pictureError]);
  const retryPicture = (id = source?.id) => {
    if (!id) return;
    setPictureErrors((before) => { const next = { ...before }; delete next[id]; return next; });
    setPictureAttempts((before) => ({ ...before, [id]: (before[id] ?? 0) + 1 }));
    setPictureRunning(false);
    if (source?.id === id) video.current?.load();
  };
  const change = (id: string, changes: Partial<SourcePlacement>) => { if (editable) void edits!.add({ kind: 'placement-change', placement: id, changes }); };
  const isImage = (p: Placed) => p.role !== 'gap' && media.sources.find((s) => s.id === p.source)?.kind === 'image';
  const splittable = (p: Placed) => time - p.at > SPLIT_MARGIN && p.at + p.duration - time > SPLIT_MARGIN && (p.role === 'gap' || !p.loop);
  const split = (p: Placed) => { if (editable && splittable(p)) void edits!.add({ kind: 'placement-split', placement: p.id, at: Math.round((time - p.at) * 100) / 100 }); };
  const duplicate = (p: Placed) => {
    const { placement, index } = duplicateOf(media.placements.find((raw) => raw.id === p.id)!, p, crypto.randomUUID(), media.sequence);
    void edits!.add({ kind: 'placement-add', placement, ...(index !== undefined ? { index } : {}) });
  };
  const replace = (p: Placed, entry: MediaEntry) => {
    if (p.role === 'gap') return;
    const raw = media.placements.find((r) => r.id === p.id) as SourcePlacement;
    const source: MediaSource = { id: entry.id, name: entry.name, kind: entry.kind, path: `${sourceRoot}/${entry.path}`, duration: entry.duration, audio: entry.audio, contentHash: entry.contentHash, words: entry.words };
    void edits!.add({ kind: 'placement-replace', target: p.id, placement: replacementFor(raw, p, entry, crypto.randomUUID()), source: media.sources.some((s) => s.id === entry.id) ? undefined : source });
  };
  /** Placement edits use the workspace key bindings. */
  const onPlacementKey = (event: KeyboardEvent<HTMLButtonElement>, p: Placed) => {
    if (!editable || event.target !== event.currentTarget) return;
    const chord = keyChord(event.nativeEvent);
    const shiftedAction = event.shiftKey ? actionForKey(workspace.settings.keys, chord.replace('Shift+', '')) : null;
    const action = actionForKey(workspace.settings.keys, chord) ?? (shiftedAction && ['left', 'right', 'up', 'down'].includes(shiftedAction) ? shiftedAction : null);
    if (action === 'apply' && !snipRange) { event.preventDefault(); setSelected(p.id); setSelectedGraphic(null); workspace.setPanelTab('clip'); return; }
    if (action === 'split') { event.preventDefault(); split(p); return; }
    if (action === 'duplicate') { event.preventDefault(); duplicate(p); return; }
    if (action === 'left' || action === 'right') {
      event.preventDefault();
      const sign = action === 'left' ? -1 : 1;
      const index = media.sequence.indexOf(p.id);
      if (index >= 0) {
        const to = index + sign;
        if (to >= 0 && to < media.sequence.length) void edits!.add({ kind: 'placement-move', placement: p.id, index: to });
        return;
      }
      const step = sign * workspace.settings.nudge * (event.shiftKey ? SHIFT_NUDGE_FACTOR : 1);
      const delta = snap ? snapDelta([p.at, p.at + p.duration], step, snapPoints(timeline, p.id, time), SNAP_REACH) : step;
      change(p.id, { at: Math.max(0, Math.round((p.at + delta) * 100) / 100) });
    } else if (action === 'trimStart' || action === 'trimEnd') {
      event.preventDefault();
      const trimmed = trimToPlayhead(p, isImage(p), time, action === 'trimStart' ? 'start' : 'end');
      if (trimmed) change(p.id, trimmed);
    }
  };
  const add = async (entry: MediaEntry, role: SourcePlacement['role'], at = time, track?: string, index?: number) => {
    const source: MediaSource = { id: entry.id, name: entry.name, kind: entry.kind, path: `${sourceRoot}/${entry.path}`, duration: entry.duration, audio: entry.audio, contentHash: entry.contentHash, words: entry.words };
    const existing = media.sources.find((s) => s.id === source.id);
    const fades = entry.kind !== 'image' && entry.audio !== false ? { fadeIn: workspace.settings.fade, fadeOut: workspace.settings.fade } : {};
    await edits!.add({ kind: 'placement-add', source: existing ? undefined : source, placement: { id: crypto.randomUUID(), role, source: entry.id, in: 0, out: entry.duration, ...fades, ...(entry.kind === 'image' ? { duration: 3 } : {}), ...(role !== 'main' ? { at } : {}), ...(track ? { track } : {}) }, ...(index !== undefined ? { index } : {}) });
  };
  const upload = async (file: File) => {
    setUploading(true); setFailedImport(null);
    try { await importMedia(file); await loadLibrary(); }
    // The file stays selected so Retry sends it again. Nothing of it is listed as ready.
    catch (failure) { setFailedImport({ file, error: failure instanceof Error ? failure.message : 'The file could not be imported.' }); }
    finally { setUploading(false); }
  };
  const libraryAction = async (action: () => Promise<unknown>) => {
    setLibraryError(null); setUploading(true);
    try { await action(); await Promise.all([loadLibrary(), loadProjectFiles()]); }
    catch (failure) { setLibraryError(failure instanceof Error ? failure.message : 'The library could not be changed.'); }
    finally { setUploading(false); }
  };
  const error = playback.error ?? edits?.error ?? ((!workspace.railOpen || workspace.railTab !== 'media') ? libraryError : null);
  const useRow = async (row: LibraryRow, action: (entry: MediaEntry) => Promise<void> | void) => {
    setLibraryError(null); setUploading(true);
    try {
      const entry = row.entry ?? await referenceMedia(row.path);
      if (!row.entry) await Promise.all([loadLibrary(), loadProjectFiles()]);
      await action(entry);
    } catch (failure) { setLibraryError(failure instanceof Error ? failure.message : 'This media could not be used.'); }
    finally { setUploading(false); }
  };
  const dropMedia = (path: string, role: SourcePlacement['role'], at: number, track?: string) => {
    const entry = library.find((item) => item.path === path);
    const file = projectFiles.find((item) => item.path === path);
    const row = entry ? { path, name: entry.name, kind: entry.kind, entry } : file;
    if (!row || !editable) return;
    void useRow(row, async (chosen) => {
      if (role === 'audio' && (chosen.kind === 'image' || chosen.audio === false)) throw new Error('This media has no sound to put on a track.');
      if (role !== 'audio' && chosen.kind === 'audio') throw new Error('Drop sound onto an audio track.');
      if (version!.code && role !== 'audio') return;
      let index: number | undefined;
      if (role === 'main') {
        const target = timeline.placements.find((p) => media.sequence.includes(p.id) && p.at <= at && p.at + p.duration > at);
        index = target ? media.sequence.indexOf(target.id) : media.sequence.length;
        if (target && at - target.at > SPLIT_MARGIN && target.at + target.duration - at > SPLIT_MARGIN) {
          if (!await edits!.add({ kind: 'placement-split', placement: target.id, at: at - target.at })) return;
          index += 1;
        }
      }
      await add(chosen, role, at, track, index);
    });
  };
  const selectedPlacement = timeline.placements.find((p) => p.id === selected) ?? timeline.placements.find((p) => media.sequence.includes(p.id) && p.at <= time && p.at + p.duration > time);
  const enabled = (action: EditorAction) => {
    if (action === 'select' || action === 'snap') return true;
    if (action === 'play') return ready && timeline.duration > 0 && !pictureError;
    if (!editable || edits!.busy) return false;
    if (action === 'blade' || action === 'snip' || action === 'gap') return !version!.code;
    if (action === 'apply') return !!snipRange && !version!.code;
    if (action === 'split') return !version!.code && !!selectedPlacement && splittable(selectedPlacement);
    if (action === 'duplicate' || action === 'remove') return !!selected && !!selectedPlacement;
    if (action === 'pin') return !!onSaveComment && !playing && time < timeline.duration && !pinSaving;
    if (action === 'undo') return edits!.list?.canUndo === true;
    if (action === 'redo') return edits!.list?.canRedo === true;
    return true;
  };
  const runAction = (action: EditorAction, fast = false) => {
    if (action === 'zoomIn' || action === 'zoomOut') { zoom(action === 'zoomIn' ? 0.5 : 2); return; }
    if (action === 'fit') { setRawWindow(null); return; }
    if (action === 'cancel') { setClipMenu(null); setSelected(null); setSnipRange(null); setTool('select'); setPinning(false); setPinDraft(null); return; }
    if (action === 'start' || action === 'end') { playback.seek(action === 'start' ? 0 : timeline.duration); return; }
    if ((action === 'left' || action === 'right') && !selected) { playback.seek(time + (action === 'left' ? -1 : 1) * (fast ? 1 : 1 / FRAME_RATE)); return; }
    if (!enabled(action)) return;
    if (action === 'select' || action === 'blade' || action === 'snip') { setTool(action); setSnipRange(null); snipMark.current = null; }
    else if (action === 'snap') workspace.setSettings((settings) => ({ ...settings, snap: !settings.snap }));
    else if (action === 'play') togglePlayback();
    else if (action === 'trimStart' && tool === 'snip') snipMark.current = time;
    else if (action === 'trimEnd' && tool === 'snip' && snipMark.current !== null && Math.abs(time - snipMark.current) >= MIN_CLIP) selectSnip({ from: Math.min(time, snipMark.current), to: Math.max(time, snipMark.current) });
    else if (action === 'split' && selectedPlacement) split(selectedPlacement);
    else if (action === 'duplicate' && selectedPlacement) duplicate(selectedPlacement);
    else if (action === 'gap') void edits!.add({ kind: 'placement-add', placement: { id: crypto.randomUUID(), role: 'gap', duration: workspace.settings.gap }, index: selectedPlacement && media.sequence.includes(selectedPlacement.id) ? media.sequence.indexOf(selectedPlacement.id) + 1 : media.sequence.length });
    else if (action === 'pin') { setPinning(!pinning); setPinDraft(null); setPinError(null); }
    else if (action === 'remove' && selected) void edits!.add({ kind: 'placement-remove', placement: selected });
    else if (action === 'undo') void edits!.undo();
    else if (action === 'redo') void edits!.redo();
    else if ((action === 'up' || action === 'down') && selectedPlacement?.role !== 'gap' && selectedPlacement?.track) {
      const tracks = [...(media.tracks ?? [])].sort((a, b) => a.order - b.order);
      const target = tracks[tracks.findIndex((track) => track.id === selectedPlacement.track) + (action === 'up' ? -1 : 1)];
      if (target) change(selectedPlacement.id, { track: target.id });
    }
    else if (action === 'apply' && snipRange && !version!.code) void edits!.add({ kind: 'placement-snip', ...snipRange }).then((ok) => { if (ok) { playback.seek(snipRange.from); setSnipRange(null); setTool('select'); } });
  };
  return <main className="main rv-main" aria-label="Review" {...verifyAttrs(media.placements.length, playing, ready, playback.error ?? pictureError, clipMenu && timeline.placements.some((p) => p.id === clipMenu.id) ? clipMenu.id : '')} data-verify-broken-graphics={(authored.clips ?? []).filter((c) => c.attachmentBroken).length} data-verify-clock={time} data-verify-waiting={String(waitingForPicture)} onKeyDown={(event) => {
    if (event.defaultPrevented || workspace.settingsOpen || (event.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')) return;
    const chord = keyChord(event.nativeEvent);
    const shiftedAction = event.shiftKey ? actionForKey(workspace.settings.keys, chord.replace('Shift+', '')) : null;
    const action = actionForKey(workspace.settings.keys, chord) ?? (shiftedAction && ['left', 'right', 'up', 'down'].includes(shiftedAction) ? shiftedAction : null);
    if (!action || action === 'rail' || action === 'settings' || (action === 'apply' && !enabled(action))) return;
    event.preventDefault(); runAction(action, event.shiftKey);
  }}>
    <div className="head"><h1>{reel.title}</h1><div className="head-actions">{actions}</div></div>
    {error && <p role="alert">{error}</p>}
    {media.legacy && <p className="meta">This older version references project files. Save freezes the media used by the new version.</p>}
    <div className="rv-well">
      <div className="rv-frame" data-media-preview={String(!!previewEntry)} data-verify-framing={source ? framing?.mode ?? 'crop' : undefined} data-verify-framing-x={source ? framing?.x ?? 0.5 : undefined} data-verify-framing-y={source ? framing?.y ?? 0.5 : undefined}>
        {source?.kind === 'image' && <img className="mv-picture" style={pictureStyle} alt={source.name ?? source.path.split('/').at(-1)} src={`${sourceUrl(source.id)}${pictureAttempts[source.id] ? `?retry=${pictureAttempts[source.id]}` : ''}`} onError={() => pictureFailed(`The picture for ${source.name ?? source.path.split('/').at(-1)} could not be loaded.`)} />}
        {source?.kind === 'video' && <video key={source.id} ref={video} className="mv-picture" style={pictureStyle} src={sourceUrl(source.id)} muted playsInline preload="auto"
          onPlaying={() => setPictureRunning(true)} onWaiting={() => setPictureRunning(false)} onSeeking={() => setPictureRunning(false)} onPause={() => setPictureRunning(false)}
          onError={() => pictureFailed(`The picture for ${source.name ?? source.path.split('/').at(-1)} could not be loaded.`)} />}
        {!picture && graphicsAbsent && <p className="mv-audio-only">Sound only. No picture or graphics at this point.</p>}
        <PagePlayer className="rv-page" title="Authored graphics" pageUrl={versionPageUrl(reel.slug, version!.number)} time={Math.min(time, timeline.duration)} clipTiming={graphicTiming} captionPreview={captionPreview} captionShifts={captionShifts} onCaptionMove={editable && edited.captions && !pinning ? moveCaption : undefined} onCaptionText={editable && edited.captions && !pinning ? retypeCaption : undefined} elements={elements} onFramePick={pinning ? pickFrame : undefined} draftPin={pinDraft?.pin.kind === 'frame' && draftMoment && !draftMoment.removed && Math.abs(draftMoment.time - time) < PIN_FRAME_WINDOW ? pinDraft.pin : null} pins={shownPins.filter((c) => c.pin.kind === 'frame' && !c.state && !c.moment.removed && Math.abs(c.moment.time - time) < PIN_FRAME_WINDOW).map((c) => ({ id: c.id, number: c.number, text: c.text, x: c.pin.kind === 'frame' ? c.pin.x : 0, y: c.pin.kind === 'frame' ? c.pin.y : 0, element: c.pin.kind === 'frame' ? c.pin.element : null }))} />
        {previewEntry && <MediaPreview key={previewEntry.id} entry={previewEntry} onClose={() => setPreviewEntry(null)} />}
        {!previewEntry && (pictureError || soundFailureHere || speechFailureHere) && <p className="editor-frame-error" role="status">{pictureError ?? (soundFailureHere ? 'Sound in this span could not be prepared. Retry the failed clip on its track.' : 'Speech in this span could not be transcribed. Retry speech on the clip.')}</p>}
      </div>
    {overload && <section className="mv-overload" aria-label="Mix overload">
      <p role="alert">{`Mix above full scale at ${describeOverload(overload)}. Lower a level or volume point.`}</p>
      <button type="button" className="rv-tool" onClick={() => playback.seek((overload.spans.find((span) => span.start > time + SPLIT_MARGIN) ?? overload.spans[0])!.start)}>Next overload</button>
    </section>}
      <div className="rv-transport">
        <button type="button" className="rv-tool" disabled={!ready || timeline.duration === 0 || (pictureError !== null && !playing)} onClick={togglePlayback}>{playing ? 'Pause' : 'Play'}</button>
        <label className="mv-clock">Playhead <input aria-label="Playhead" type="number" min="0" max={workspace.settings.timecode === 'frames' ? Math.round(timeline.duration * FRAME_RATE) : timeline.duration} step={workspace.settings.timecode === 'frames' ? 1 : 0.01} value={workspace.settings.timecode === 'frames' ? Math.round(time * FRAME_RATE) : time.toFixed(2)} onChange={(event) => playback.seek(Number(event.target.value) / (workspace.settings.timecode === 'frames' ? FRAME_RATE : 1))} /></label>
        <span className="rv-tc">/ {workspace.settings.timecode === 'frames' ? `${Math.round(timeline.duration * FRAME_RATE)}f` : `${timeline.duration.toFixed(2)}s`}</span>
        {!ready && !playback.error && <span role="status">Preparing sound…</span>}
        {waitingForPicture && ready && <span role="status">Waiting for picture…</span>}
        {solo.length > 0 && <span role="status">Solo is for preview</span>}
      </div>
    </div>
    <EditorToolbar tool={tool} pinning={pinning} settings={workspace.settings} enabled={enabled} onAction={runAction} />
    {version!.code && <p className="meta">Built from code: only elements can be moved. To change timing, ask your agent for a new version.</p>}
    {pinError && <p role="alert">{pinError}</p>}
    {pinDraft && workspace.pinHost && createPortal(<form aria-label="New review pin" className="mv-placement mv-pin-draft" onSubmit={(e) => { e.preventDefault(); void savePin(); }}>
      <p>{pinDraft.label}</p><label>Comment <textarea aria-label="Pin comment" value={pinText} disabled={pinSaving} onChange={(e) => setPinText(e.target.value)} autoFocus /></label>
      <div className="mv-controls"><button type="submit" className="rv-tool" disabled={pinSaving || !pinText.trim()}>{pinSaving ? 'Saving pin…' : 'Save pin'}</button><button type="button" className="rv-tool" disabled={pinSaving} onClick={() => { setPinDraft(null); setPinError(null); }}>Cancel pin</button></div>
    </form>, workspace.pinHost)}

    <section className="editor-timeline-view" aria-label="Timeline view">
      <div className="editor-timeline-controls"><span>Timeline</span><button type="button" className="rv-tool" aria-label="Zoom in timeline" disabled={win.length <= Math.min(2, windowTotal)} onClick={() => runAction('zoomIn')}>+</button><button type="button" className="rv-tool" aria-label="Zoom out timeline" disabled={win.length >= windowTotal} onClick={() => runAction('zoomOut')}>−</button><button type="button" className="rv-tool" onClick={() => runAction('fit')}>Fit timeline</button><label>Pan <input aria-label="Pan timeline" type="range" min="0" max={windowTotal - win.length} step="0.01" value={win.start} disabled={win.length >= windowTotal} onChange={(event) => setRawWindow({ ...win, start: Number(event.target.value) })} /></label></div>
    </section>
    <NativeLanes media={media} timeline={timeline} win={win} time={time} selected={selected} editable={editable && !edits!.busy} solo={solo}
      overview={<TimelineOverview timeline={timeline} win={win} time={time} keys={workspace.settings.keys} nudge={workspace.settings.nudge} onWindow={setRawWindow} />}
      tool={tool} range={snipRange} onRange={selectSnip} onBlade={(p, at) => { if (!version!.code && at - p.at > SPLIT_MARGIN && p.at + p.duration - at > SPLIT_MARGIN) void edits!.add({ kind: 'placement-split', placement: p.id, at: at - p.at }); }}
      onMediaDrop={dropMedia} waveforms={waveforms} soundErrors={playback.failures} pictureErrors={pictureErrors} speech={speech} onRetry={(id, kind) => kind === 'sound' ? playback.retry(id) : kind === 'speech' ? void askSpeech(id) : retryPicture(id)} snap={snap} nudge={workspace.settings.nudge} keys={workspace.settings.keys} overload={overload?.spans ?? []} onChange={change} onMove={(id, index) => void edits!.add({ kind: 'placement-move', placement: id, index })}
      onDetach={(id, track) => void edits!.add({ kind: 'placement-detach', placement: id, track })}
      onReorderTrack={(id, index) => void edits!.add({ kind: 'track-move', track: id, index })}
      onSelect={(id, inspect) => { setSelectedGraphic(null); setSelected(id); if (inspect) workspace.setPanelTab('clip'); }} onSeek={playback.seek} onKey={onPlacementKey}
      onMenu={(id, x, y) => { setSelectedGraphic(null); setSelected(id); setClipMenu({ id, x, y }); }}
      onTrack={(id, changes) => void edits!.add({ kind: 'track-change', track: id, changes })}
      onSolo={(id) => setSolo(solo.includes(id) ? solo.filter((item) => item !== id) : [...solo, id])}
      onRemoveTrack={(id) => void edits!.add({ kind: 'track-remove', track: id })} onAddTrack={() => void edits!.add({ kind: 'track-add', track: { id: crypto.randomUUID(), name: `Track ${(media.tracks?.length ?? 0) + 1}`, order: Math.max(-1, ...(media.tracks ?? []).map((track) => track.order)) + 1, gain: 1, mute: false } })}>
    <EditorialLanes duration={timeline.duration} win={win} words={words} phrases={phrases} graphics={laneGraphics} pins={shownPins} editable={editable && !edits!.busy} graphicEditable={editable && !edits!.busy && !version!.code} canPin={!!onSaveComment && editable && !playing && !pinSaving} selectedGraphic={selectedGraphic}
      onSeek={playback.seek} onPin={pinWord} onWord={(word, text) => void edits!.add({ kind: 'word-text', placement: word.placement, at: word.sourceStart!, text })}
      onRetime={(word, start, end) => void edits!.add({ kind: 'word-timing', placement: word.placement, at: word.sourceStart!, start: Math.round(start * SOURCE_TIME_PRECISION) / SOURCE_TIME_PRECISION, end: Math.round(end * SOURCE_TIME_PRECISION) / SOURCE_TIME_PRECISION })}
      onPhrase={(index, text) => void retypeCaption({ index, text })}
      onGraphicPreview={setGraphicDraft}
      onGraphic={(id, inspect) => { setSelected(null); setSelectedGraphic(id); if (inspect) workspace.setPanelTab('clip'); }}
      onGraphicKey={(event, id) => { if (actionForKey(workspace.settings.keys, keyChord(event.nativeEvent)) === 'apply' && !snipRange) { event.preventDefault(); event.stopPropagation(); setSelected(null); setSelectedGraphic(id); workspace.setPanelTab('clip'); } }}
      onGraphicDrag={(id, edge, delta) => { const c = edited.clips?.find((clip) => clip.id === id); if (!c) { setGraphicDraft(null); return; } void edits!.add(edge === 'move' ? { kind: 'clip-slide', clip: id, ...(c.placement ? { placement: c.placement } : {}), delta } : { kind: 'clip-trim', clip: id, ...(c.placement ? { placement: c.placement } : {}), in: c.in + (edge === 'start' ? delta : 0), out: c.out + (edge === 'end' ? delta : 0) }).then(() => setGraphicDraft(null)); }} />
      <div className="native-lane editor-ruler"><strong>Time</strong><div className="native-lane-bars" aria-label="Timeline ruler" onClick={(event) => { if (event.target !== event.currentTarget) return; const box = event.currentTarget.getBoundingClientRect(); playback.seek(win.start + (event.clientX - box.left) / box.width * win.length); }}>{tickTimes(win).map((tick) => <button type="button" key={tick} style={{ transform: tick === win.start + win.length ? 'translateX(-100%)' : undefined, left: `${(tick - win.start) / win.length * 100}%` }} onClick={() => playback.seek(tick)}>{workspace.settings.timecode === 'frames' ? `${Math.round(tick * FRAME_RATE)}f` : `${tick}s`}</button>)}</div></div>
    </NativeLanes>
    {clipMenu && (() => {
      const p = timeline.placements.find((item) => item.id === clipMenu.id);
      if (!p) return null;
      const inspect = () => { setClipMenu(null); workspace.setPanelTab('clip'); };
      const act = (action: () => void) => { setClipMenu(null); action(); };
      return <div className="editor-clip-menu" role="menu" aria-label="Clip actions" style={{ left: Math.min(clipMenu.x, window.innerWidth - 224), top: Math.min(clipMenu.y, window.innerHeight - 272) }} onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') { event.preventDefault(); setClipMenu(null); }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
          const index = items.indexOf(document.activeElement as HTMLButtonElement);
          items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
        }
      }}>
        <button type="button" role="menuitem" autoFocus onClick={inspect}>Clip settings…</button>
        <button type="button" role="menuitemcheckbox" aria-checked={p.role !== 'gap' && (p.mute ?? p.role === 'insert')} disabled={!editable || edits!.busy || p.role === 'gap' || !hasSound(p.source)} onClick={() => act(() => { if (p.role !== 'gap') change(p.id, { mute: !(p.mute ?? p.role === 'insert') }); })}>Mute</button>
        <button type="button" role="menuitem" disabled={!editable || edits!.busy || !!version!.code || !splittable(p)} onClick={() => act(() => split(p))}>Split{workspace.settings.keys.split && <kbd>{workspace.settings.keys.split}</kbd>}</button>
        <button type="button" role="menuitem" disabled={!editable || edits!.busy} onClick={() => act(() => duplicate(p))}>Duplicate</button>
        <button type="button" role="menuitem" disabled={!editable || edits!.busy || p.role === 'gap'} onClick={() => { inspect(); requestAnimationFrame(() => workspace.clipHost?.querySelector<HTMLSelectElement>('select[aria-label^="Replace "]')?.focus()); }}>Replace…</button>
        <button type="button" role="menuitem" disabled={!editable || edits!.busy} onClick={() => act(() => { void edits!.add({ kind: 'placement-remove', placement: p.id }); })}>Remove</button>
      </div>;
    })()}

    {snipRange && <div className="editor-snip-confirm"><span>{`Remove ${(snipRange.to - snipRange.from).toFixed(2)}s of footage`}</span><button type="button" className="rv-tool" disabled={!editable || edits!.busy} onClick={() => runAction('apply')}>Apply snip</button><button type="button" className="rv-tool" onClick={() => runAction('cancel')}>Cancel snip</button></div>}
    {workspace.clipHost && createPortal(<ClipSettings placements={timeline.placements.filter((p) => p.id === selected)} media={media} timeline={timeline} editable={editable && !edits!.busy} emptyHint={!selectedGraphic} time={time} edits={edits} waveforms={waveforms} speech={speech} unspoken={unspoken} library={library} moment={moment} followable={followable} replacing={replacing} setReplacing={setReplacing} hasSound={hasSound} usesSpeech={usesSpeech} askSpeech={askSpeech} change={change} splittable={splittable} split={split} duplicate={duplicate} replace={replace} />, workspace.clipHost)}
    {workspace.sectionHost && (authored.sections ?? []).some((s) => s.partOf) && createPortal(<section aria-label="Continuous sections"><div className="label">Surviving section spans</div><nav className="secs">{authored.sections!.map((s) => <button type="button" key={s.id} onClick={() => playback.seek(s.start)}><span className="nm">{s.name}</span><span className="sub">{s.start.toFixed(2)}–{s.end.toFixed(2)}s</span></button>)}</nav></section>, workspace.sectionHost)}
    {workspace.clipHost && selectedGraphic && createPortal(<section className="editor-graphic-settings" aria-label="Graphics attachments"><h2>Clip settings</h2>{(edited.clips ?? []).filter((c) => c.id === selectedGraphic).map((c) => {
      const mapped = authored.clips!.find((clip) => clip.id === c.id)!;
      const parts = mediaSpans(media, c.placement!, c.in, c.out, timeline.duration, c.cycle);
      const target = moment && timeline.placements.find((p) => p.id === moment.placement);
      const end = target?.role === 'main' ? Math.min(moment!.time + c.out - c.in, target.out) : 0;
      return <div key={c.id} className="mv-placement" >
        <p>{c.title ?? c.id}{mapped.attachmentBroken ? ' attachment is missing or interrupted. Trim it or attach it to a new footage range before Save.' : ` · ${mapped.in.toFixed(2)}–${mapped.out.toFixed(2)}s`}</p>
        <div className="mv-controls">
          <h3>Timing</h3>
          {(['in', 'out'] as const).map((edge) => <label key={edge}>{edge === 'in' ? 'In' : 'Out'} <input aria-label={`Graphic ${edge} ${c.id}`} type="number" min="0" step="0.01" defaultValue={c[edge]} key={c[edge]} disabled={!editable || !!version!.code} onBlur={(event) => { const value = Number(event.target.value); if (value !== c[edge]) void edits!.add({ kind: 'clip-trim', clip: c.id, ...(c.placement ? { placement: c.placement } : {}), in: edge === 'in' ? value : c.in, out: edge === 'out' ? value : c.out }); }} /></label>)}
          <h3>Picture</h3>
          {(['x', 'y', 'scale'] as const).map((field) => { const offset = c.offsets?.['@clip'] ?? { x: 0, y: 0, scale: 1 }; return <label key={field}>{field === 'x' ? 'Horizontal' : field === 'y' ? 'Vertical' : 'Scale'} <input aria-label={`Graphic ${field} ${c.id}`} type="number" step={field === 'scale' ? 0.1 : 1} defaultValue={offset[field]} key={offset[field]} disabled={!editable} onBlur={(event) => { const value = Number(event.target.value); if (value !== offset[field]) void edits!.add({ kind: 'element-offset', clip: c.id, element: '@clip', ...offset, [field]: value }); }} /></label>; })}
          <h3>Placement</h3>
          {mapped.attachmentBroken && parts.length > 1 && parts.every((part) => part.sourceEnd - part.sourceStart >= MIN_CLIP) && <button type="button" className="rv-tool" disabled={!editable} onClick={() => void edits!.add({ kind: 'clip-split', clip: c.id })}>Split into surviving parts</button>}
          {mapped.attachmentBroken && parts.filter((part) => part.sourceEnd - part.sourceStart >= MIN_CLIP).map((part) => <button type="button" className="rv-tool" key={part.start} disabled={!editable} onClick={() => void edits!.add({ kind: 'clip-trim', clip: c.id, placement: c.placement, in: part.sourceStart, out: part.sourceEnd })}>Trim to source {part.sourceStart.toFixed(2)}–{part.sourceEnd.toFixed(2)}s</button>)}
          <button type="button" className="rv-tool" disabled={!editable || !followable || !moment || end - moment.time < MIN_CLIP} onClick={() => { if (moment) void edits!.add({ kind: 'clip-attachment', clip: c.id, placement: moment.placement, in: moment.time, out: end }); }}>Attach at playhead</button>
          {timeline.placements.filter((p): p is Placed & SourcePlacement => p.role !== 'main' && p.role !== 'gap' && p.speech === true && !p.attachmentBroken && time >= p.at && time < p.at + p.duration).map((voice) => {
            // A looping voice names the pass under the playhead, so the graphic follows that pass only (A2).
            const range = voice.out - voice.in;
            const cycle = voice.loop ? Math.floor((time - voice.at) / range) : undefined;
            const from = voice.in + (time - voice.at - (cycle ?? 0) * range);
            const to = Math.min(from + c.out - c.in, voice.out, from + voice.at + voice.duration - time);
            const name = media.sources.find((s) => s.id === voice.source)?.name ?? voice.id;
            return <button type="button" className="rv-tool" key={voice.id} disabled={!editable || to - from < MIN_CLIP} onClick={() => void edits!.add({ kind: 'clip-attachment', clip: c.id, placement: voice.id, in: from, out: to, ...(cycle !== undefined ? { cycle } : {}) })}>{`Attach to ${name}${cycle !== undefined ? ` (pass ${cycle + 1})` : ''} at playhead`}</button>;
          })}
        </div>
      </div>;
    })}</section>, workspace.clipHost)}

    {workspace.mediaHost && createPortal(<MediaLibrary entries={library} files={projectFiles} editable={editable} busy={uploading} error={libraryError} failedImport={failedImport} preview={previewEntry ? previewPath : null}
      onUpload={upload} onPreview={(row) => void useRow(row, (entry) => { playback.seek(time); setPreviewPath(row.path); setPreviewEntry({ ...entry, name: row.name }); })}
      onAdd={(row) => void useRow(row, async (entry) => { await add(entry, entry.kind === 'audio' ? 'audio' : 'insert'); setPreviewEntry(null); })}
      onRetry={() => { setLibraryError(null); void Promise.all([loadLibrary(), loadProjectFiles()]); }}
      onRelink={(id, path) => void libraryAction(() => relinkMedia(id, path))} />, workspace.mediaHost)}
  </main>;
}
