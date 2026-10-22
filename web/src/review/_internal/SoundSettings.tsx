import { useMemo, useState } from 'react';
import { EQ_DEFAULT_Q, EQ_MAX_DB, EQ_MAX_FILTERS, EQ_MAX_HZ, EQ_MAX_Q, EQ_MIN_HZ, EQ_MIN_Q, EQ_PRESETS, EQ_TYPES, MEDIA_AUDIO_RATE, activeTrackEq, webAudioEqQ, DUCK_DEFAULTS, MAX_DUCK_DB, MAX_DUCK_RAMP, MIN_DUCK_RAMP, duckSpeechSpans, duckVolume } from '../../../../server/core/model.ts';
import type { DuckSettings, MediaPlan, MediaTimeline, SourcePlacement, SpeechSpan } from '../../../../server/core/model.ts';
import type { EditsState } from './useEdits.ts';
import type { BeatGrid } from '../../../../server/core/model.ts';
import { useEditorWorkspace } from './EditorWorkspace.tsx';
import { SoundGenerate } from './SoundGenerate.tsx';
import type { GeneratedAudio } from '../../api/index.ts';

interface Props {
  placement: (SourcePlacement & { at: number; duration: number; attachmentBroken?: boolean }) | undefined;
  media: MediaPlan;
  timeline: MediaTimeline;
  editable: boolean;
  edits: EditsState | undefined;
  change: (id: string, changes: Partial<SourcePlacement>) => void;
  onDetect: (source: string, fresh: boolean) => Promise<BeatGrid>;
  generate: (request: { prompt: string; seconds: number; seed?: number }, signal: AbortSignal) => Promise<GeneratedAudio>;
  /** The track a generated sound is added to: the selected clip's, else Music. */
  generatedTrackName: string;
  onAddGenerated: (sound: GeneratedAudio) => Promise<void>;
}
function verifyAttrs(p: Props['placement'], ready: boolean, busy: boolean, error: string | null) {
  return { 'data-verify-unit': 'SoundSettings', 'data-verify-count': p ? 1 : 0, 'data-verify-empty': String(!p),
    'data-verify-placement': p?.id ?? '', 'data-verify-point-count': p?.volume?.length ?? 0,
    'data-verify-status': error ? 'error' : busy ? 'busy' : ready ? 'ready' : p ? 'unavailable' : 'empty',
    'data-verify-loading': String(busy), 'data-verify-error': String(!!error), 'data-verify-can-apply': String(ready && !busy) };
}

