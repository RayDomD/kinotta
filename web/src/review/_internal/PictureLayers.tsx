import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import type { MediaSource, MediaTimeline, PictureRegion } from '../../../../server/core/model.ts';

type Picture = MediaTimeline['placements'][number];
const FULL: PictureRegion = { x: 0, y: 0, width: 1, height: 1 };
/** Ignore drift within one preview frame. */
const DRIFT = 1 / 30;
/** Seek only when rate correction would leave picture visibly out of sync. */
const SEEK_DRIFT = 0.25;
/** Paused and preloaded pictures must land within half a preview frame. */
const FRAME_DRIFT = 1 / 60;
/** Keep picture speed changes subtle while catching the shared clock. */
const RATE_LIMIT = 0.1;
/** Pull drift back over roughly half a second rather than seeking. */
const RATE_GAIN = 2;
const MIN_SIZE = 0.01;
const styleOf = (r: PictureRegion): CSSProperties => ({ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.width * 100}%`, height: `${r.height * 100}%` });

/** Returns whether a deliberate seek needs a fresh decoded frame. */
export function syncPicture(element: HTMLVideoElement, target: number, playing: boolean, ready: boolean) {
  const drift = target - element.currentTime;
  if (!playing) element.pause();
  const threshold = !playing ? FRAME_DRIFT : element.paused ? DRIFT : SEEK_DRIFT;
  const seek = (!playing || element.paused || ready) && Math.abs(drift) > threshold;
  element.playbackRate = playing && !element.paused && ready && !seek && Math.abs(drift) > DRIFT
    ? 1 + Math.max(-RATE_LIMIT, Math.min(RATE_LIMIT, drift * RATE_GAIN)) : 1;
  if (seek) element.currentTime = target;
  return seek;
}

function PictureLayer({ p, source, url, time, playing, upcoming, onStatus, onError }: {
  p: Picture; source: MediaSource; url: string; time: number; playing: boolean;
  /** Starts soon: loaded hidden and parked on its first frame, so the cut finds it ready. */
  upcoming: boolean;
  onStatus: (id: string, ready: boolean) => void; onError: (id: string, message: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { if (!upcoming) onStatus(p.id, ready); }, [p.id, ready, upcoming, onStatus]);
  useEffect(() => {
    const element = video.current;
    if (!element || p.role === 'gap') return;
    const target = upcoming ? p.in : p.in + time - p.at;
    if (syncPicture(element, target, playing && !upcoming, ready)) setReady(false);
    if (playing && !upcoming && element.paused) {
      void element.play().catch((failure: unknown) => {
        if (failure instanceof DOMException && failure.name === 'AbortError') return;
        onError(source.id, `The picture for ${source.name ?? source.id} could not be played.`);
      });
    }
  }, [p, source, time, playing, upcoming, ready, onError]);
  useEffect(() => { const element = video.current; return () => { if (element) element.playbackRate = 1; }; }, []);
  if (p.role === 'gap') return null;
  const framing: CSSProperties = { objectFit: p.framing?.mode === 'fit' ? 'contain' : 'cover', objectPosition: `${(p.framing?.x ?? 0.5) * 100}% ${(p.framing?.y ?? 0.5) * 100}%` };
  const decoded = () => { if (video.current && video.current.readyState >= 2 && !video.current.seeking) setReady(true); };
  const fail = () => { setReady(false); onError(source.id, `The picture for ${source.name ?? source.id} could not be loaded.`); };
  return <div className="mv-picture-layer" style={{ ...styleOf(p.region ?? FULL), ...(upcoming ? { visibility: 'hidden' } : {}) }} data-verify-unit={upcoming ? 'UpcomingPictureLayer' : 'PictureLayer'} data-verify-id={p.id} data-verify-ready={String(ready)} data-verify-region={JSON.stringify(p.region ?? FULL)}>
    {source.kind === 'image' ? <img className="mv-picture" style={framing} src={url} alt={source.name ?? source.id} onLoad={() => setReady(true)} onError={fail} />
      : <video className="mv-picture" style={framing} ref={video} src={url} muted playsInline preload="auto" onLoadedData={decoded} onCanPlay={decoded} onPlaying={decoded} onSeeking={() => setReady(false)} onSeeked={decoded} onError={fail} />}
  </div>;
}

function verifyAttrs(count: number, selected: string | undefined) {
  return { 'data-verify-unit': 'PictureLayers', 'data-verify-count': count, 'data-verify-empty': String(count === 0), 'data-verify-selected': selected ?? '' };
}

/** Each visible occurrence owns its picture clock, including repeated uses of one source. */
export function PictureLayers({ pictures, upcoming = [], sources, time, playing, sourceUrl, attempts, onStatus, onError, selected, onRegion }: {
  pictures: Picture[];
  /** Pictures that start soon, loaded ahead of their cut. After the visible ones, so becoming visible moves no element. */
  upcoming?: Picture[];
  sources: MediaSource[]; time: number; playing: boolean;
  sourceUrl: (id: string) => string; attempts: Record<string, number>;
  onStatus: (id: string, ready: boolean) => void; onError: (id: string, message: string) => void;
  selected?: string; onRegion?: (id: string, region: PictureRegion) => void;
}) {
  const [draft, setDraft] = useState<{ id: string; region: PictureRegion } | null>(null);
  const cancelDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelDrag.current?.(), []);
  const chosen = pictures.find((p) => p.id === selected);
  const region = draft && draft.id === selected ? draft.region : chosen && chosen.role !== 'gap' ? chosen.region ?? FULL : FULL;
  const start = (event: PointerEvent<HTMLButtonElement>, resize: boolean) => {
    if (!chosen || !onRegion) return;
    cancelDrag.current?.();
    event.preventDefault(); event.stopPropagation();
    const frame = event.currentTarget.closest('.rv-frame')!.getBoundingClientRect();
    const origin = region;
    const x = event.clientX; const y = event.clientY;
    let next = origin;
    const move = (e: globalThis.PointerEvent) => {
      const dx = (e.clientX - x) / frame.width; const dy = (e.clientY - y) / frame.height;
      next = resize ? { ...origin, width: Math.min(1 - origin.x, Math.max(MIN_SIZE, origin.width + dx)), height: Math.min(1 - origin.y, Math.max(MIN_SIZE, origin.height + dy)) }
        : { ...origin, x: Math.max(0, Math.min(1 - origin.width, origin.x + dx)), y: Math.max(0, Math.min(1 - origin.height, origin.y + dy)) };
      setDraft({ id: chosen.id, region: next });
    };
    const finish = () => { cleanup(); setDraft(null); if (next !== origin) onRegion(chosen.id, next); };
    const cancel = () => { cleanup(); setDraft(null); };
    const cleanup = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', finish); window.removeEventListener('pointercancel', cancel); cancelDrag.current = null; };
    cancelDrag.current = cleanup;
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', finish, { once: true }); window.addEventListener('pointercancel', cancel, { once: true });
  };
  return <div className="mv-picture-layers" {...verifyAttrs(pictures.length, selected)}>
    {[...pictures.map((p) => [p, false] as const), ...upcoming.map((p) => [p, true] as const)].map(([p, soon]) => { if (p.role === 'gap') return null; const source = sources.find((s) => s.id === p.source)!; return <PictureLayer key={`${p.id}:${attempts[source.id] ?? 0}`} p={draft?.id === p.id ? { ...p, region: draft.region } : p} source={source} url={`${sourceUrl(source.id)}${attempts[source.id] ? `?retry=${attempts[source.id]}` : ''}`} time={time} playing={playing} upcoming={soon} onStatus={onStatus} onError={onError} />; })}
    {chosen && onRegion && <div className="mv-region-selection" style={styleOf(region)}>
      <button type="button" className="mv-region-move" aria-label="Move picture region" onPointerDown={(e) => start(e, false)}>Move picture</button>
      <button type="button" className="mv-region-resize" aria-label="Resize picture region" onPointerDown={(e) => start(e, true)} />
    </div>}
  </div>;
}
