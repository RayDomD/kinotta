import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import type { MediaSource, MediaTimeline, PictureRegion } from '../../../../server/core/model.ts';

type Picture = MediaTimeline['placements'][number];
const FULL: PictureRegion = { x: 0, y: 0, width: 1, height: 1 };
/** Correct beyond half a frame, leaving room for a React clock update before audible drift exceeds a frame. */
const DRIFT = 1 / 60;
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

function PictureLayer({ p, source, url, time, playing, upcoming, visible, retained, idle, onStatus, onError }: {
  p: Picture; source: MediaSource; url: string; time: number; playing: boolean;
  /** Starts soon: loaded hidden and parked on its first frame, so the cut finds it ready. */
  upcoming: boolean; visible: boolean; retained: boolean; idle: boolean;
  onStatus: (id: string, ready: boolean) => void; onError: (id: string, message: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { if (!upcoming && !idle) onStatus(p.id, ready); }, [p.id, ready, upcoming, idle, onStatus]);
  useEffect(() => {
    const element = video.current;
    if (!element || p.role === 'gap') return;
    if (retained) { element.pause(); return; }
    const target = upcoming ? p.in : p.in + time - p.at;
    if (syncPicture(element, target, playing && !upcoming, ready)) setReady(false);
    if (playing && !upcoming && element.paused) {
      void element.play().catch((failure: unknown) => {
        if (failure instanceof DOMException && failure.name === 'AbortError') return;
        onError(source.id, `The picture for ${source.name ?? source.id} could not be played.`);
      });
    }
  }, [p, source, time, playing, upcoming, retained, ready, onError]);
  useEffect(() => { const element = video.current; return () => { if (element) element.playbackRate = 1; }; }, []);
  if (p.role === 'gap') return null;
  const framing: CSSProperties = { objectFit: p.framing?.mode === 'fit' ? 'contain' : 'cover', objectPosition: `${(p.framing?.x ?? 0.5) * 100}% ${(p.framing?.y ?? 0.5) * 100}%` };
  const decoded = () => { if (video.current && video.current.readyState >= 2 && !video.current.seeking) setReady(true); };
  const fail = () => { setReady(false); onError(source.id, `The picture for ${source.name ?? source.id} could not be loaded.`); };
  return <div className="mv-picture-layer" style={{ ...styleOf(p.region ?? FULL), ...(!visible ? { visibility: 'hidden' } : {}) }} data-verify-unit={idle ? 'PooledPictureLayer' : upcoming ? 'UpcomingPictureLayer' : 'PictureLayer'} data-verify-id={p.id} data-verify-ready={String(ready)} data-verify-region={JSON.stringify(p.region ?? FULL)}>
    {source.kind === 'image' ? <img className="mv-picture" style={framing} src={url} alt={source.name ?? source.id} onLoad={() => setReady(true)} onError={fail} />
      : <video className="mv-picture" style={framing} ref={video} src={url} muted playsInline preload="auto" onLoadedData={decoded} onCanPlay={decoded} onPlaying={decoded} onSeeking={() => setReady(false)} onSeeked={decoded} onError={fail} />}
  </div>;
}

function verifyAttrs(count: number, selected: string | undefined) {
  return { 'data-verify-unit': 'PictureLayers', 'data-verify-count': count, 'data-verify-empty': String(count === 0), 'data-verify-selected': selected ?? '' };
}

/** Sources keep their decoder across cuts; simultaneous uses get independent clocks. */
export function PictureLayers({ pictures, upcoming = [], sources, time, playing, sourceUrl, attempts, onStatus, onError, selected, onRegion }: {
  pictures: Picture[];
  /** Pictures that start soon, loaded ahead of their cut. After the visible ones, so becoming visible moves no element. */
  upcoming?: Picture[];
  sources: MediaSource[]; time: number; playing: boolean;
  sourceUrl: (id: string) => string; attempts: Record<string, number>;
  onStatus: (id: string, ready: boolean) => void; onError: (id: string, message: string) => void;
  selected?: string; onRegion?: (id: string, region: PictureRegion) => void;
}) {
  const pool = useRef(new Map<string, Picture>());
  const [decoded, setDecoded] = useState<Record<string, boolean>>({});
  const shown = useRef<Picture[]>([]);
  const complete = pictures.every((p) => decoded[p.id]);
  if (complete) shown.current = pictures;
  const retained = shown.current.filter((p) => p.role !== 'gap' && !pictures.some((next) => next.role !== 'gap' && next.source === p.source));
  const status = useCallback((id: string, ready: boolean) => {
    setDecoded((before) => before[id] === ready ? before : { ...before, [id]: ready });
    onStatus(id, ready);
  }, [onStatus]);
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
  const used = new Set<string>();
  const entries: { key: string; p: Picture; soon: boolean; retained: boolean; idle: boolean; primary: boolean }[] = [];
  for (const [p, soon, keep] of [...retained.map((p) => [p, false, true] as const), ...pictures.map((p) => [p, false, false] as const), ...upcoming.map((p) => [p, true, false] as const)]) {
    if (p.role === 'gap' || !sources.some((source) => source.id === p.source)) continue;
    const primary = !used.has(p.source);
    // A future use of the current source already has a warm decoder; do not seek it away from the picture.
    if (!primary && (soon || keep)) continue;
    if (primary) { used.add(p.source); pool.current.set(p.source, p); }
    entries.push({ key: primary ? `source:${p.source}` : `overlap:${p.source}:${p.id}`, p, soon, retained: keep, idle: false, primary });
  }
  for (const [id, p] of pool.current) {
    if (!sources.some((source) => source.id === id)) { pool.current.delete(id); continue; }
    if (!used.has(id)) entries.push({ key: `source:${id}`, p, soon: false, retained: true, idle: true, primary: true });
  }
  return <div className="mv-picture-layers" {...verifyAttrs(pictures.length, selected)}>
    {entries.map(({ key, p, soon, retained: keep, idle, primary }) => {
      if (p.role === 'gap') return null;
      const source = sources.find((s) => s.id === p.source)!;
      const url = sourceUrl(source.id);
      const retryUrl = attempts[source.id] ? `${url}${url.includes('?') ? '&' : '?'}retry=${attempts[source.id]}` : url;
      const seen = shown.current.some((old) => old.id === p.id || (primary && old.role !== 'gap' && old.source === p.source));
      return <PictureLayer key={`${key}:${attempts[source.id] ?? 0}`} p={draft?.id === p.id ? { ...p, region: draft.region } : p} source={source} url={retryUrl} time={time} playing={playing} upcoming={soon} retained={keep} idle={idle} visible={!idle && !soon && (complete || seen)} onStatus={status} onError={onError} />;
    })}
    {chosen && onRegion && <div className="mv-region-selection" style={styleOf(region)}>
      <button type="button" className="mv-region-move" aria-label="Move picture region" onPointerDown={(e) => start(e, false)}>Move picture</button>
      <button type="button" className="mv-region-resize" aria-label="Resize picture region" onPointerDown={(e) => start(e, true)} />
    </div>}
  </div>;
}
