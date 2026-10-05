import { useEffect, useState } from 'react';
import { listVideos, startReel } from './api/index.ts';
import type { VideoEntry } from './api/index.ts';
import { BriefForm } from './BriefReel.tsx';
import { DropZone } from './DropZone.tsx';
import { Empty } from './Empty.tsx';
import { MissingTools } from './MissingTools.tsx';
import { formatClock } from './timecode.ts';

/** Codecs browsers cannot play: Start makes an H.264 copy first, which takes a while on a long video. */
const NEEDS_PLAYBACK_COPY = new Set(['hevc', 'prores']);
const BYTES_PER_MB = 1024 * 1024;
const MB_PER_GB = 1024;

const CODEC_NAMES: Record<string, string> = { h264: 'H.264', hevc: 'HEVC', prores: 'ProRes', vp9: 'VP9', av1: 'AV1' };

/** `H.264 · 49 MB`, or `HEVC · an H.264 copy is made for playback · 1.4 GB`. */
function videoMeta(video: VideoEntry): string {
  const codec = CODEC_NAMES[video.codec] ?? video.codec;
  const copy = NEEDS_PLAYBACK_COPY.has(video.codec) ? ' · an H.264 copy is made for playback' : '';
  return `${codec}${copy} · ${formatSize(video.size)}`;
}

/** `38 MB`, `1.4 GB`. */
function formatSize(bytes: number): string {
  const mb = bytes / BYTES_PER_MB;
  return mb >= MB_PER_GB ? `${(mb / MB_PER_GB).toFixed(1)} GB` : `${Math.max(1, Math.round(mb))} MB`;
}

type Videos = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; videos: VideoEntry[] };

interface NewReelProps {
  project: string;
  /** Called with the new reel's slug as soon as it exists; its transcript and v1 follow in the background. */
  onStarted(slug: string): void;
  /** Called with the slug of a reel started from a brief, which waits for its first version. */
  onBriefStarted(slug: string): void;
}

/** The side panel while New reel is open: what follows a start, in place of the comments of the reel left behind. */
export function NewReelSide() {
  return (
    <aside className="comments" aria-label="What happens next">
      <div className="label">What happens next</div>
      <ol className="meta rv-next">
        <li>The video plays at once, and you can cut and snip it.</li>
        <li>Words arrive when transcription finishes on this machine, then captions.</li>
        <li>A video over about three minutes is split into sections at pauses.</li>
        <li>v1 is built when the words are in. Ask your agent for b-roll whenever you like.</li>
      </ol>
    </aside>
  );
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

  // A dropped video joins the list and is picked, so it is named and started like any other.
  const imported = (path: string): void => {
    listVideos().then(
      (videos) => {
        setLoad({ status: 'ready', videos });
        const video = videos.find((v) => v.path === path);
        if (video) pick(video);
        else setProblem(`${path} was copied but is not in the list of videos.`);
      },
      (err: unknown) => setProblem(err instanceof Error ? err.message : 'Could not list the videos'),
    );
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
      <div className="head">
        <h1>Start a reel from a video</h1>
      </div>
      <div className="rv-drop">
        <DropZone onImported={imported} />
        <section className="rv-pick" aria-labelledby="rv-pick-title">
          <h2 id="rv-pick-title">Or use a video already in {project}</h2>
          <p className="meta">Not copied: the reel points at it where it is.</p>
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
                    <span className="m">{videoMeta(video)}</span>
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
              {busy && (
                <span className="rv-busy" role="status">
                  {NEEDS_PLAYBACK_COPY.has(picked.codec) ? 'Making a copy the browser can play, then starting the reel…' : 'Starting the reel…'}
                </span>
              )}
              {problem !== null && <span className="rv-problem" role="alert">{problem}</span>}
            </form>
          )}
          <MissingTools />
        </section>
      </div>
      <BriefForm onStarted={onBriefStarted} />
    </main>
  );
}
