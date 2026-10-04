import type { ReactNode, RefObject } from 'react';
import { PagePlayer } from '../../stage/index.ts';
import type { CaptionPhrase } from '../../stage/index.ts';
import { formatClock } from '../../timecode.ts';
import { formatTransport } from './clock.ts';
import type { TimeWindow } from './timeline.ts';

export interface PlayerProps {
  title: string;
  /** The footage to play under the page, when the reel has footage. */
  footageSrc: string | undefined;
  video: RefObject<HTMLVideoElement | null>;
  /** The version page to play over it, when the reel has a version. */
  pageUrl: string | undefined;
  /** Why nothing can play, shown in the frame. */
  problem: string | null;
  time: number;
  /** The second of the saved version's page to show: the page is the saved version's, while `time` is the edited reel's. */
  pageTime: number;
  total: number;
  playing: boolean;
  win: TimeWindow;
  /** The editing tools, between the timecode and the zoom. Absent when the reel cannot be edited. */
  tools?: ReactNode;
  onToggle(): void;
  onZoom(factor: number): void;
  onPhrases(phrases: CaptionPhrase[]): void;
  onVideoMetadata(duration: number): void;
  onVideoError(): void;
}

const ZOOM_IN = 0.5;
const ZOOM_OUT = 2;

function PlayMark({ playing }: { playing: boolean }) {
  return (
    <svg width="30" height="30" viewBox="0 0 28 28" aria-hidden="true">
      <path d="M14 3l9.5 5.5v11L14 25 4.5 19.5v-11z" fill="var(--ink)" />
      {playing ? <path d="M11 9.5h2.2v9H11zM14.8 9.5H17v9h-2.2z" fill="var(--ground)" /> : <path d="M11.5 9.8l6 4.2-6 4.2z" fill="var(--ground)" />}
    </svg>
  );
}

/** The Gate well: the reel's frame (footage under the version page) and the transport under it. */
export function Player(props: PlayerProps) {
  const { title, footageSrc, video, pageUrl, problem, time, pageTime, total, playing, win, tools, onToggle, onZoom, onPhrases, onVideoMetadata, onVideoError } = props;
  return (
    <div className="well rv-well">
      <div className="rv-frame" aria-label={`${title} frame`}>
        {footageSrc !== undefined && (
          <video
            ref={video}
            className="rv-video"
            src={footageSrc}
            aria-label={`${title} footage`}
            preload="auto"
            playsInline
            tabIndex={-1}
            onLoadedMetadata={(e) => onVideoMetadata(e.currentTarget.duration)}
            onError={onVideoError}
          />
        )}
        {pageUrl !== undefined && <PagePlayer className="rv-page" pageUrl={pageUrl} time={pageTime} title={`${title} page`} onPhrases={onPhrases} />}
        {problem !== null && <div className="rv-problem" role="status">{problem}</div>}
      </div>
      <div className="rv-transport">
        <button type="button" className="rv-play" aria-label={playing ? 'Pause' : 'Play'} onClick={onToggle}>
          <PlayMark playing={playing} />
        </button>
        <div className="rv-tc" aria-label="Timecode">
          {formatTransport(time)} <span>{`/ ${formatTransport(total)}`}</span>
        </div>
        {tools}
        <div className="rv-zoom">
          Showing <b>{`${formatClock(win.start)} to ${formatClock(win.start + win.length)}`}</b>
          <button type="button" className="rv-tool" aria-label="Zoom out" disabled={win.length >= total} onClick={() => onZoom(ZOOM_OUT)}>−</button>
          <button type="button" className="rv-tool" aria-label="Zoom in" onClick={() => onZoom(ZOOM_IN)}>+</button>
        </div>
      </div>
    </div>
  );
}
