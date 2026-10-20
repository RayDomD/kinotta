import type { ReactNode, RefObject } from 'react';
import { PagePlayer } from '../../stage/index.ts';
import type { CaptionMove, CaptionPhrase, CaptionShift, CaptionText, CaptionWord, ClipTiming, ElementEditing } from '../../stage/index.ts';
import { formatClock } from '../../timecode.ts';

import type { TimeWindow } from './timeline.ts';
import { Transport } from './Transport.tsx';
import type { TransportProps } from './Transport.tsx';

export interface PlayerProps {
  portrait?: boolean;
  transport: Omit<TransportProps, 'time' | 'total' | 'playing' | 'onToggle'>;
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
  /** Where each caption phrase sits with the unsaved moves applied, previewed in the page. */
  captionShifts?: readonly CaptionShift[] | null;
  /** The caption was dragged or nudged; absent when captions cannot be moved. */
  onCaptionMove?(move: CaptionMove): void | Promise<unknown>;
  /** Element offsets previewed over the page, and the drag that changes them. Absent: the page as built. */
  elements?: ElementEditing;
  /** Clips slid or trimmed before Save (or being dragged), played at their new times. Absent: as built. */
  clipTiming?: ClipTiming | null;
  /** Captions retyped or with words fixed before Save, shown in place of the built words. Absent: as built. */
  captionWords?: readonly (readonly CaptionWord[] | null)[] | null;
  /** A caption was retyped in the frame; absent when captions cannot be edited. */
  onCaptionText?(edit: CaptionText): void | Promise<unknown>;
  onVideoMetadata(duration: number): void;
  onVideoError(): void;
}

const ZOOM_IN = 0.5;
const ZOOM_OUT = 2;

/** The Gate well: the reel's frame (footage under the version page) and the transport under it. */
export function Player(props: PlayerProps) {
  const { title, footageSrc, video, pageUrl, problem, time, pageTime, total, playing, win, tools, onToggle, onZoom, onPhrases, captionShifts, onCaptionMove, elements, clipTiming, captionWords, onCaptionText, onVideoMetadata, onVideoError } = props;
  return (
    <div className="well rv-well">
      <div className="rv-picture-stage">
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
        {pageUrl !== undefined && <PagePlayer portrait={props.portrait} className="rv-page" pageUrl={pageUrl} time={pageTime} title={`${title} page`} onPhrases={onPhrases} captionShifts={captionShifts} onCaptionMove={onCaptionMove} elements={elements} clipTiming={clipTiming} captionWords={captionWords} onCaptionText={onCaptionText} />}
        {problem !== null && <div className="rv-problem" role="status">{problem}</div>}
      </div>
      </div>
      <Transport {...props.transport} time={time} total={total} playing={playing} onToggle={onToggle}>
        {tools}
        <div className="rv-zoom">
          Showing <b>{`${formatClock(win.start)} to ${formatClock(win.start + win.length)}`}</b>
          <button type="button" className="rv-tool" aria-label="Zoom out" disabled={win.length >= total} onClick={() => onZoom(ZOOM_OUT)}>−</button>
          <button type="button" className="rv-tool" aria-label="Zoom in" onClick={() => onZoom(ZOOM_IN)}>+</button>
        </div>
      </Transport>
    </div>
  );
}
