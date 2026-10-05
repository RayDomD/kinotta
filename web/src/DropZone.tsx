import { useState } from 'react';
import { importVideo } from './api/index.ts';

const PERCENT = 100;

interface DropZoneProps {
  /** Called with the video's project path once it is in footage/ (copied, or already there). */
  onImported(path: string): void;
}

/** The New reel drop zone: a video dropped or chosen is copied into the project's footage/ folder, then named like a picked one. */
export function DropZone({ onImported }: DropZoneProps) {
  const [over, setOver] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const busy = status !== null;

  const take = (file: File | undefined): void => {
    if (file === undefined || busy) return;
    setProblem(null);
    setStatus(`Copying ${file.name} into footage/…`);
    // Once every byte is sent, the server still hashes it and makes a playback copy for HEVC or ProRes.
    const report = (sent: number): void =>
      setStatus(sent < 1 ? `Copying ${file.name} into footage/… ${Math.floor(sent * PERCENT)}%` : `Checking ${file.name}…`);
    importVideo(file, report).then(
      ({ path }) => {
        setStatus(null);
        onImported(path);
      },
      (err: unknown) => {
        setStatus(null);
        setProblem(err instanceof Error ? err.message : 'Could not copy the video');
      },
    );
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
          take(event.dataTransfer.files[0]);
        }}
      >
        <input
          type="file"
          accept="video/*,.mkv,.mov,.m4v"
          aria-label="Drop a video"
          disabled={busy}
          onChange={(event) => {
            take(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        <svg width="44" height="44" viewBox="0 0 28 28" aria-hidden="true">
          <path d="M14 3l9.5 5.5v11L14 25 4.5 19.5v-11z" fill="none" stroke="var(--light)" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M14 9v9M10 14l4 4 4-4" fill="none" stroke="var(--ink)" strokeWidth="1.6" />
        </svg>
        <strong>Drop a video here</strong>
        <span className="rv-drop-note">
          It is copied into this project's <b>footage/</b> folder and transcribed on this machine. You can cut while the words come in.
        </span>
        <span className="btn quiet rv-choose">Choose a file…</span>
        <span className="rv-drop-status" role="status">{status}</span>
        {problem !== null && <span className="rv-problem" role="alert">{problem}</span>}
        <span className="terrain" aria-hidden="true" />
      </label>
    </div>
  );
}
