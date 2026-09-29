import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { PAGE_HEIGHT, PAGE_WIDTH, renderUrl, seekPage } from './page.ts';

/** Start loading a still a little before it scrolls into view. */
const LOAD_MARGIN = '100px';

export type StillState = 'idle' | 'loading' | 'ready' | 'failed';

export interface PageStillProps {
  /** Same-origin URL of the version page, without `?render` (the stage adds it). */
  pageUrl: string;
  /** Second of the reel to show. */
  time: number;
  /** Accessible name of the frame, for example "Shot 03 still". */
  title: string;
  /** Drawn over the still, such as its pins. Not part of the page. */
  children?: ReactNode;
}

/**
 * A live still: the version page in a same-origin frame, seeked to `time` and paused there.
 * The frame is only created once the still scrolls into view. Not interactive: it takes no focus and no pointer.
 */
export function PageStill({ pageUrl, time, title, children }: PageStillProps) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [scale, setScale] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const seen = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          seen.disconnect();
        }
      },
      { rootMargin: LOAD_MARGIN },
    );
    seen.observe(el);
    const sized = new ResizeObserver(([entry]) => setScale((entry?.contentRect.width ?? 0) / PAGE_WIDTH));
    sized.observe(el);
    return () => {
      seen.disconnect();
      sized.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    let current = true;
    setDrawn(false);
    seekPage(frame.current?.contentWindow ?? null, time).then(
      () => current && (setFailure(null), setDrawn(true)),
      (err: unknown) => current && setFailure(err instanceof Error ? err.message : String(err)),
    );
    return () => {
      current = false;
    };
  }, [loaded, time]);

  const state: StillState = failure !== null ? 'failed' : drawn ? 'ready' : visible ? 'loading' : 'idle';

  return (
    <div ref={box} className="still" data-state={state}>
      {visible && failure === null && (
        <iframe
          ref={frame}
          className="still-frame"
          src={renderUrl(pageUrl)}
          title={title}
          tabIndex={-1}
          style={{ width: PAGE_WIDTH, height: PAGE_HEIGHT, transform: `scale(${scale})` }}
          onLoad={() => setLoaded(true)}
        />
      )}
      {failure !== null && (
        <div className="still-failed" role="img" aria-label={`${title} unavailable`}>
          <strong>Still unavailable</strong>
          <span>{failure}</span>
        </div>
      )}
      {children}
    </div>
  );
}
