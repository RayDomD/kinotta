import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { DEFAULT_SETTINGS } from './editor-settings.ts';
import type { EditorSettings } from './editor-settings.ts';
import { formatTransport } from './clock.ts';

export interface TransportPin { id: string; time: number; number: number; text: string }
export interface TransportMarker { id: string; time: number; name: string }
export interface TransportProps {
  /** Simple mode keeps playback and timecode; its timeline owns seeking and pins. */
  compact?: boolean;
  time: number; total: number; playing: boolean;
  frameRate?: number; timecode?: EditorSettings['timecode']; keys?: EditorSettings['keys'];
  shots?: readonly number[]; pins?: readonly TransportPin[]; markers?: readonly TransportMarker[];
  disabled?: boolean; children?: ReactNode; focus?: boolean;
  onToggle(): void; onSeek(time: number): void; onFocus?(): void; onMarker?(id?: string): void;
}

export function shotTarget(shots: readonly number[], time: number, direction: -1 | 1, total: number): number {
  const ordered = [...new Set([0, ...shots])].sort((a, b) => a - b);
  return direction === 1 ? ordered.find((at) => at > time + 1e-6) ?? total : ordered.filter((at) => at < time - 1e-6).at(-1) ?? 0;
}

export function Transport({ compact = false, time, total, playing, frameRate = 30, timecode = 'seconds', keys = DEFAULT_SETTINGS.keys, shots = [], pins = [], markers = [], disabled, children, focus, onToggle, onSeek, onFocus, onMarker }: TransportProps) {
  const pending = useRef<number | null>(null);
  const frame = useRef<number | null>(null);
  const dragging = useRef(false);
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);
  const seek = (at: number) => onSeek(Math.max(0, Math.min(total, at)));
  const queue = (at: number) => {
    pending.current = at;
    if (frame.current === null) frame.current = requestAnimationFrame(() => { frame.current = null; if (pending.current !== null) seek(pending.current); pending.current = null; });
  };
  const flush = () => { if (frame.current !== null) cancelAnimationFrame(frame.current); frame.current = null; if (pending.current !== null) seek(pending.current); pending.current = null; dragging.current = false; };
  const tip = (label: string, key: string) => key ? `${label} (${key})` : label;
  return <div className="rv-transport" data-verify-unit="Transport" data-verify-time={time} data-verify-total={total} onKeyDown={(event) => { if (event.key === ' ' && (event.target as HTMLElement).closest('button')) event.stopPropagation(); }}>
    <button type="button" className="rv-play" aria-label={playing ? 'Pause' : 'Play'} title={tip('Play or pause', keys.play)} disabled={disabled || total <= 0} onClick={onToggle}>
      <svg width="30" height="30" viewBox="0 0 28 28" aria-hidden="true"><path d="M14 3l9.5 5.5v11L14 25 4.5 19.5v-11z" fill="var(--ink)"/><path d={playing ? 'M11 9.5h2.2v9H11zM14.8 9.5H17v9h-2.2z' : 'M11.5 9.8l6 4.2-6 4.2z'} fill="var(--ground)"/></svg>
    </button>
    {!compact && <><div className="rv-steps">{([
      ['Previous shot', 'prevShot', '│‹', () => seek(shotTarget(shots, time, -1, total))],
      ['Previous frame', 'left', '‹', () => seek(time - 1 / frameRate)],
      ['Next frame', 'right', '›', () => seek(time + 1 / frameRate)],
      ['Next shot', 'nextShot', '›│', () => seek(shotTarget(shots, time, 1, total))],
    ] as const).map(([label, id, mark, action]) => <button type="button" className="rv-tool" key={id} aria-label={label} title={tip(label, keys[id])} disabled={total <= 0} onClick={action}>{mark}</button>)}</div>
    <label className="mv-clock">Playhead <input aria-label="Playhead" type="number" min="0" max={timecode === 'frames' ? Math.round(total * frameRate) : total} step={timecode === 'frames' ? 1 : 0.01} value={timecode === 'frames' ? Math.round(time * frameRate) : time.toFixed(2)} onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value)) seek(value / (timecode === 'frames' ? frameRate : 1)); }}/></label></>}
    <span className="rv-tc" aria-label="Playback timecode">{timecode === 'frames' ? `${Math.round(time * frameRate)}f / ${Math.round(total * frameRate)}f` : `${formatTransport(time)} / ${formatTransport(total)}`}</span>
    {!compact && <><div className="rv-scrubber">
      <div className="rv-scrub" role="slider" tabIndex={0} aria-label="Scrub reel" aria-valuemin={0} aria-valuemax={total} aria-valuenow={time} aria-valuetext={`${time.toFixed(2)} seconds`} onPointerDown={(event) => { if (event.button !== 0 || total <= 0) return; event.preventDefault(); event.currentTarget.focus(); dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); const box = event.currentTarget.getBoundingClientRect(); queue((event.clientX - box.left) / box.width * total); }} onPointerMove={(event) => { if (!dragging.current) return; const box = event.currentTarget.getBoundingClientRect(); queue((event.clientX - box.left) / box.width * total); }} onPointerUp={flush} onPointerCancel={flush} onLostPointerCapture={flush} onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation(); seek(event.key === 'Home' ? 0 : event.key === 'End' ? total : time + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 1 : 1 / frameRate));
      }}>
        <i className="rv-scrub-line"/><i className="rv-scrub-done" style={{ width: `${total > 0 ? time / total * 100 : 0}%` }}/>
        {shots.filter((at) => at >= 0 && at <= total).map((at, i) => <i key={`${at}:${i}`} className="rv-scrub-tick" style={{ left: `${total > 0 ? at / total * 100 : 0}%` }}/>) }
        <i className="rv-scrub-head" style={{ left: `${total > 0 ? time / total * 100 : 0}%` }}/>
      </div>
      {pins.filter((pin) => pin.time >= 0 && pin.time <= total).map((pin) => <button type="button" key={pin.id} className="rv-scrub-pin" aria-label={`${pin.number}. ${pin.text}`} style={{ left: `${total > 0 ? pin.time / total * 100 : 0}%` }} onClick={() => seek(pin.time)}>{pin.number}</button>)}
      {markers.filter((marker) => marker.time <= total).map((marker) => <button type="button" key={marker.id} className="rv-marker" aria-label={`Marker ${marker.name || marker.time.toFixed(2)}`} style={{ left: `${total > 0 ? marker.time / total * 100 : 0}%` }} onClick={() => { seek(marker.time); onMarker?.(marker.id); }}>◇</button>)}
    </div>
    {onMarker && <button type="button" className="rv-tool" title={tip('Drop marker', keys.marker)} onClick={() => onMarker()}>Marker</button>}
    {onFocus && <button type="button" className="rv-tool" aria-label={focus ? 'Leave focus' : 'Focus picture'} title={tip('Focus picture', keys.focus)} onClick={onFocus}>{focus ? 'Leave focus' : 'Focus'}</button>}
    </>}
    {children}
  </div>;
}
