import { useState } from 'react';
import { importVideo } from './api/index.ts';

const PERCENT = 100;
/** The extensions the server takes as videos (server/core/_internal/videos.ts). */
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.m4v', '.mkv', '.webm'];

interface DropZoneProps {
  /** Called with the first video's project path once every dropped video is in footage/ (copied, or already there). */
  onImported(path: string): void;
}

/** One dropped video's progress: a line of the status list. */
interface Row {
  name: string;
  status: string;
  failed?: boolean;
}

const isVideo = (name: string): boolean => !name.startsWith('.') && VIDEO_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));

/** Every file in a dropped folder, subfolders included. `readEntries` answers in batches, so it is read until empty. */
async function filesIn(entry: FileSystemEntry): Promise<File[]> {
  if (entry.name.startsWith('.')) return [];
  if (entry.isFile) return [await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject))];
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const found: File[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) return found;
    for (const child of batch) found.push(...(await filesIn(child)));
  }
}

/** What was dropped: files, and the files inside any folders. Entries are taken before the first await, while the drop's data is still readable. */
async function droppedFiles(data: DataTransfer): Promise<{ files: File[]; folder: string | null }> {
  const entries = [...data.items].map((item) => item.webkitGetAsEntry()).filter((entry): entry is FileSystemEntry => entry !== null);
  if (entries.length === 0) return { files: [...data.files], folder: null };
  const folder = entries.find((entry) => entry.isDirectory)?.name ?? null;
  const files = (await Promise.all(entries.map(filesIn))).flat();
  return { files, folder };
}

/**
 * The New reel drop zone: videos dropped or chosen, singly, several at once or as a folder, are copied into the
 * project's footage/ folder one after another. The first is then picked to be named like any other.
 */
export function DropZone({ onImported }: DropZoneProps) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  const take = async (all: File[], folder: string | null): Promise<void> => {
    if (busy) return;
    const videos = all.filter((file) => isVideo(file.name));
    setRows(videos.map((file) => ({ name: file.name, status: 'waiting' })));
    if (videos.length === 0) {
      setSummary(all.length === 0 ? null : 'No videos there. Kinotta takes .mp4, .mov, .m4v, .mkv and .webm.');
      return;
    }
    setSummary(folder === null ? null : `Found ${videos.length} ${videos.length === 1 ? 'video' : 'videos'} in ${folder}`);
    setBusy(true);
    const update = (index: number, row: Partial<Row>): void => setRows((current) => current.map((r, i) => (i === index ? { ...r, ...row } : r)));
    let first: string | null = null;
    // One upload at a time: the disk is the limit, and the playback copies the server makes run on their own afterwards.
    for (const [index, file] of videos.entries()) {
      // Once every byte is sent, the server still checks it is a video; its playback copy is made in the background.
      const report = (sent: number): void => update(index, { status: sent < 1 ? `${Math.floor(sent * PERCENT)}%` : 'checking…' });
      try {
        const { path, copied } = await importVideo(file, report);
        update(index, { status: copied ? 'in footage/' : 'already in footage/' });
        first ??= path;
      } catch (err: unknown) {
        update(index, { status: err instanceof Error ? err.message : 'Could not copy the video', failed: true });
      }
    }
    setBusy(false);
    if (first !== null) onImported(first);
  };

  return (
    <div className="rv-dropwrap">
      <label
        className="rv-dropzone"
        data-over={over}
        data-busy={busy}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          void droppedFiles(event.dataTransfer).then(({ files, folder }) => take(files, folder));
        }}
      >
        <input
          type="file"
          multiple
          accept="video/*,.mkv,.mov,.m4v"
          aria-label="Drop videos"
          disabled={busy}
          onChange={(event) => {
            void take([...(event.target.files ?? [])], null);
            event.target.value = '';
          }}
        />
        <svg width="44" height="44" viewBox="0 0 28 28" aria-hidden="true">
          <path d="M14 3l9.5 5.5v11L14 25 4.5 19.5v-11z" fill="none" stroke="var(--light)" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M14 9v9M10 14l4 4 4-4" fill="none" stroke="var(--ink)" strokeWidth="1.6" />
        </svg>
        <strong>Drop videos or a folder here</strong>
        <span className="rv-drop-note">
          They are copied into this project's <b>footage/</b> folder and transcribed on this machine. You can cut while the words come in.
        </span>
        <span className="btn quiet rv-choose">Choose files…</span>
        <span className="rv-drop-status" role="status">{summary}</span>
        {rows.length > 0 && (
          <ul className="rv-drop-rows">
            {rows.map((row, index) => (
              <li key={`${index}-${row.name}`} data-failed={row.failed === true}>
                <span>{row.name}</span>
                <span className="num">{row.status}</span>
              </li>
            ))}
          </ul>
        )}
        <span className="terrain" aria-hidden="true" />
      </label>
      <label className="btn quiet rv-choose-folder" data-busy={busy}>
        <input
          type="file"
          // A folder picker: React passes these through untyped.
          {...{ webkitdirectory: '', directory: '' }}
          aria-label="Choose a folder of videos"
          disabled={busy}
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            const folder = files[0]?.webkitRelativePath.split('/')[0] ?? null;
            void take(files.filter((file) => !file.webkitRelativePath.split('/').some((part) => part.startsWith('.'))), folder);
            event.target.value = '';
          }}
        />
        Choose a folder…
      </label>
    </div>
  );
}
