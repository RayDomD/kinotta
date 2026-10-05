import { useState } from 'react';
import { importVideo } from './api/index.ts';

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
    setStatus('Copying into footage/…');
    importVideo(file).then(
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
        <strong>Drop a video here</strong>
        <span>It is copied into this project's footage/ folder, then transcribed on this machine.</span>
        <span className="rv-choose">Choose a file…</span>
      </label>
      {status !== null && <p className="rv-busy" role="status">{status}</p>}
      {problem !== null && <p className="rv-problem" role="alert">{problem}</p>}
    </div>
  );
}
