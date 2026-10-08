import type { Dispatch, SetStateAction } from 'react';
import type { MediaMoment, MediaPlan, MediaTimeline, SourcePlacement } from '../../../../server/core/model.ts';
import type { MediaEntry, MediaSpeech, MediaWaveform } from '../../api/index.ts';
import type { EditsState } from './useEdits.ts';

type Placed = MediaTimeline['placements'][number];
interface Props {
  placements: Placed[];
  media: MediaPlan;
  timeline: MediaTimeline;
  editable: boolean;
  emptyHint: boolean;
  time: number;
  edits: EditsState | undefined;
  waveforms: Record<string, MediaWaveform>;
  speech: Record<string, MediaSpeech>;
  unspoken: string[];
  library: MediaEntry[];
  moment: MediaMoment | null;
  followable: boolean;
  replacing: Record<string, string>;
  setReplacing: Dispatch<SetStateAction<Record<string, string>>>;
  hasSound: (id: string) => boolean;
  usesSpeech: (p: SourcePlacement) => boolean;
  askSpeech: (id: string) => Promise<void>;
  change: (id: string, changes: Partial<SourcePlacement>) => void;
  splittable: (p: Placed) => boolean;
  split: (p: Placed) => void;
  duplicate: (p: Placed) => void;
  replace: (p: Placed, entry: MediaEntry) => void;
}
function verifyAttrs(count: number, editable: boolean) {
  return { 'data-verify-unit': 'ClipSettings', 'data-verify-count': count, 'data-verify-empty': String(count === 0), 'data-verify-readonly': String(!editable) };
}
export function ClipSettings({ placements, media, timeline, editable, emptyHint, time, edits, waveforms, speech, unspoken, library, moment, followable, replacing, setReplacing, hasSound, usesSpeech, askSpeech, change, splittable, split, duplicate, replace }: Props) {
  return <section className="mv-placements editor-clip-settings" aria-label="Clip settings" {...verifyAttrs(placements.length, editable)}>
    {placements.length === 0 && emptyHint && <p className="meta">Double-click a clip to edit its sound, timing, picture, and placement.</p>}
      <ol>{placements.map((p) => { const label = p.role === 'gap' ? 'Gap' : (() => { const source = media.sources.find((s) => s.id === p.source)!; return source.name ?? source.path.split('/').at(-1)!; })(); return <li key={p.id} className="mv-placement"  aria-label={`${label}, ${p.role}, ${p.at.toFixed(2)} to ${(p.at + p.duration).toFixed(2)} seconds`} aria-describedby={editable ? 'mv-placement-keys' : undefined} >
        <div className="mv-placement-head"><strong>{label}</strong><span>{p.role} · {p.at.toFixed(2)}–{(p.at + p.duration).toFixed(2)}s</span></div>
        {p.role !== 'gap' && waveforms[p.source]?.state === 'ready' && <svg className="mv-waveform" viewBox="0 0 1000 32" preserveAspectRatio="none" role="img" aria-label={`Source waveform for ${p.id}`}><polyline points={Array.from({ length: 256 }, (_, index) => {
          const local = p.duration * index / 256;
          const at = p.in + (p.loop ? local % (p.out - p.in) : local);
          const wave = waveforms[p.source]!;
          const peak = wave.peaks[Math.min(wave.peaks.length - 1, Math.floor(at / wave.duration * wave.peaks.length))] ?? 0;
          return `${index * 1000 / 255},${16 + (index % 2 ? -1 : 1) * Math.min(1, peak) * 15}`;
        }).join(' ')} /></svg>}
        {p.role !== 'gap' && waveforms[p.source]?.state === 'unavailable' && <p className="mv-waveform-note">Waveform unavailable. Playback readiness is checked separately.</p>}
        {p.role !== 'gap' && usesSpeech(p) && unspoken.includes(p.source) && (() => {
          const state = speech[p.source];
          if (state?.state === 'failed') return <p className="mv-waveform-note" role="alert">Speech could not be transcribed. {state.error} <button type="button" className="rv-tool" onClick={() => void askSpeech(p.source)}>Retry speech</button></p>;
          if (state?.state === 'ready') return null;
          return <p className="mv-waveform-note" role="status">Transcribing speech… Captions appear when it finishes. Save waits for it.</p>;
        })()}
        <div className="mv-controls" key={JSON.stringify(p)}><h3>Timing</h3><span className="meta">All times in seconds</span>
          {p.role === 'gap' ? <label>Duration <input type="number" min="0.01" step="0.1" defaultValue={p.duration} disabled={!editable} onBlur={(e) => { if (Number(e.target.value) !== p.duration) change(p.id, { duration: Number(e.target.value) }); }} /></label> : <>
            {media.sources.find((s) => s.id === p.source)!.kind !== 'image' && <>
              <label>In <input type="number" min="0" step="0.01" defaultValue={p.in} disabled={!editable} onBlur={(e) => { if (Number(e.target.value) !== p.in) change(p.id, { in: Number(e.target.value) }); }} /></label>
              <label>Out <input type="number" min="0" step="0.01" defaultValue={p.out} disabled={!editable} onBlur={(e) => { if (Number(e.target.value) !== p.out) change(p.id, { out: Number(e.target.value) }); }} /></label>
            </>}
            {(p.role !== 'main' || media.sources.find((s) => s.id === p.source)!.kind === 'image') && <label>Duration <input type="number" min="0.01" step="0.1" defaultValue={p.duration} disabled={!editable} onBlur={(e) => { if (Number(e.target.value) !== p.duration) change(p.id, { duration: Number(e.target.value) }); }} /></label>}
            {p.role !== 'main' && <label>Start <input type="number" min="0" step="0.01" defaultValue={p.at} disabled={!editable} onBlur={(e) => { if (Number(e.target.value) !== p.at) change(p.id, { at: Number(e.target.value) }); }} /></label>}
            {p.role !== 'main' && <>
              <h3>Placement</h3><span>{p.attachmentBroken ? 'Footage moment removed. Choose a new moment or Stay at time before Save.' : p.attachment ? 'Follows footage' : 'Stays at reel time'}</span>
              <button type="button" className="rv-tool" disabled={!editable || !followable} title={followable ? 'Attach this placement to the footage moment at the playhead' : 'Move the playhead inside a main footage placement first'} onClick={() => { if (moment) change(p.id, { at: time, attachment: { placement: moment.placement, time: moment.time } }); }}>Follow footage at playhead</button>
              {p.attachment && <button type="button" className="rv-tool" disabled={!editable} onClick={() => change(p.id, { attachment: null, at: p.at })}>Stay at time</button>}
            </>}
            {p.role !== 'audio' && media.sources.find((s) => s.id === p.source)!.kind !== 'audio' && <>
              <h3>Picture</h3>
              {p.role === 'insert' && <div className="mv-controls"><button type="button" className="rv-tool" disabled={!editable} onClick={() => void edits!.add({ kind: 'placement-layer', placement: p.id, direction: 'front' })}>Bring to front</button><button type="button" className="rv-tool" disabled={!editable} onClick={() => void edits!.add({ kind: 'placement-layer', placement: p.id, direction: 'back' })}>Send to back</button></div>}
              <label>Framing <select aria-label={`Framing for ${p.id}`} value={p.framing?.mode ?? 'crop'} disabled={!editable} onChange={(e) => change(p.id, { framing: { ...p.framing, mode: e.target.value as 'crop' | 'fit' } })}><option value="crop">Crop to fill</option><option value="fit">Fit whole picture</option></select></label>
              {(['x', 'y'] as const).map((axis) => <label key={axis}>{axis === 'x' ? 'Horizontal' : 'Vertical'} % <input aria-label={`${axis === 'x' ? 'Horizontal' : 'Vertical'} framing for ${p.id}`} type="number" min="0" max="100" step="1" defaultValue={(p.framing?.[axis] ?? 0.5) * 100} disabled={!editable} onBlur={(e) => { const value = Number(e.target.value) / 100; if (value !== (p.framing?.[axis] ?? 0.5)) change(p.id, { framing: { ...p.framing, mode: p.framing?.mode ?? 'crop', [axis]: value } }); }} /></label>)}
            </>}
            {/* Pictures and silent sources have nothing to hear, and a Solo there would silence the real sound. */}
            {hasSound(p.source) && <>
              <h3>Sound</h3><span className="meta">Volume × recorded level. Fades and points in seconds.</span>
              {p.track && <label>Track <select aria-label={`Track for ${p.id}`} value={p.track} disabled={!editable} onChange={(event) => change(p.id, { track: event.target.value })}>{media.tracks?.map((track) => <option key={track.id} value={track.id}>{track.name}</option>)}</select></label>}
              <label>Volume <input aria-label={`Volume for ${p.id}`} type="number" min="0" max="2" step="0.1" defaultValue={p.gain ?? 1} disabled={!editable} onBlur={(e) => { if (Number(e.target.value) !== (p.gain ?? 1)) change(p.id, { gain: Number(e.target.value) }); }} /></label>
              {(['fadeIn', 'fadeOut'] as const).map((field) => <label key={field}>{field === 'fadeIn' ? 'Fade in' : 'Fade out'} <input type="number" min="0" step="0.1" defaultValue={p[field] ?? 0} disabled={!editable} onBlur={(e) => { if (Number(e.target.value) !== (p[field] ?? 0)) change(p.id, { [field]: Number(e.target.value) }); }} /></label>)}
              <label><input type="checkbox" checked={p.mute ?? p.role === 'insert'} disabled={!editable} onChange={(e) => change(p.id, { mute: e.target.checked })} />Mute</label>
              {p.role === 'audio' && <label><input type="checkbox" checked={p.loop ?? false} disabled={!editable} onChange={(e) => change(p.id, { loop: e.target.checked })} />Loop</label>}
              <label><input type="checkbox" checked={p.speech ?? p.role === 'main'} disabled={!editable} onChange={(e) => change(p.id, { speech: e.target.checked })} />Use speech for captions</label>
              <button className="rv-tool" disabled={!editable || time < p.at || time >= p.at + p.duration} onClick={() => {
                const at = Math.round((time - p.at) * 100) / 100;
                change(p.id, { volume: [...(p.volume ?? []).filter((point) => point.at !== at), { at, gain: p.gain ?? 1 }].sort((a, b) => a.at - b.at) });
              }}>Add volume point</button>
              {(p.volume ?? []).map((point, index) => <div className="mv-controls" key={index}>
                <label>Point time <input type="number" min="0" step="0.01" defaultValue={point.at} disabled={!editable} onBlur={(e) => { if (Number(e.target.value) !== point.at) change(p.id, { volume: p.volume!.map((was, i) => i === index ? { ...was, at: Number(e.target.value) } : was).sort((a, b) => a.at - b.at) }); }} /></label>
                <label>Point volume <input type="number" min="0" max="2" step="0.1" defaultValue={point.gain} disabled={!editable} onBlur={(e) => { if (Number(e.target.value) !== point.gain) change(p.id, { volume: p.volume!.map((was, i) => i === index ? { ...was, gain: Number(e.target.value) } : was) }); }} /></label>
                <button className="rv-tool" disabled={!editable} onClick={() => change(p.id, { volume: p.volume!.filter((_, i) => i !== index) })}>Remove point</button>
              </div>)}
            </>}
          </>}
          {timeline.placements.length > 0 && <button className="rv-tool" disabled={!editable} onClick={() => void edits!.add({ kind: 'placement-remove', placement: p.id })}>Remove</button>}
          {media.sequence.includes(p.id) && <button className="rv-tool" disabled={!editable || media.sequence.indexOf(p.id) === 0} onClick={() => void edits!.add({ kind: 'placement-move', placement: p.id, index: media.sequence.indexOf(p.id) - 1 })}>Earlier</button>}
          <button type="button" className="rv-tool" disabled={!editable || !splittable(p)} onClick={() => split(p)}>Split at playhead</button>
          <button type="button" className="rv-tool" disabled={!editable} onClick={() => duplicate(p)}>Duplicate</button>
          {p.role !== 'gap' && (() => {
            const kinds = p.role === 'audio' ? ['audio'] : ['video', 'image'];
            const choices = library.filter((entry) => entry.state === 'ready' && kinds.includes(entry.kind) && entry.id !== p.source);
            const chosen = choices.find((entry) => entry.id === replacing[p.id]);
            return <>
              <label>Replace with <select aria-label={`Replace ${label}`} value={replacing[p.id] ?? ''} disabled={!editable || choices.length === 0} onChange={(e) => setReplacing({ ...replacing, [p.id]: e.target.value })}><option value="">Choose media</option>{choices.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
              <button type="button" className="rv-tool" disabled={!editable || !chosen} onClick={() => chosen && replace(p, chosen)}>Replace</button>
            </>;
          })()}
        </div>
      </li>; })}</ol>
  </section>;
}
