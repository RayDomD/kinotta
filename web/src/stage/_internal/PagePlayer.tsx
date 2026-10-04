import { useEffect, useRef, useState } from 'react';
import { useSeekReporter } from './issues.ts';
import { PAGE_HEIGHT, PAGE_WIDTH, renderUrl, seekNow } from './page.ts';

/** One caption phrase as the page draws it: a `[data-caption]` scene. Times are the reel's. */
export interface CaptionPhrase {
  start: number;
  end: number;
  text: string;
}

export interface PagePlayerProps {
  /** Same-origin URL of the version page, without `?render` (the stage adds it). */
  pageUrl: string;
  /** Second of the reel to show. The page is seeked on every change, without waiting for the frame to draw. */
  time: number;
  /** Accessible name of the frame. */
  title: string;
  /** Class of the box, which the caller sizes and positions; the frame fills it. */
  className?: string;
  /** Called once the page has loaded, with the caption phrases it holds (none when it has no captions). */
  onPhrases?(phrases: CaptionPhrase[]): void;
}

function readPhrases(doc: Document | null): CaptionPhrase[] {
  if (!doc) return [];
  return [...doc.querySelectorAll<HTMLElement>('[data-caption]')].map((scene) => {
    const start = Number(scene.dataset.start);
    return { start, end: start + Number(scene.dataset.duration), text: (scene.textContent ?? '').replace(/\s+/g, ' ').trim() };
  });
}

/**
 * The version page playing: a same-origin frame at 1920x1080 scaled to its box, seeked to `time` each time that
 * changes. Not interactive. The page's background is transparent, so footage stacked under the box shows through.
 */
export function PagePlayer({ pageUrl, time, title, className, onPhrases }: PagePlayerProps) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [scale, setScale] = useState(0);
  const report = useSeekReporter(pageUrl);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const sized = new ResizeObserver(([entry]) => setScale((entry?.contentRect.width ?? 0) / PAGE_WIDTH));
    sized.observe(el);
    return () => sized.disconnect();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    seekNow(frame.current?.contentWindow ?? null, time).then(
      () => report(null),
      (err: unknown) => report(err),
    );
  }, [loaded, time]);

  return (
    <div ref={box} className={className} data-state={loaded ? 'ready' : 'loading'}>
      <iframe
        ref={frame}
        className="still-frame"
        src={renderUrl(pageUrl)}
        title={title}
        tabIndex={-1}
        style={{ width: PAGE_WIDTH, height: PAGE_HEIGHT, transform: `scale(${scale})` }}
        onLoad={() => {
          setLoaded(true);
          onPhrases?.(readPhrases(frame.current?.contentDocument ?? null));
        }}
      />
    </div>
  );
}
