import { useState } from 'react';
import type { MediaEntry, ProjectMediaFile } from '../../api/index.ts';

export const MEDIA_DRAG_TYPE = 'application/x-kinotta-media';
export interface LibraryRow { path: string; name: string; kind: MediaEntry['kind']; entry?: MediaEntry }
interface Props {
  entries: MediaEntry[];
  files: ProjectMediaFile[];
  editable: boolean;
  busy: boolean;
  error: string | null;
  failedImport: { file: File; error: string } | null;
  preview: string | null;
  onUpload: (file: File) => Promise<void>;
  onPreview: (row: LibraryRow) => void;
  onAdd: (row: LibraryRow) => void;
  onRetry: () => void;
  onRelink: (id: string, path: string) => void;
}
function verifyAttrs(count: number, kind: string, busy: boolean, error: boolean) {
  return { 'data-verify-unit': 'MediaLibrary', 'data-verify-count': count, 'data-verify-kind': kind, 'data-verify-busy': String(busy), 'data-verify-error': String(error) };
}

/** One path list. Unregistered paths acquire a content identity only on first use. */
export function MediaLibrary({ entries, files, editable, busy, error, failedImport, preview, onUpload, onPreview, onAdd, onRetry, onRelink }: Props) {
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');
  const [relink, setRelink] = useState<Record<string, string>>({});
  const [dropping, setDropping] = useState(false);
  const rows: LibraryRow[] = [...entries.map((entry) => ({ path: entry.path, name: entry.name, kind: entry.kind, entry })), ...files.filter((file) => !entries.some((entry) => entry.path === file.path)).map((file) => ({ path: file.path, name: file.name, kind: file.kind }))];
  const shown = rows.filter((row) => (!kind || row.kind === kind) && `${row.name} ${row.path}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => a.path.localeCompare(b.path));
  return <section className="editor-library" aria-label="Project media library" {...verifyAttrs(shown.length, kind, busy, !!error || !!failedImport)} data-dropping={String(dropping)} onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDropping(true); } }} onDragLeave={() => setDropping(false)} onDrop={(event) => { if (!event.dataTransfer.types.includes('Files')) return; event.preventDefault(); setDropping(false); void (async () => { for (const file of Array.from(event.dataTransfer.files)) await onUpload(file); })(); }}>
    <div className="editor-library-heading"><h2>Media</h2><label className="mv-upload">{busy ? 'Working…' : 'Import'}<input aria-label="Import media" type="file" accept="video/*,image/*,audio/*" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void onUpload(file); event.target.value = ''; }} /></label></div>
    <input className="editor-library-search" aria-label="Search media" type="search" placeholder="Search media" value={search} onChange={(event) => setSearch(event.target.value)} />
    <div className="editor-library-types" role="tablist" aria-label="Media types">{[['', 'All'], ['video', 'Video'], ['image', 'Image'], ['audio', 'Audio']].map(([value, label]) => <button type="button" role="tab" key={value} aria-selected={kind === value} onClick={() => setKind(value!)}>{label}</button>)}</div>
    {error && <p role="alert">{error} <button type="button" onClick={onRetry}>Retry library</button></p>}
    {failedImport && <p role="alert">{failedImport.file.name}: {failedImport.error} <button type="button" disabled={busy} onClick={() => void onUpload(failedImport.file)}>Retry import</button></p>}
    {shown.length === 0 && <p className="meta">No matching media.</p>}
    <ul>{shown.map((row) => {
      const available = !row.entry || row.entry.state === 'ready';
      return <li key={`${row.path}:${row.entry?.id ?? 'file'}`} data-media-path={row.path} draggable={editable && available && !busy} onDragStart={(event) => { event.dataTransfer.setData(MEDIA_DRAG_TYPE, row.path); event.dataTransfer.effectAllowed = 'copy'; }}>
        <button type="button" className="editor-media-preview" disabled={!available || busy} aria-label={`Preview ${row.path}`} aria-pressed={preview === row.path} onClick={() => onPreview(row)}><strong>{row.name}</strong><span>{row.path}</span></button>
        <button type="button" className="editor-media-add" aria-label={`Add ${row.path} at playhead`} disabled={!editable || !available || busy} onClick={() => onAdd(row)}>+</button>
        {!available && row.entry && <div className="editor-media-problem"><span>{row.entry.state === 'missing' ? 'File missing' : 'File changed'}</span><button type="button" onClick={onRetry}>Retry</button><select aria-label={`Relink ${row.path}`} value={relink[row.entry.id] ?? ''} onChange={(event) => setRelink({ ...relink, [row.entry!.id]: event.target.value })}><option value="">Relink to…</option>{files.filter((file) => file.kind === row.kind).map((file) => <option key={file.path} value={file.path}>{file.path}</option>)}</select><button type="button" disabled={busy || !relink[row.entry.id]} onClick={() => onRelink(row.entry!.id, relink[row.entry!.id]!)}>Relink</button></div>}
      </li>;
    })}</ul>
  </section>;
}