/** Detailed sound controls in the existing independently scrolling right sidebar. */
export function SoundSettings({ placement: p, media, timeline, editable, edits, change, onDetect, generate, generatedTrackName, onAddGenerated }: Props) {
  const workspace = useEditorWorkspace();
  const [detecting, setDetecting] = useState(false);
  const [beatError, setBeatError] = useState<string | null>(null);
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
  const error = beatError ?? invalid ?? edits?.error ?? null;
  const ready = editable && !detecting && p?.role === 'audio' && !p.attachmentBroken && overlapping && !invalid;
  const source = p && media.sources.find((s) => s.id === p.source);
  const track = media.tracks?.find((track) => track.id === p?.track);
  const eq = track?.eq ?? [];
  const eqCurve = useMemo(() => {
    const context = new OfflineAudioContext(1, 1, MEDIA_AUDIO_RATE);
    const frequencies = Float32Array.from({ length: 64 }, (_, i) => EQ_MIN_HZ * (EQ_MAX_HZ / EQ_MIN_HZ) ** (i / 63));
    const response = new Float32Array(64).fill(1);
    for (const filter of activeTrackEq(track)) {
      const node = context.createBiquadFilter(); node.type = filter.type; node.frequency.value = filter.frequency;
      node.gain.value = filter.gain ?? 0; node.Q.value = webAudioEqQ(filter);
      const magnitude = new Float32Array(64); node.getFrequencyResponse(frequencies, magnitude, new Float32Array(64));
      magnitude.forEach((value, i) => { response[i] *= value; });
    }
    return Array.from(response, (value, i) => `${i / 63 * 300},${30 - Math.max(-24, Math.min(24, 20 * Math.log10(Math.max(value, 1e-8))))}`).join(' ');
  }, [track]);
  const sound = !!source && source.kind !== 'image' && source.audio !== false;
  const curve = p && points.map((point) => `${point.at / p.duration * 300},${48 - point.gain / Math.max(p.gain ?? 1, 0.001) * 38}`).join(' ');
  return <section className="mv-placements editor-clip-settings" aria-label="Sound settings" {...verifyAttrs(p, ready, detecting, error)} data-verify-eq-count={eq.length} data-verify-eq-bypass={String(track?.eqBypass ?? false)} data-verify-beat-status={beatError ? 'error' : detecting ? 'detecting' : source?.beats ? 'ready' : 'idle'} data-verify-beat-count={source?.beats?.beats.length ?? 0}>
    <SoundGenerate editable={editable && !edits?.busy} targetName={generatedTrackName} generate={generate} onAdd={onAddGenerated} />
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
          {error && !beatError && <p role="alert">{error}</p>}
          <button className="rv-tool" type="button" disabled={!ready} onClick={() => { if (ready) void edits!.add({ kind: 'placement-duck', placement: p.id, spans, ...settings }); }}>Apply ducking</button>
        </div>}
        {track && <div className="mv-controls">
          <h3>Track EQ · {track.name}</h3>
          <span className="meta">Applies to all {media.placements.filter((use) => use.role !== 'gap' && use.track === track.id).length} clips on {track.name}.</span>
          <label>Preset <select aria-label="EQ preset" disabled={!editable} value={Object.entries(EQ_PRESETS).find(([, preset]) => JSON.stringify(preset.filters) === JSON.stringify(eq))?.[0] ?? ''} onChange={(event) => { const preset = EQ_PRESETS[event.target.value]; if (preset) void edits!.add({ kind: 'track-change', track: track.id, changes: { eq: preset.filters, eqBypass: false } }); }}><option value="" disabled>Custom</option>{Object.entries(EQ_PRESETS).map(([id, preset]) => <option value={id} key={id}>{preset.name}</option>)}</select></label>
          <svg className="mv-waveform" viewBox="0 0 300 60" preserveAspectRatio="none" role="img" aria-label="Track EQ response, 20 Hz to 20 kHz, plus or minus 24 dB"><polyline points={eqCurve} /></svg>
          {eq.map((filter, index) => <div className="mv-controls" key={`${index}:${JSON.stringify(filter)}`}>
            <label>Filter {index + 1} <select aria-label={`EQ filter ${index + 1} type`} value={filter.type} disabled={!editable} onChange={(event) => void edits!.add({ kind: 'track-change', track: track.id, changes: { eq: eq.map((was, i) => i === index ? { ...was, type: event.target.value as typeof filter.type } : was) } })}>{EQ_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
            <label><input type="checkbox" aria-label={`EQ filter ${index + 1} enabled`} checked={filter.enabled !== false} disabled={!editable} onChange={(event) => void edits!.add({ kind: 'track-change', track: track.id, changes: { eq: eq.map((was, i) => i === index ? { ...was, enabled: event.target.checked } : was) } })} />On</label>
            {(['frequency', 'gain', 'q'] as const).filter((field) => field === 'frequency' || (field === 'gain' ? !['highpass', 'lowpass'].includes(filter.type) : !['lowshelf', 'highshelf'].includes(filter.type))).map((field) => {
              const value = filter[field] ?? (field === 'q' ? EQ_DEFAULT_Q : 0);
              return <label key={field}>{field === 'frequency' ? 'Frequency (Hz)' : field === 'gain' ? 'Gain (dB)' : 'Q'} <input aria-label={`EQ filter ${index + 1} ${field}`} type="number" min={field === 'frequency' ? EQ_MIN_HZ : field === 'gain' ? -EQ_MAX_DB : EQ_MIN_Q} max={field === 'frequency' ? EQ_MAX_HZ : field === 'gain' ? EQ_MAX_DB : EQ_MAX_Q} step={field === 'frequency' ? 1 : 0.1} defaultValue={value} disabled={!editable} onBlur={(event) => { const next = Number(event.target.value); if (next !== value) void edits!.add({ kind: 'track-change', track: track.id, changes: { eq: eq.map((was, i) => i === index ? { ...was, [field]: next } : was) } }); }} /></label>;
            })}
            <button type="button" className="rv-tool" disabled={!editable} onClick={() => void edits!.add({ kind: 'track-change', track: track.id, changes: { eq: eq.filter((_, i) => i !== index) } })}>Remove filter {index + 1}</button>
          </div>)}
          <button type="button" className="rv-tool" disabled={!editable || eq.length >= EQ_MAX_FILTERS} onClick={() => void edits!.add({ kind: 'track-change', track: track.id, changes: { eq: [...eq, { type: 'peaking', frequency: 1000, gain: 0, q: 1 }] } })}>Add filter</button>
          <label><input type="checkbox" aria-label="Bypass EQ" checked={track.eqBypass ?? false} disabled={!editable} onChange={(event) => void edits!.add({ kind: 'track-change', track: track.id, changes: { eqBypass: event.target.checked } })} />Bypass EQ</label>
          {p.role !== 'audio' && error && <p role="alert">{error}</p>}
        </div>}
        {p.role === 'audio' && <div className="mv-controls">
          <h3>Beats</h3>
          <span className="meta">Source timing shared by every use of this music file. Ticks follow trims and loops.</span>
          {source?.beats && <strong>{source.beats.tempo.toFixed(1)} BPM · {source.beats.beats.length} beats</strong>}
          <button type="button" className="rv-tool" disabled={!editable || edits?.busy || detecting || !!p.attachmentBroken} onClick={async () => {
            setBeatError(null); setDetecting(true);
            try { const beats = await onDetect(p.source, !!source?.beats); await edits!.add({ kind: 'source-beats', source: p.source, beats }); }
            catch (failure) { setBeatError(failure instanceof Error ? failure.message : 'Beat detection failed.'); }
            finally { setDetecting(false); }
          }}>{detecting ? 'Detecting beats…' : source?.beats ? 'Detect again' : 'Detect beats'}</button>
          {(['showBeats', 'emphasizeDownbeats', 'beatSnap'] as const).map((key) => <label key={key}><input type="checkbox" aria-label={{ showBeats: 'Show beat ticks', emphasizeDownbeats: 'Emphasize downbeats', beatSnap: 'Snap edits to beats' }[key]} checked={workspace.settings[key]} onChange={(event) => workspace.setSettings({ ...workspace.settings, [key]: event.target.checked })} />{{ showBeats: 'Show beat ticks', emphasizeDownbeats: 'Emphasize downbeats', beatSnap: 'Snap edits to beats' }[key]}</label>)}
          <p className="meta">Beat snapping also needs the timeline Snap switch. Downbeats are estimated bar accents. Check them against the music before cutting.</p>
          {beatError && <p role="alert">{beatError}</p>}
          {source?.beats && !source.beats.beats.length && <p className="meta">No steady beats detected. Try a music track with a clearer pulse.</p>}
        </div>}
      </>}
    </div>}
  </section>;
}
