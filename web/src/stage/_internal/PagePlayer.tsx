import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { useSeekReporter } from './issues.ts';
import { PAGE_HEIGHT, PAGE_WIDTH, renderUrl, seekNow } from './page.ts';

/** One caption phrase as the page draws it: a `[data-caption]` scene. Times are the reel's. */
export interface CaptionPhrase {
  start: number;
  end: number;
  text: string;
}

/** An offset of a caption from its default place, in pixels of the page. */
export interface CaptionShift {
  x: number;
  y: number;
}

/** A drag (or arrow-key nudge) of the caption on show: the phrase's index among the page's caption scenes, and how far, in page pixels. */
export interface CaptionMove {
  index: number;
  /** Alt was held: move this phrase only, not every caption. */
  alt: boolean;
  dx: number;
  dy: number;
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
  /** Where each caption phrase sits (by index among the page's caption scenes), applied to the page as a preview. Absent: the page's own. */
  captionShifts?: readonly CaptionShift[] | null;
  /** Draws a handle over the caption on show, outside the page, and reports a drag or an arrow-key nudge of it. Absent: no handle. */
  onCaptionMove?(move: CaptionMove): void | Promise<unknown>;
}

interface Handle {
  index: number;
  /** The caption's box in page pixels. */
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A pointer that moves less than this many page pixels did not drag. */
const DRAG_SLOP = 2;
const NUDGE = 10;
const NUDGE_FINE = 1;
const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

const captionScenes = (frame: HTMLIFrameElement | null): HTMLElement[] => [...(frame?.contentDocument?.querySelectorAll<HTMLElement>('[data-caption]') ?? [])];

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
export function PagePlayer({ pageUrl, time, title, className, onPhrases, captionShifts, onCaptionMove }: PagePlayerProps) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [scale, setScale] = useState(0);
  const report = useSeekReporter(pageUrl);
  const [handle, setHandle] = useState<Handle | null>(null);
  const [drag, setDrag] = useState<(CaptionMove & { from: { x: number; y: number } }) | null>(null);
  const movable = onCaptionMove !== undefined;

  /** Finds the caption on show and where it sits in the page, for the handle drawn over it. */
  const measure = useCallback((): void => {
    if (!movable) return;
    const scenes = captionScenes(frame.current);
    const index = scenes.findIndex((scene) => scene.classList.contains('active'));
    const box = index < 0 ? null : scenes[index]!.querySelector('.caption')?.getBoundingClientRect();
    setHandle(box && box.width > 0 ? { index, left: box.left, top: box.top, width: box.width, height: box.height } : null);
  }, [movable]);

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
      () => {
        report(null);
        measure();
      },
      (err: unknown) => report(err),
    );
  }, [loaded, time]);

  // The page's captions take the previewed positions (CSS translate, as the build writes them); a drag in progress adds to them.
  useEffect(() => {
    if (!loaded || !captionShifts) return;
    captionScenes(frame.current).forEach((scene, i) => {
      const shift = captionShifts[i];
      const caption = scene.querySelector<HTMLElement>('.caption');
      if (!shift || !caption) return;
      const moving = drag !== null && (!drag.alt || drag.index === i);
      caption.style.translate = `${shift.x + (moving ? drag.dx : 0)}px ${shift.y + (moving ? drag.dy : 0)}px`;
    });
    measure();
  }, [loaded, captionShifts, drag, measure]);

  const press = (e: PointerEvent<HTMLDivElement>): void => {
    if (!handle || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ index: handle.index, alt: e.altKey, dx: 0, dy: 0, from: { x: e.clientX, y: e.clientY } });
  };
  const dragTo = (e: PointerEvent<HTMLDivElement>): void => {
    if (!drag || scale <= 0) return;
    setDrag({ ...drag, dx: (e.clientX - drag.from.x) / scale, dy: (e.clientY - drag.from.y) / scale });
  };
  const release = async (): Promise<void> => {
    if (!drag) return;
    const { index, alt, dx, dy } = drag;
    if (Math.abs(dx) + Math.abs(dy) >= DRAG_SLOP) await onCaptionMove?.({ index, alt, dx: Math.round(dx), dy: Math.round(dy) });
    setDrag(null);
  };
  const nudge = (e: KeyboardEvent<HTMLDivElement>): void => {
    const step = ARROWS[e.key];
    if (!step || !handle) return;
    e.preventDefault();
    const size = e.shiftKey ? NUDGE_FINE : NUDGE;
    void onCaptionMove?.({ index: handle.index, alt: e.altKey, dx: step[0] * size, dy: step[1] * size });
  };

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
      {handle && scale > 0 && (
        <div
          className="rv-caphandle"
          role="button"
          tabIndex={0}
          aria-label="Move captions. Drag or use the arrow keys to move every caption; hold Alt to move this phrase only."
          data-dragging={drag !== null || undefined}
          style={{ left: handle.left * scale, top: handle.top * scale, width: handle.width * scale, height: handle.height * scale }}
          onPointerDown={press}
          onPointerMove={dragTo}
          onPointerUp={() => void release()}
          onPointerCancel={() => setDrag(null)}
          onKeyDown={nudge}
        >
          <span className="rv-caphint">Drag moves every caption · Alt-drag moves this phrase</span>
        </div>
      )}
    </div>
  );
}
