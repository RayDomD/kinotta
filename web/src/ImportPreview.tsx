import { useEffect, useRef } from 'react';
import type { ImportPreview } from './api/index.ts';

/**
 * Before files are copied into footage/ (docs/plans/2026-10-31-import-preview.md, mockup
 * docs/mockups/2026-10-31-import-preview.html): where each one goes, which may already be there, which are refused, and
 * whether the drive has room. Import copies exactly as before; Cancel copies nothing. Working is not touched until Import.
 */

/** Shown only when a drop has something to check (a default the owner can change, recorded in the plan). */
export const needsImportSheet = (preview: ImportPreview): boolean =>
  !preview.enough || preview.items.length > 1 || preview.items.some((item) => item.status !== 'new');

const UNITS = ['bytes', 'KB', 'MB', 'GB', 'TB'];
export function bytes(n: number): string {
  let value = n;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) { value /= 1024; unit += 1; }
  return `${unit === 0 ? value : value < 10 ? value.toFixed(1) : Math.round(value)} ${UNITS[unit]}`;
}

const TAG: Record<string, string> = {
  new: '',
  renamed: 'name taken, renamed',
  'maybe-duplicate': 'maybe already here, reused if the same',
  unsupported: '',
};

interface ImportSheetProps {
  preview: ImportPreview;
  onImport(): void;
  onCancel(): void;
}

export function ImportSheet({ preview, onImport, onCancel }: ImportSheetProps) {
  const cancel = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLElement>(null);
  const taken = preview.items.filter((item) => item.status !== 'unsupported').length;
  // The latest Cancel, so the keys below are set up once and focus is not pulled back on every render.
  const cancelLatest = useRef(onCancel);
  cancelLatest.current = onCancel;
  useEffect(() => {
    cancel.current?.focus();
    const keys = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.preventDefault(); cancelLatest.current(); }
      // Keep Tab inside the sheet while it is open.
      if (event.key === 'Tab' && sheet.current) {
        const stops = [...sheet.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const [first, last] = [stops[0], stops.at(-1)];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  }, []);
  const needed = preview.copyBytes + preview.extraBytes;
  return (
    <div className="import-scrim">
      <section ref={sheet} className="import-sheet" role="dialog" aria-modal="true" aria-labelledby="import-sheet-title">
        <h2 id="import-sheet-title">Import {preview.items.length} {preview.items.length === 1 ? 'file' : 'files'} into footage/</h2>
        <p className="import-sub">Copied, not moved. Your originals stay where they are.</p>
        <table className="import-files">
          <thead><tr><th>File</th><th>Goes to</th><th className="import-size">Size</th></tr></thead>
          <tbody>
            {preview.items.map((item, index) => (
              <tr key={`${index}-${item.name}`} data-status={item.status}>
                <td>
                  {item.name}
                  {item.status === 'unsupported' ? <span className="import-tag">{item.reason}</span>
                    : (TAG[item.status] || item.mayNeedPlaybackCopy) && <span className="import-tag" data-status={item.status}>{TAG[item.status] || 'may get a playback copy'}</span>}
                </td>
                <td className="import-to">{item.destination ?? '—'}</td>
                <td className="import-size num">{item.status === 'unsupported' ? '—' : bytes(item.size)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="import-space">
          <span>Needs about <span className="num">{bytes(needed)}</span> with proxies</span>
          <span><span className="num">{bytes(preview.freeBytes)}</span> free on this drive</span>
        </div>
        {!preview.enough && preview.shortBy !== undefined && (
          <p className="import-short" role="alert">Not enough room: free about <span className="num">{bytes(preview.shortBy)}</span> more, or import fewer files.</p>
        )}
        <div className="import-actions">
          <button ref={cancel} type="button" className="btn quiet" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn" disabled={!preview.enough || taken === 0} onClick={onImport}>
            Import {taken} {taken === 1 ? 'file' : 'files'}
          </button>
        </div>
        <p className="import-note">The estimate includes editing proxies and sound, made after the copy.</p>
      </section>
    </div>
  );
}
