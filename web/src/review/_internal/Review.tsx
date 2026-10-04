import { useEffect, useMemo, useRef, useState } from 'react';
import { footageUrl, versionPageUrl } from '../../api/index.ts';
import type { Comment, ReelSummary, Section, Version } from '../../api/index.ts';
import { Empty } from '../../Empty.tsx';
import type { CaptionPhrase } from '../../stage/index.ts';
import { formatDuration } from '../../timecode.ts';
import { Lanes } from './Lanes.tsx';
import { Player } from './Player.tsx';
import { clipSpans, indexAt } from './model.ts';
import { FRAME_RATE, centerWindow, followWindow, wholeVideo, zoomWindow } from './timeline.ts';
import type { Piece, TimeWindow } from './timeline.ts';
import { usePlayback } from './usePlayback.ts';
import '../review.css';

/** The lanes open on this many seconds of the reel (all of it when it is shorter). */
const ZOOM_DEFAULT_SECONDS = 15;
const TYPING = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
const ZOOM_IN = 0.5;
const ZOOM_OUT = 2;
const NO_PHRASES: CaptionPhrase[] = [];

export interface ReviewProps {
  reel: ReelSummary;
  /** `none`: the reel has no version yet, so its footage plays alone. */
  state: 'loading' | 'error' | 'none' | 'ready';
  /** Why the version could not be read, when `state` is `error`. */
  message?: string;
  version?: Version;
  comments: Comment[];
  /** On a reel with several sections: the one the rail has selected. Choosing another moves the lanes to it. */
  section?: Section | null;
}

/** Keys the player owns. Typing in a field and a focused button's own Space are left alone. */
function ignoresKey(e: KeyboardEvent): boolean {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return true;
  const target = e.target;
  if (!(target instanceof HTMLElement)) return false;
  return TYPING.has(target.tagName) || target.isContentEditable || (e.key === ' ' && ['BUTTON', 'A', 'SUMMARY'].includes(target.tagName));
}

function Playing({ reel, state, version, comments, section = null }: ReviewProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [videoLength, setVideoLength] = useState(0);
  const [videoFailed, setVideoFailed] = useState(false);
  const [phrases, setPhrases] = useState<CaptionPhrase[]>(NO_PHRASES);
  const [raw, setRaw] = useState<TimeWindow>({ start: 0, length: 0 });

  const withFootage = version ? version.footage?.exists === true : state === 'none';
  const hasVideo = withFootage && !videoFailed;
  const total = version ? version.duration : videoLength;
  const pieces: readonly Piece[] | null = useMemo(() => version?.pieces ?? (withFootage && total > 0 ? wholeVideo(total) : null), [version, withFootage, total]);
  const playback = usePlayback(video, pieces ?? wholeVideo(total), total, hasVideo);
  const { time } = playback;

  const clips = useMemo(() => clipSpans(version?.shots ?? []), [version]);
  const overview = useMemo(() => (clips.length > 0 ? clips : (pieces ?? []).map((p) => ({ start: p.at, end: p.at + p.out - p.in }))), [clips, pieces]);
  const words = version?.transcript ?? null;
  const win = useMemo<TimeWindow>(() => ({ start: Math.min(raw.start, Math.max(0, total - raw.length)), length: Math.min(raw.length, total) }), [raw, total]);

  // The lanes open on the first stretch of the reel once its length is known.
  useEffect(() => {
    if (total > 0) setRaw((w) => (w.length === 0 || w.length > total ? { start: 0, length: Math.min(total, ZOOM_DEFAULT_SECONDS) } : w));
  }, [total]);

  // The window follows the playhead, so the zoomed lanes and the overview stay in step with it.
  useEffect(() => {
    if (total > 0) setRaw((w) => (w.length === 0 ? w : followWindow(w, time, total)));
  }, [time, total]);

  // Choosing another section in the rail moves the window to it.
  const shownSection = useRef(section?.id);
  useEffect(() => {
    if (section && section.id !== shownSection.current && total > 0) setRaw((w) => centerWindow(w, section.start + w.length / 2, total));
    shownSection.current = section?.id;
  }, [section, total]);

  const live = useRef({ playback, win, total, time });
  live.current = { playback, win, total, time };
  const zoom = (factor: number): void => {
    const { win: shown, total: length, time: now } = live.current;
    const inside = now >= shown.start && now <= shown.start + shown.length;
    setRaw(zoomWindow(shown, factor, inside ? now : shown.start + shown.length / 2, length));
  };
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (ignoresKey(e)) return;
      const { playback: player, total: length } = live.current;
      const frames = e.shiftKey ? FRAME_RATE : 1;
      if (e.key === ' ') player.toggle();
      else if (e.key === 'ArrowRight') player.step(frames);
      else if (e.key === 'ArrowLeft') player.step(-frames);
      else if (e.key === 'Home') player.seek(0);
      else if (e.key === 'End') player.seek(length);
      else if (e.key === '+' || e.key === '=') zoomRef.current(ZOOM_IN);
      else if (e.key === '-') zoomRef.current(ZOOM_OUT);
      else return;
      e.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const problem =
    withFootage && videoFailed ? 'The footage could not be loaded.' : !withFootage && version !== undefined && version.footage?.exists === false ? 'The footage file is missing.' : null;
  const pageUrl = version ? versionPageUrl(reel.slug, version.number) : undefined;
  const playable = total > 0 && win.length > 0;

  return (
    <main className="main rv-main" aria-label="Review">
      <div className="head">
        <h1>{reel.title}</h1>
        <span className="meta">{version ? `v${version.number} · ${formatDuration(version.duration)}` : 'No version yet. The footage plays alone.'}</span>
      </div>
      <Player
        title={reel.title}
        footageSrc={withFootage ? footageUrl(reel.slug) : undefined}
        video={video}
        pageUrl={pageUrl}
        problem={problem}
        time={time}
        total={total}
        playing={playback.playing}
        win={win}
        onToggle={playback.toggle}
        onZoom={zoom}
        onPhrases={setPhrases}
        onVideoMetadata={setVideoLength}
        onVideoError={() => setVideoFailed(true)}
      />
      {playable && (
        <Lanes
          win={win}
          total={total}
          time={time}
          pieces={withFootage ? pieces : null}
          clips={clips}
          phrases={phrases}
          currentPhrase={indexAt(phrases, time)}
          words={words}
          currentWord={words ? indexAt(words, time) : -1}
          comments={comments}
          overview={overview}
          onWindow={setRaw}
          onScrub={playback.seek}
        />
      )}
    </main>
  );
}

/** The Review tab: the reel in the Gate well, playing, with the lanes under it. */
export function Review(props: ReviewProps) {
  const { state, message, reel } = props;
  if (state === 'loading') return <main className="main" aria-label="Review"><div className="state">Loading…</div></main>;
  if (state === 'error') return <main className="main" aria-label="Review"><Empty>{`Could not read the reel. ${message ?? ''}`.trim()}</Empty></main>;
  // A new reel or version starts from the top, with its own window and its own page.
  return <Playing key={`${reel.slug}/${props.version?.number ?? 'footage'}`} {...props} />;
}
