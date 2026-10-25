import { useEffect, useState } from 'react';
import { fetchStyles, listVideos, startReel } from './api/_internal/client.ts';
import type { Style, VideoEntry } from './api/_internal/client.ts';
import { FRAMES, frameOf } from '../../server/core/model.ts';
import { BriefForm } from './BriefReel.tsx';
import { Direction } from './Direction.tsx';
import { DropZone } from './DropZone.tsx';
import { formatClock } from './timecode.ts';

/** "Portrait 9:16 · 1080 × 1920", or nothing when the probe could not read the picture. */
export function videoFrameText(video: Pick<VideoEntry, 'width' | 'height'>): string {
  const frame = frameOf(video.width, video.height);
  return frame ? `${FRAMES.find((f) => f.id === frame)!.label} · ${video.width} × ${video.height}` : '';
}

/** The picked video: its name, length and the frame found in it. */
export function VideoCard({ video, action }: { video: VideoEntry; action?: React.ReactNode }) {
  const frame = frameOf(video.width, video.height);
  return (
    <div className="dx-video">
      <span className={`dx-video-shape ${frame ?? 'landscape'}`} aria-hidden="true" />
      <div className="dx-video-text">
        <b>{video.name}</b>
        <span className="dx-video-meta">
          {frame && <>{videoFrameText(video)} · </>}<span className="num">{formatClock(video.duration)}</span>
          {frame && ' · Frame found in your video'}
        </span>
      </div>
      {action}
    </div>
  );
}

/**
 * Simple mode's Make: drop or pick a video, name the reel, then Auto (build now in your usual style) or Direct
 * (choose the style, fonts and music first). A reel with no footage starts from a short brief.
 */
export function SimpleMake({ onStarted }: { onStarted(slug: string): void }) {
  const [videos, setVideos] = useState<VideoEntry[]>([]);
  const [picked, setPicked] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [usual, setUsual] = useState<Style | null>(null);
  const [directing, setDirecting] = useState(false);
  const [briefing, setBriefing] = useState(false);

  const load = (path?: string) =>
    listVideos().then(
      (found) => {
        setVideos(found);
        if (path) {
          setPicked(path);
          setTitle(found.find((video) => video.path === path)?.suggestedTitle ?? 'My reel');
        }
      },
      (err: unknown) => setError(err instanceof Error ? err.message : 'Could not list videos.'),
    );

  useEffect(() => {
    void load();
    // Auto's style: your default, or the built-in Kinotta picks before you save one.
    void fetchStyles().then(
      (listing) => setUsual(listing.styles.find((style) => style.id === listing.defaultId) ?? null),
      () => setUsual(null),
    );
  }, []);

  const video = videos.find((v) => v.path === picked);

  const usualStyle = (): Promise<Style | null> => usual
    ? Promise.resolve(usual)
    : fetchStyles().then((listing) => listing.styles.find((style) => style.id === listing.defaultId) ?? null);

  const auto = () => {
    if (!picked || busy || !title.trim()) return;
    setBusy(true);
    setError('');
    void usualStyle()
      .then((style) => startReel({ video: picked, title: title.trim(), deadAir: 'normal', ...(style ? { style: { id: style.id } } : {}) }))
      .then(
        ({ slug }) => onStarted(slug),
        (err: unknown) => {
          setError(err instanceof Error ? err.message : 'Could not make the reel. Try again.');
          setBusy(false);
        },
      );
  };

  if (directing && video) {
    return <Direction video={video} title={title.trim() || video.suggestedTitle} onBack={() => setDirecting(false)} onStarted={onStarted} />;
  }

  return (
    <main className="sm-make dx-make">
      <p className="dx-eyebrow">Your next reel starts here</p>
      <h1>Drop a video. We&rsquo;ll find the reel.</h1>
      <p>One video in. A first cut you can make your own.</p>
      <DropZone onImported={(path) => { setError(''); void load(path); }} />
      {videos.length > 0 && (
        <label>
          Or use a video in this project
          <select
            value={picked}
            disabled={busy}
            onChange={(event) => {
              const next = videos.find((v) => v.path === event.target.value);
              setPicked(next?.path ?? '');
              setTitle(next?.suggestedTitle ?? '');
            }}
          >
            <option value="">Choose a video</option>
            {videos.map((v) => (
              <option key={v.path} value={v.path}>{v.path}</option>
            ))}
          </select>
        </label>
      )}

      {video && (
        <div className="dx-make-panel">
          <VideoCard video={video} />
          <label>
            Reel name
            <input required disabled={busy} value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <div className="dx-choices" role="group" aria-label="How to make it">
            <button type="button" className="dx-choice dx-choice-primary" disabled={busy || !title.trim()} onClick={auto}>
              <b>{busy ? 'Making…' : 'Auto'} <span aria-hidden="true">→</span></b>
              <span>We cut it in your usual style. Change anything after.</span>
            </button>
            <button type="button" className="dx-choice" disabled={busy || !title.trim()} onClick={() => setDirecting(true)}>
              <b>Direct</b>
              <span>Choose the style, fonts and music in 5 short steps.</span>
            </button>
          </div>
          <p className="dx-hint">
            {usual
              ? usual.scope === 'builtin'
                ? <>Your usual style: Kinotta&rsquo;s {usual.name}, until you save your own.</>
                : <>Your usual style: {usual.name}.</>
              : 'Your usual style: Kinotta picks one for this video.'}
          </p>
        </div>
      )}

      {!video && (
        briefing
          ? <BriefForm onStarted={onStarted} />
          : <button type="button" className="dx-quiet dx-brief-open" onClick={() => setBriefing(true)}>No footage? Start from a short brief</button>
      )}

      {busy && <p role="status">Starting your reel. The preview opens while the words are prepared.</p>}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
