import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { ApiError } from './api/index.ts';

/** Section memory is shared by all reels in this project, with an in-memory fallback. */
export function RailFold({ project, section, label, summary, children }: { project: string; section: string; label: string; summary: ReactNode; children: ReactNode }) {
  const key = `kinotta-rail:${project}:${section}`;
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(key) === 'true'; } catch { return false; }
  });
  const id = useId();
  return <>
    <button type="button" className="rail-fold" data-rail-fold={section} aria-expanded={open} aria-controls={id} onClick={() => {
      const next = !open;
      setOpen(next);
      try { localStorage.setItem(key, String(next)); } catch { /* Folding still works for this visit. */ }
    }}>
      <span aria-hidden="true">{open ? '\u25be' : '\u25b8'}</span><span className="label">{label}</span>
      {!open && <span className="rail-summary">{summary}</span>}
    </button>
    <div id={id} hidden={!open}>{children}</div>
  </>;
}

export interface DeleteTarget {
  kind: 'reel' | 'version';
  slug: string;
  title: string;
  number?: number;
  trigger: HTMLElement;
}

/** Same focus trap, Escape and direct-scrim dismissal as ShotSheet. */
export function RailDelete({ target, onDelete, onClose }: { target: DeleteTarget; onDelete(): Promise<void>; onClose(deleted?: boolean): void }) {
  const sheet = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const titleId = useId();
  const descriptionId = useId();
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    sheet.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!busyRef.current) close.current();
      } else if (event.key === 'Tab' && sheet.current) {
        const stops = [...sheet.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const first = stops[0];
        const last = stops[stops.length - 1];
        if (!first || !last) { event.preventDefault(); return; }
        const active = document.activeElement;
        if (!sheet.current.contains(active) || active === sheet.current || (event.shiftKey && active === first) || (!event.shiftKey && active === last)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  const reel = target.kind === 'reel';
  return createPortal(<div className="scrim" onClick={(event) => { if (event.target === event.currentTarget && !busyRef.current) onClose(); }}>
    <div ref={sheet} className="sheet rail-delete-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} aria-busy={busy} tabIndex={-1}>
      <h2 id={titleId}>{reel ? `Delete reel "${target.title}"?` : `Delete v${target.number}?`}</h2>
      <p id={descriptionId}>{reel ? 'This removes the reel folder from reels/. Your footage stays where it is.' : 'This removes the saved version. Working never changes.'}</p>
      <ul>{(reel ? ['Reel folder and all versions', 'Comments, notes and state', 'Renders, including Finals in output/', 'Cached copies no other reel uses'] : [`Version folder v${target.number}`, 'Its comments, notes and state', 'Its renders in reels/ and output/']).map((line) => <li key={line}>{line}</li>)}</ul>
      <p className="meta">This can't be undone.</p>
      {error && <p role="alert" className="c-error">{error}</p>}
      <div className="rail-delete-actions">
        <button type="button" className="c-act" disabled={busy} onClick={() => onClose()}>Cancel</button>
        <button type="button" className="btn primary" disabled={busy} onClick={async () => {
          if (busyRef.current) return;
          busyRef.current = true;
          setBusy(true);
          setError('');
          try { await onDelete(); onClose(true); }
          catch (err: unknown) { setError(err instanceof ApiError || err instanceof Error ? err.message : 'Could not reach the server'); }
          finally { busyRef.current = false; setBusy(false); }
        }}>{busy ? 'Deleting...' : reel ? 'Delete reel' : 'Delete version'}</button>
      </div>
    </div>
  </div>, document.body);
}
