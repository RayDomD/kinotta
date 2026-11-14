import { useEffect, useRef, useState } from 'react';
import { addMarker, changeMarker, fetchMarkers, removeMarker } from '../../api/index.ts';
import type { TimelineMarker } from '../../api/index.ts';

export function useMarkers(slug: string) {
  const [markers, setMarkers] = useState<TimelineMarker[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const loading = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => { let active = true; loading.current = fetchMarkers(slug).then((value) => { if (active) setMarkers(value); }, (err: Error) => { if (active) setError(err.message); }); return () => { active = false; }; }, [slug]);
  const run = async (action: () => Promise<void>) => {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError(null);
    try { await loading.current; await action(); } catch (err) { setError(err instanceof Error ? err.message : 'The marker could not be saved.'); }
    finally { saving.current = false; setBusy(false); }
  };
  return {
    markers, selected, setSelected, error, busy,
    drop: (time: number) => run(async () => { const marker = await addMarker(slug, { time, name: '' }); setMarkers((list) => [...list, marker]); setSelected(marker.id); }),
    change: (id: string, changes: Partial<{ time: number; name: string }>) => run(async () => { const marker = await changeMarker(slug, id, changes); setMarkers((list) => list.map((item) => item.id === id ? marker : item)); }),
    remove: (id: string) => run(async () => { await removeMarker(slug, id); setMarkers((list) => list.filter((item) => item.id !== id)); setSelected(null); }),
  };
}

export function MarkerPanel({ state }: { state: ReturnType<typeof useMarkers> }) {
  const marker = state.markers.find((item) => item.id === state.selected);
  return <>{state.error && <p role="alert">{state.error}</p>}{marker && <section className="rv-marker-panel" aria-label="Marker settings">
    <strong>Marker</strong><label>Time <input key={`${marker.id}:${marker.time}`} aria-label="Marker time" type="number" min="0" step="0.01" defaultValue={marker.time} disabled={state.busy} onBlur={(event) => { const time = Number(event.target.value); if (Number.isFinite(time) && time >= 0 && time !== marker.time) void state.change(marker.id, { time }); }}/></label>
    <label>Name <input key={`${marker.id}:${marker.name}`} aria-label="Marker name" maxLength={200} defaultValue={marker.name} disabled={state.busy} placeholder="Optional name" onBlur={(event) => { if (event.target.value !== marker.name) void state.change(marker.id, { name: event.target.value }); }}/></label>
    <button type="button" className="rv-tool" disabled={state.busy} onClick={() => void state.remove(marker.id)}>Remove marker</button><button type="button" className="rv-tool" onClick={() => state.setSelected(null)}>Close marker</button>
  </section>}</>;
}
