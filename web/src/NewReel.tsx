import { useEffect, useState } from 'react';
import { listVideos, startReel } from './api/index.ts';
import type { VideoEntry } from './api/index.ts';
import { BriefForm } from './BriefReel.tsx';
import { Empty } from './Empty.tsx';
import { formatClock } from './timecode.ts';

const BYTES_PER_MB = 1024 * 1024;
const MB_PER_GB = 1024;

/** `38 MB`, `1.4 GB`. */
function formatSize(bytes: number): string {
  const mb = bytes / BYTES_PER_MB;
  return mb >= MB_PER_GB ? `${(mb / MB_PER_GB).toFixed(1)} GB` : `${Math.max(1, Math.round(mb))} MB`;
}

type Videos = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; videos: VideoEntry[] };

interface NewReelProps {
  project: string;
  /** Called with the new reel's slug once its first version is built. */
  onStarted(slug: string): void;
  /** Called with the slug of a reel started from a brief, which waits for its first version. */
  onBriefStarted(slug: string): void;
}

/** The New reel screen: the project's videos, and a name for the one picked. The video is used where it is. */
export function NewReel({ project, onStarted, onBriefStarted }: NewReelProps) {
  const [load, setLoad] = useState<Videos>({ status: 'loading' });
  const [picked, setPicked] = useState<VideoEntry | null>(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    listVideos().then(
      (videos) => current && setLoad({ status: 'ready', videos }),
      (err: unknown) => current && setLoad({ status: 'error', message: err instanceof Error ? err.message : 'Could not reach the server' }),
    );
    return () => {
      current = false;
    };
  }, []);

  const pick = (video: VideoEntry): void => {
    setPicked(video);
    setTitle(video.suggestedTitle);
    setProblem(null);
  };

  const start = (): void => {
    if (picked === null || busy) return;
    setBusy(true);
    setProblem(null);
    startReel({ video: picked.path, title }).then(
      ({ slug }) => onStarted(slug),
      (err: unknown) => {
        setBusy(false);
        setProblem(err instanceof Error ? err.message : 'Could not start the reel');
      },
    );
  };

  return (
    <main className="main" aria-label="New reel">
      <section className="rv-pick">
        <h2>New reel</h2>
        <p className="rv-lede">Pick a video in {project}. It stays where it is.</p>
        {load.status === 'loading' && <div className="state">Loading…</div>}
        {load.status === 'error' && <Empty>{`Could not list the videos. ${load.message}`}</Empty>}
        {load.status === 'ready' && load.videos.length === 0 && (
          <Empty>{`No videos in ${project}. Put one in the project folder, then open New reel again.`}</Empty>
        )}
        {load.status === 'ready' && load.videos.length > 0 && (
          <ul aria-label="Videos in the project">
            {load.videos.map((video) => (
              <li key={video.path}>
                <button type="button" aria-pressed={picked?.path === video.path} disabled={busy} onClick={() => pick(video)}>
                  <span className="p">{video.path}</span>
                  <span className="d">{formatClock(video.duration)}</span>
                  <span className="m">{`${video.codec} · ${formatSize(video.size)}`}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {picked !== null && (
          <form
            className="rv-name"
            onSubmit={(event) => {
              event.preventDefault();
              start();
            }}
          >
            <label>
              <span className="label">Reel name</span>
              <input value={title} disabled={busy} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <button type="submit" className="btn" disabled={busy}>Start reel</button>
            {busy && <span className="rv-busy" role="status">Transcribing and building v1…</span>}
            {problem !== null && <span className="rv-problem" role="alert">{problem}</span>}
          </form>
        )}
      </section>
      <BriefForm onStarted={onBriefStarted} />
    </main>
  );
}
