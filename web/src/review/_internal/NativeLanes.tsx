import { Fragment, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
import type { MediaPlan, MediaTimeline, MediaTrack, SourcePlacement } from '../../../../server/core/model.ts';
import type { MediaSpeech, MediaWaveform } from '../../api/index.ts';
import { trimToPlayhead, snapDelta, snapPoints, snapTime } from './placement-edits.ts';
import type { EditorTool } from './EditorToolbar.tsx';
import { MEDIA_DRAG_TYPE } from './MediaLibrary.tsx';
import { actionForKey, keyChord } from './editor-settings.ts';
import type { EditorSettings } from './editor-settings.ts';
import type { TimeWindow } from './timeline.ts';

const SNAP_REACH = 0.05;
const MAX_GAIN = 2;
const POINT_SEPARATION = 0.000001;
const POINT_GAIN_STEP = 0.1;
/** A lost footage attachment stays visible as a repair marker, even beyond the surviving reel. */
const BROKEN_CLIP_SPAN = 0.5;

type Placed = MediaTimeline['placements'][number];
interface Props {
  children?: ReactNode;
  overview?: ReactNode;
  media: MediaPlan;
  timeline: MediaTimeline;
  win: TimeWindow;
  time: number;
  selected: string | null;
  editable: boolean;
  solo: string[];
  onSelect: (id: string, inspect: boolean) => void;
  onMenu: (id: string, x: number, y: number) => void;
  onSeek: (time: number) => void;
  onKey: (event: KeyboardEvent<HTMLButtonElement>, placement: Placed) => void;
  onTrack: (id: string, changes: Partial<MediaTrack>) => void;
  onSolo: (id: string) => void;
  onAddTrack: () => void;
  onRemoveTrack: (id: string) => void;
  onChange: (id: string, changes: Partial<SourcePlacement>) => void;
  onMove: (id: string, index: number) => void;
  onDetach: (id: string, track: string) => void;
  onReorderTrack: (id: string, index: number) => void;
  waveforms: Record<string, MediaWaveform>;
  soundErrors: Record<string, string>;
  pictureErrors: Record<string, string>;
  speech: Record<string, MediaSpeech>;
  onRetry: (source: string, kind: 'sound' | 'picture' | 'speech') => void;
  snap: boolean;
  nudge: number;
  keys: EditorSettings['keys'];
  overload: ReadonlyArray<{ start: number; end: number; placements?: string[] }>;
  tool: EditorTool;
  range: { from: number; to: number } | null;
  onRange: (range: { from: number; to: number } | null) => void;
  onBlade: (placement: Placed, at: number) => void;
  onMediaDrop: (path: string, role: SourcePlacement['role'], at: number, track?: string) => void;
}

function verifyAttrs(selected: string | null, count: number, win: TimeWindow) {
  return { 'data-verify-unit': 'NativeLanes', 'data-verify-selected': selected ?? '', 'data-verify-count': count, 'data-verify-window-start': win.start, 'data-verify-window-length': win.length };
}

/** Placement bars and named sound owners share one timeline coordinate system. */
export function NativeLanes({ children, overview, media, timeline, win, time, selected, editable, solo, onSelect, onMenu, onSeek, onKey, onTrack, onSolo, onAddTrack, onRemoveTrack, onChange, onMove, onDetach, onReorderTrack, waveforms, soundErrors, pictureErrors, speech, onRetry, snap, nudge, keys, overload, tool, range, onRange, onBlade, onMediaDrop }: Props) {
  const duration = win.length;
  const tracks = [...(media.tracks ?? [])].sort((a, b) => a.order - b.order);
  const gesture = useRef<{ placement: Placed; kind: 'move' | 'sound' | 'start' | 'end' | 'fadeIn' | 'fadeOut' | 'volume'; x: number; y: number; width: number; height: number; point?: number } | null>(null);
  const [offset, setOffset] = useState(0);
  const [volumeDraft, setVolumeDraft] = useState<{ id: string; index: number; at: number; gain: number } | null>(null);
  const selection = useRef<{ from: number; left: number; width: number } | null>(null);
  const pointAt = (p: Exclude<Placed, { role: 'gap' }>, index: number, at: number) => Math.max((p.volume?.[index - 1]?.at ?? -POINT_SEPARATION) + POINT_SEPARATION, Math.min((p.volume?.[index + 1]?.at ?? p.duration + POINT_SEPARATION) - POINT_SEPARATION, at));
  const begin = (event: PointerEvent<HTMLElement | SVGElement>, placement: Placed, kind: NonNullable<typeof gesture.current>['kind'], point?: number) => {
    if (!editable || placement.attachmentBroken || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    const lane = event.currentTarget.closest('.native-lane-bars')!;
    const box = lane.getBoundingClientRect();
    const rawAt = Math.max(0, Math.min(timeline.duration, win.start + (event.clientX - box.left) / box.width * duration));
    const at = snap && tool !== 'select' ? snapTime(rawAt, snapPoints(timeline, '', time), SNAP_REACH) : rawAt;
    if (tool === 'blade') { onBlade(placement, at); return; }
    if (tool === 'snip') {
      selection.current = { from: at, left: box.left, width: box.width };
      event.currentTarget.setPointerCapture(event.pointerId); return;
    }
    gesture.current = { placement, kind, x: event.clientX, y: event.clientY, width: box.width, height: event.currentTarget.closest('.native-clip')!.getBoundingClientRect().height, point };
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelect(placement.id, false);
  };
  const move = (event: PointerEvent<HTMLElement>) => {
    if (selection.current) {
      const rawAt = Math.max(0, Math.min(timeline.duration, win.start + (event.clientX - selection.current.left) / selection.current.width * duration));
      const at = snap ? snapTime(rawAt, snapPoints(timeline, '', time), SNAP_REACH) : rawAt;
      onRange({ from: Math.min(selection.current.from, at), to: Math.max(selection.current.from, at) }); return;
    }
    if (!gesture.current) return;
    const drag = gesture.current;
    if (drag.kind === 'volume' && drag.placement.role !== 'gap' && drag.point !== undefined) {
      const point = drag.placement.volume![drag.point]!;
      setVolumeDraft({ id: drag.placement.id, index: drag.point, at: pointAt(drag.placement, drag.point, point.at + (event.clientX - drag.x) / drag.width * duration), gain: Math.max(0, Math.min(MAX_GAIN, point.gain - (event.clientY - drag.y) / drag.height * MAX_GAIN)) });
      return;
    }
    setOffset((event.clientX - gesture.current.x) / gesture.current.width * duration);
  };
  const end = (event: PointerEvent<HTMLElement>) => {
    if (selection.current) { move(event); selection.current = null; return; }
    const drag = gesture.current;
    if (!drag) return;
    gesture.current = null; setOffset(0); setVolumeDraft(null);
    const p = drag.placement;
    const rawDelta = (event.clientX - drag.x) / drag.width * duration;
    if (drag.kind === 'volume' && p.role !== 'gap' && drag.point !== undefined) {
      const point = p.volume![drag.point]!;
      const at = pointAt(p, drag.point, point.at + rawDelta);
      const gain = Math.max(0, Math.min(MAX_GAIN, point.gain - (event.clientY - drag.y) / drag.height * MAX_GAIN));
      if (Math.abs(at - point.at) > POINT_SEPARATION || Math.abs(gain - point.gain) > POINT_SEPARATION) onChange(p.id, { volume: p.volume!.map((was, index) => index === drag.point ? { at, gain } : was) });
      return;
    }
    const edges = drag.kind === 'start' ? [p.at] : drag.kind === 'end' ? [p.at + p.duration] : [p.at, p.at + p.duration];
    const delta = snap && ['move', 'sound', 'start', 'end'].includes(drag.kind) ? snapDelta(edges, rawDelta, snapPoints(timeline, p.id, time), SNAP_REACH) : rawDelta;
    const target = document.elementsFromPoint(event.clientX, event.clientY).map((element) => element.closest<HTMLElement>('[data-track]')).find(Boolean)?.dataset.track;
    if (drag.kind === 'sound' && target && p.role === 'insert') { onDetach(p.id, target); return; }
    if (drag.kind === 'sound' && target && p.role !== 'gap' && p.track !== target) {
      onChange(p.id, { track: target, ...(p.role === 'audio' && Math.abs(delta) >= 0.01 ? { at: Math.max(0, p.at + delta) } : {}) }); return;
    }
    if (Math.abs(delta) < 0.01) return;
    if (drag.kind === 'start' || drag.kind === 'end') {
      const edge = drag.kind === 'start' ? p.at : p.at + p.duration;
      const trimmed = trimToPlayhead(p, p.role !== 'gap' && media.sources.find((source) => source.id === p.source)?.kind === 'image', edge + delta, drag.kind);
      if (trimmed) onChange(p.id, trimmed);
    } else if (drag.kind === 'fadeIn' || drag.kind === 'fadeOut') {
      if (p.role !== 'gap') onChange(p.id, { [drag.kind]: Math.max(0, Math.min(p.duration, (p[drag.kind] ?? 0) + (drag.kind === 'fadeIn' ? delta : -delta))) });
    } else if (drag.kind === 'move' && media.sequence.includes(p.id)) {
      const center = p.at + p.duration / 2 + delta;
      const rest = timeline.placements.filter((item) => media.sequence.includes(item.id) && item.id !== p.id);
      onMove(p.id, rest.filter((item) => center > item.at + item.duration / 2).length);
    } else if (p.role === 'audio' || drag.kind === 'move' && p.role === 'insert') {
      onChange(p.id, { at: Math.max(0, p.at + delta), ...(target && p.role === 'audio' ? { track: target } : {}) });
    }
  };
  const bars = (placements: Placed[], sound = false) => <div className="native-lane-bars" onPointerDown={(event) => { if (event.target === event.currentTarget && tool === 'snip' && timeline.placements[0]) begin(event, timeline.placements[0], 'move'); }} onPointerMove={move} onPointerUp={end} onClick={(event) => {
    if (event.target !== event.currentTarget) return;
    const box = event.currentTarget.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(timeline.duration, win.start + (event.clientX - box.left) / box.width * duration)));
  }}>
    <span className="native-playhead" style={{ left: `${(time - win.start) / duration * 100}%` }} />
    {range && <span className="native-range" style={{ left: `${(range.from - win.start) / duration * 100}%`, width: `${(range.to - range.from) / duration * 100}%` }} />}
    {sound && overload.filter((span) => placements.some((p) => p.role !== 'gap' && !p.mute && !media.tracks?.find((track) => track.id === p.track)?.mute && (media.tracks?.find((track) => track.id === p.track)?.gain ?? 1) > 0 && p.at < span.end && p.at + p.duration > span.start && (!span.placements || span.placements.includes(p.id)))).map((span) => <span key={span.start} className="native-overload" aria-label={`Mix overload at ${span.start.toFixed(2)} seconds`} style={{ left: `${(span.start - win.start) / duration * 100}%`, width: `${(span.end - span.start) / duration * 100}%` }} />)}
    {placements.map((placement) => {
      const source = placement.role === 'gap' ? undefined : media.sources.find((item) => item.id === placement.source);
      const label = source?.name ?? source?.path.split('/').at(-1) ?? 'Gap';
      const wave = placement.role !== 'gap' ? waveforms[placement.source] : undefined;
      const volume = placement.role !== 'gap' ? (placement.volume ?? []).map((point, index) => volumeDraft?.id === placement.id && volumeDraft.index === index ? { at: volumeDraft.at, gain: volumeDraft.gain } : point) : [];
      const displayedAt = placement.attachmentBroken ? Math.max(win.start, Math.min(placement.at, win.start + win.length - Math.min(BROKEN_CLIP_SPAN, win.length))) : placement.at;
      const displayedDuration = placement.attachmentBroken ? Math.min(BROKEN_CLIP_SPAN, win.length) : placement.duration;
      const speechState = placement.role !== 'gap' && (placement.speech ?? placement.role === 'main') ? speech[placement.source] : undefined;
      const failedKind = placement.role === 'gap' ? null : sound && soundErrors[placement.source] ? 'sound' : sound && speechState?.state === 'failed' ? 'speech' : !sound && pictureErrors[placement.source] ? 'picture' : null;
      return <Fragment key={placement.id}><button type="button" className={`native-clip${sound ? ' native-sound' : ''}${placement.attachmentBroken ? ' editorial-broken' : ''}`} data-placement={placement.id} data-verify-broken-placement={String(!!placement.attachmentBroken)} aria-pressed={selected === placement.id} aria-label={`${label}, ${placement.role}, ${placement.at.toFixed(2)} to ${(placement.at + placement.duration).toFixed(2)} seconds`} style={{ left: `${(displayedAt - win.start + (gesture.current?.placement.id === placement.id && gesture.current.kind === 'move' ? offset : 0)) / duration * 100}%`, width: `${displayedDuration / duration * 100}%` }} onClick={() => onSelect(placement.id, false)} onDoubleClick={() => onSelect(placement.id, true)} onContextMenu={(event) => { event.preventDefault(); onMenu(placement.id, event.clientX, event.clientY); }} onKeyDown={(event) => onKey(event, placement)} onPointerDown={(event) => begin(event, placement, sound ? 'sound' : 'move')} onPointerMove={move} onPointerUp={end} onPointerCancel={() => { gesture.current = null; setOffset(0); setVolumeDraft(null); }}>
        {!placement.attachmentBroken && sound && wave?.state === 'ready' && placement.role !== 'gap' && <svg className="native-waveform" viewBox="0 0 1000 32" preserveAspectRatio="none" aria-label={`Source waveform for ${placement.id}`} role="img"><polyline points={Array.from({ length: 128 }, (_, index) => {
          const local = placement.duration * index / 128;
          const sourceTime = placement.in + (placement.loop ? local % (placement.out - placement.in) : local);
          const peak = wave.peaks[Math.min(wave.peaks.length - 1, Math.floor(sourceTime / wave.duration * wave.peaks.length))] ?? 0;
          return `${index * 1000 / 127},${16 + (index % 2 ? -1 : 1) * Math.min(1, peak) * 15}`;
        }).join(' ')} /></svg>}
        <span>{label}{placement.attachmentBroken ? ' · Reattach' : ''}</span>{placement.role === 'insert' && source?.audio !== false && source?.kind === 'video' && <span className="native-insert-sound" aria-label={placement.mute ?? true ? 'Insert sound muted' : 'Insert sound on'} onPointerDown={(event) => begin(event, placement, 'sound')}>{placement.mute ?? true ? 'Muted' : 'Sound'}</span>}
        {editable && !placement.attachmentBroken && (['start', 'end'] as const).map((edge) => <span key={edge} className={`native-trim native-trim-${edge}`} aria-label={`Trim ${edge} ${placement.id}`} onPointerDown={(event) => begin(event, placement, edge)} />)}
        {sound && !placement.attachmentBroken && placement.role !== 'gap' && <svg className="native-volume" viewBox="0 0 100 100" preserveAspectRatio="none" onPointerDown={(event) => begin(event, placement, 'sound')} onDoubleClick={(event) => {
          event.stopPropagation();
          if (!editable || tool !== 'select') return;
          const box = event.currentTarget.getBoundingClientRect();
          const at = Math.max(0, Math.min(placement.duration, (event.clientX - box.left) / box.width * placement.duration));
          if (volume.some((point) => Math.abs(point.at - at) < POINT_SEPARATION)) return;
          onChange(placement.id, { volume: [...volume, { at, gain: Math.max(0, Math.min(MAX_GAIN, (1 - (event.clientY - box.top) / box.height) * MAX_GAIN)) }].sort((a, b) => a.at - b.at) });
        }}><polyline points={[{ at: 0, gain: placement.gain ?? 1 }, ...volume, { at: placement.duration, gain: volume.at(-1)?.gain ?? placement.gain ?? 1 }].map((point) => `${point.at / placement.duration * 100},${100 - point.gain / MAX_GAIN * 100}`).join(' ')} />{volume.map((point, index) => <circle key={index} cx={point.at / placement.duration * 100} cy={100 - point.gain / MAX_GAIN * 100} r="2" role="slider" tabIndex={editable ? 0 : undefined} aria-label={`Volume point ${index + 1} for ${placement.id}`} aria-valuemin={0} aria-valuemax={MAX_GAIN} aria-valuenow={point.gain} aria-valuetext={`${point.gain.toFixed(2)} at ${point.at.toFixed(2)} seconds`} aria-disabled={!editable} onPointerDown={(event) => begin(event, placement, 'volume', index)} onDoubleClick={(event) => event.stopPropagation()} onKeyDown={(event) => {
          const action = actionForKey(keys, keyChord(event.nativeEvent));
          if (!editable || !action || !['left', 'right', 'up', 'down', 'remove'].includes(action)) return;
          event.preventDefault(); event.stopPropagation();
          if (action === 'remove') { onChange(placement.id, { volume: volume.filter((_, i) => i !== index) }); return; }
          const at = pointAt(placement, index, point.at + (action === 'left' ? -nudge : action === 'right' ? nudge : 0));
          const gain = Math.max(0, Math.min(MAX_GAIN, point.gain + (action === 'down' ? -POINT_GAIN_STEP : action === 'up' ? POINT_GAIN_STEP : 0)));
          onChange(placement.id, { volume: volume.map((was, i) => i === index ? { at, gain } : was) });
        }} />)}</svg>}
        {sound && !placement.attachmentBroken && placement.role !== 'gap' && editable && (['fadeIn', 'fadeOut'] as const).map((edge) => <span key={edge} className="native-fade" aria-label={`${edge === 'fadeIn' ? 'Fade in' : 'Fade out'} ${placement.id}`} style={{ left: `${(edge === 'fadeIn' ? placement[edge] ?? 0 : placement.duration - (placement[edge] ?? 0)) / placement.duration * 100}%` }} onPointerDown={(event) => begin(event, placement, edge)} />)}
      </button>{sound && speechState && ['queued', 'running'].includes(speechState.state) && <span className="native-retry" role="status" style={{ left: `${Math.max(0, (placement.at - win.start) / duration * 100)}%` }}>Transcribing speech…</span>}{placement.role !== 'gap' && placement.at + placement.duration > win.start && placement.at < win.start + win.length && failedKind && <button type="button" className="native-retry" aria-label={`Retry ${failedKind} for ${placement.id}`} title={failedKind === 'speech' && speechState?.state === 'failed' ? speechState.error : sound ? soundErrors[placement.source] : pictureErrors[placement.source]} style={{ left: `${Math.max(0, (placement.at - win.start) / duration * 100)}%` }} onClick={() => onRetry(placement.source, failedKind)}>Retry {failedKind}</button>}</Fragment>;
    })}
  </div>;
  return <section className="native-lanes" aria-label="Media timeline" {...verifyAttrs(selected, timeline.placements.length, win)} onDragOver={(event) => { if (editable && event.dataTransfer.types.includes(MEDIA_DRAG_TYPE)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }} onDrop={(event) => {
    const path = event.dataTransfer.getData(MEDIA_DRAG_TYPE);
    const lane = (event.target as HTMLElement).closest<HTMLElement>('.native-lane');
    if (!editable || !path || !lane || !lane.dataset.track && !['main', 'insert'].includes(lane.dataset.role ?? '')) return;
    event.preventDefault();
    const box = lane.querySelector('.native-lane-bars')!.getBoundingClientRect();
    const at = Math.max(0, Math.min(timeline.duration, win.start + (event.clientX - box.left) / box.width * duration));
    onMediaDrop(path, lane.dataset.track ? 'audio' : lane.dataset.role as 'main' | 'insert', snap ? snapTime(at, snapPoints(timeline, '', time), SNAP_REACH) : at, lane.dataset.track);
  }}>
    {overview}
    <div className="native-lane" data-role="main"><strong>Footage</strong>{bars(timeline.placements.filter((p) => p.role === 'main' || p.role === 'gap'))}</div>
    <div className="native-lane" data-role="insert"><strong>Inserts</strong>{bars(timeline.placements.filter((p) => p.role === 'insert'))}</div>
    {children}
    {tracks.map((track, index) => <div className="native-lane native-track" key={track.id} data-track={track.id}>
      <div className="native-track-header">
        <button type="button" className="native-track-remove" aria-label={`Remove ${track.name} track`} title={timeline.placements.some((p) => p.role !== 'gap' && p.track === track.id) ? 'Move or remove its clips before removing this track.' : 'Remove empty track'} disabled={!editable || timeline.placements.some((p) => p.role !== 'gap' && p.track === track.id)} onClick={() => onRemoveTrack(track.id)}>×</button>
        <input aria-label={`Track name ${track.id}`} defaultValue={track.name} key={track.name} disabled={!editable} onBlur={(event) => { if (event.target.value.trim() && event.target.value !== track.name) onTrack(track.id, { name: event.target.value.trim() }); }} />
        <button type="button" className="native-track-up" aria-label={`Move ${track.name} track up`} disabled={!editable || index === 0} onClick={() => onReorderTrack(track.id, index - 1)}>↑</button>
        <div><button type="button" aria-label={`Mute ${track.name}`} aria-pressed={track.mute} disabled={!editable} onClick={() => onTrack(track.id, { mute: !track.mute })}>M</button><button type="button" aria-label={`Solo ${track.name}`} aria-pressed={solo.includes(track.id)} onClick={() => onSolo(track.id)}>S</button><input aria-label={`Volume ${track.name}`} type="range" min="0" max="2" step="0.01" defaultValue={track.gain} key={track.gain} disabled={!editable} onPointerUp={(event) => { const gain = Number(event.currentTarget.value); if (gain !== track.gain) onTrack(track.id, { gain }); }} onKeyUp={(event) => { const gain = Number(event.currentTarget.value); if (gain !== track.gain) onTrack(track.id, { gain }); }} /></div>
      </div>
      {bars(timeline.placements.filter((p) => p.role !== 'gap' && p.track === track.id), true)}
    </div>)}
    <button type="button" className="rv-tool" disabled={!editable} onClick={onAddTrack}>Add track</button>
  </section>;
}
