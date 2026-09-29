import { useEffect, useRef, useState } from 'react';

/** The footage frame is treated as drawn after two animation frames, as for a page. */
const DRAW_FRAMES = 2;
/** Seeks that land within this many seconds of the current position fire no `seeked` event. */
const SAME_SPOT = 0.001;
/** HTMLMediaElement.HAVE_CURRENT_DATA: a frame is available to draw. */
const HAVE_CURRENT_DATA = 2;

export type FootageState = 'loading' | 'ready' | 'failed';

export interface FootageLayerProps {
  /** Same-origin URL of the footage file. */
  url: string;
  /** Second of the footage to show. It is the same second the clip page is seeked to. */
  time: number;
  /** Accessible name, for example "Shot 03 footage". */
  title: string;
}

function once(video: HTMLVideoElement, event: string, fail: () => void): Promise<void> {
  return new Promise((done, reject) => {
    const settle = (): void => {
      video.removeEventListener(event, ok);
      video.removeEventListener('error', bad);
    };
    const ok = (): void => (settle(), done());
    const bad = (): void => (settle(), fail(), reject(new Error('footage failed to load')));
    video.addEventListener(event, ok);
    video.addEventListener('error', bad);
  });
}

const frames = (): Promise<void> =>
  new Promise((done) => {
    let left = DRAW_FRAMES;
    const tick = (): void => {
      if (--left === 0) done();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

/** Seeks a video to `time` and waits until that frame is on screen. */
async function seekVideo(video: HTMLVideoElement, time: number, fail: () => void): Promise<void> {
  if (video.readyState < 1) await once(video, 'loadedmetadata', fail);
  const target = Math.min(time, Math.max(0, (Number.isFinite(video.duration) ? video.duration : time) - 0.05));
  if (Math.abs(video.currentTime - target) < SAME_SPOT) {
    if (video.readyState < HAVE_CURRENT_DATA) await once(video, 'loadeddata', fail);
  } else {
    const seeked = once(video, 'seeked', fail);
    video.currentTime = target;
    await seeked;
  }
  await frames();
}

/**
 * The footage frame under a panel clip: a muted, paused video seeked to `time`. A file that will not load gives a
 * labelled placeholder, never a black frame. The clip page is drawn over it and takes the pointer, not this layer.
 */
export function FootageLayer({ url, time, title }: FootageLayerProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<FootageState>('loading');

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    let current = true;
    setState('loading');
    seekVideo(el, time, () => current && setState('failed')).then(
      () => current && setState('ready'),
      () => current && setState('failed'),
    );
    return () => {
      current = false;
    };
  }, [url, time]);

  return (
    <>
      {state !== 'failed' && (
        <video
          ref={video}
          className="still-footage"
          data-footage={state}
          src={url}
          aria-label={title}
          muted
          playsInline
          preload="auto"
          tabIndex={-1}
        />
      )}
      {state === 'failed' && (
        <div className="footage-failed" data-footage="failed" role="img" aria-label={`${title} unavailable`}>
          <strong>Footage unavailable</strong>
          <span>The footage file could not be loaded.</span>
        </div>
      )}
    </>
  );
}
