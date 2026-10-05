import { useState } from 'react';
import { importVideo, startReel } from './api/index.ts';

interface DropZoneProps {
  /** Called with the new reel's slug once the dropped video is in footage/ and the reel's first version is built. */
  onStarted(slug: string): void;
}

/** The New reel drop zone: a video dropped or chosen is copied into the project's footage/ folder and a reel starts from it. */
export function DropZone({ onStarted }: DropZoneProps) {
  const [over, setOver] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const busy = status !== null;

  const take = (file: File | undefined): void => {
    if (file === undefined || busy) return;
    setProblem(null);
    setStatus('Copying into footage/…');
    importVideo(file)
      .then(({ path }) => {
        setStatus('Transcribing and building v1…');
        return startReel({ video: path });
      })
      .then(
        ({ slug }) => onStarted(slug),
        (err: unknown) => {
          setStatus(null);
          setProblem(err instanceof Error ? err.message : 'Could not start the reel');
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
