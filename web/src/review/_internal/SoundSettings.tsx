import { useState } from 'react';
import { DUCK_DEFAULTS, MAX_DUCK_DB, MAX_DUCK_RAMP, MIN_DUCK_RAMP, duckSpeechSpans, duckVolume } from '../../../../server/core/model.ts';
import type { DuckSettings, MediaPlan, MediaTimeline, SourcePlacement, SpeechSpan } from '../../../../server/core/model.ts';
import type { EditsState } from './useEdits.ts';

interface Props {
  placement: (SourcePlacement & { at: number; duration: number; attachmentBroken?: boolean }) | undefined;
  media: MediaPlan;
  timeline: MediaTimeline;
  editable: boolean;
  edits: EditsState | undefined;
  change: (id: string, changes: Partial<SourcePlacement>) => void;
}
function verifyAttrs(p: Props['placement'], ready: boolean, busy: boolean, error: string | null) {
  return { 'data-verify-unit': 'SoundSettings', 'data-verify-count': p ? 1 : 0, 'data-verify-empty': String(!p),
    'data-verify-placement': p?.id ?? '', 'data-verify-point-count': p?.volume?.length ?? 0,
    'data-verify-status': error ? 'error' : busy ? 'busy' : ready ? 'ready' : p ? 'unavailable' : 'empty',
    'data-verify-loading': String(busy), 'data-verify-error': String(!!error), 'data-verify-can-apply': String(ready && !busy) };
}

/** Detailed sound controls in the existing independently scrolling right sidebar. */
export function SoundSettings({ placement: p, media, timeline, editable, edits, change }: Props) {
  const tracks = media.tracks?.filter((track) => track.id !== p?.track && !track.mute && media.placements.some((use) => use.role !== 'gap' && use.track === track.id && !use.mute && (use.speech ?? use.role === 'main'))) ?? [];
  const [chosenTrack, setTrack] = useState('');
  const speechTrack = tracks.some((track) => track.id === chosenTrack) ? chosenTrack : tracks[0]?.id ?? '';
  const [settings, setSettings] = useState<DuckSettings>(DUCK_DEFAULTS);
  let spans: SpeechSpan[] = [];
  let points: NonNullable<SourcePlacement['volume']> = [];
  let invalid: string | null = null;
  if (p?.role === 'audio' && speechTrack) {
    try {
      spans = duckSpeechSpans(media, p.id, speechTrack, timeline.duration);
      points = duckVolume(spans, p.duration, p.gain ?? 1, settings);
    } catch (failure) { invalid = failure instanceof Error ? failure.message : 'Ducking could not be prepared.'; }
  }
  const overlapping = !!p && spans.some((span) => span.end > 0 && span.start < p.duration && span.end > span.start);
  const error = invalid ?? edits?.error ?? null;
  const ready = editable && p?.role === 'audio' && !p.attachmentBroken && overlapping && !invalid;
  const source = p && media.sources.find((s) => s.id === p.source);
  const sound = !!source && source.kind !== 'image' && source.audio !== false;
  const curve = p && points.map((point) => `${point.at / p.duration * 300},${48 - point.gain / Math.max(p.gain ?? 1, 0.001) * 38}`).join(' ');
  return <section className="mv-placements editor-clip-settings" aria-label="Sound settings" {...verifyAttrs(p, ready, edits?.busy ?? false, error)}>
    {!p ? <p className="meta">Select an audio clip to adjust its sound.</p> : <div className="mv-placement">
      <div className="mv-placement-head"><strong>{source?.name ?? source?.path.split('/').at(-1)}</strong><span>{p.at.toFixed(2)}–{(p.at + p.duration).toFixed(2)}s</span></div>
      {!sound ? <p className="meta">This source has no sound.</p> : <>
        <div className="mv-controls" key={`${p.id}:${p.gain}:${p.fadeIn}:${p.fadeOut}`}>
          <h3>Clip volume</h3>
          <label>Volume <input aria-label={`Clip level for ${p.id}`} type="number" min="0" max="2" step="0.1" defaultValue={p.gain ?? 1} disabled={!editable} onBlur={(event) => { const gain = Number(event.target.value); if (gain !== (p.gain ?? 1)) change(p.id, { gain }); }} /></label>
          {(['fadeIn', 'fadeOut'] as const).map((field) => <label key={field}>{field === 'fadeIn' ? 'Fade in' : 'Fade out'} (s) <input type="number" min="0" step="0.1" defaultValue={p[field] ?? 0} disabled={!editable} onBlur={(event) => { const value = Number(event.target.value); if (value !== (p[field] ?? 0)) change(p.id, { [field]: value }); }} /></label>)}
        </div>
        {p.role === 'audio' && <div className="mv-controls">
          <h3>Lower music under speech</h3>
          <span className="meta">This clip only. Uses transcript timing to create editable volume points.</span>
          <label>Speech track <select value={speechTrack} disabled={!editable || !tracks.length} onChange={(event) => setTrack(event.target.value)} aria-label="Speech track"><option value="" disabled>Choose a speech track</option>{tracks.map((track) => <option key={track.id} value={track.id}>{track.name}</option>)}</select></label>
          {(['amount', 'attack', 'release'] as const).map((field) => {
            const labels = { amount: 'Amount in dB', attack: 'Lower before speech', release: 'Recover after speech' };
            return <label key={field}>{labels[field]}{field === 'amount' ? ' lower' : ' (s)'} <input aria-label={labels[field]} type="number" min={field === 'amount' ? 0 : MIN_DUCK_RAMP} max={field === 'amount' ? MAX_DUCK_DB : MAX_DUCK_RAMP} step={field === 'amount' ? 1 : 0.05} value={Number.isFinite(settings[field]) ? settings[field] : ''} disabled={!editable} onChange={(event) => setSettings({ ...settings, [field]: event.target.value === '' ? NaN : Number(event.target.value) })} /></label>;
          })}
          {curve && <svg className="mv-waveform" viewBox="0 0 300 56" preserveAspectRatio="none" role="img" aria-label="Proposed ducking curve"><polyline points={`0,10 ${curve} 300,${points.at(-1) ? 48 - points.at(-1)!.gain / Math.max(p.gain ?? 1, 0.001) * 38 : 10}`} /></svg>}
          {!speechTrack && <p className="meta">Choose speech for captions on a separate track first.</p>}
          {speechTrack && !overlapping && <p className="meta">No overlapping transcribed speech on this track. Transcribe the speech clip or choose another track.</p>}
          <p className="meta">Applying replaces this clip’s volume points. Undo restores them. Drag the resulting points on the timeline to refine them.</p>
          {error && <p role="alert">{error}</p>}
          <button className="rv-tool" type="button" disabled={!ready || edits?.busy} onClick={() => { if (ready) void edits!.add({ kind: 'placement-duck', placement: p.id, spans, ...settings }); }}>Apply ducking</button>
        </div>}
      </>}
    </div>}
  </section>;
}
