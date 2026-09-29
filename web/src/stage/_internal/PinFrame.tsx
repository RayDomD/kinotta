import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { contentBoxes, findElement, hitTest, namedElements } from './dom.ts';
import type { FrameElement } from './dom.ts';
import { FootageLayer } from './FootageLayer.tsx';
import { PAGE_HEIGHT, PAGE_WIDTH, renderUrl, seekPage } from './page.ts';
import { placeBox } from './placeBox.ts';
import type { Rect, Size } from './placeBox.ts';

/** Size of the pin hex drawn on the frame, in frame pixels. The comment input keeps clear of it. */
const PIN_SIZE = 28;

/** Where the reviewer pointed: fractions of the frame, and the named element there (null over empty frame). */
export interface FramePick {
  x: number;
  y: number;
  element: string | null;
}

export interface PinFrameProps {
  /** Same-origin URL of the version page, without `?render` (the stage adds it). */
  pageUrl: string;
  /** Second of the reel to show. */
  time: number;
  /** Accessible name of the frame, for example "Shot 03". */
  title: string;
  /** A footage file to draw under the (transparent) page, seeked to the same second. Absent for a page shown alone. */
  footageUrl?: string;
  /** A click on the frame. Ignored until the frame has drawn. */
  onPick(pick: FramePick): void;
  /** The named elements in view, reported each time the frame draws. */
  onElements?(elements: FrameElement[]): void;
  /** A pin being placed. Drawn as an outlined hex, with `draftContent` floated beside it. */
  draft?: FramePick | null;
  draftContent?: ReactNode;
  /** Saved pins, drawn by the caller over the page. They must not take the pointer. */
  children?: ReactNode;
}

interface Hover {
  name: string;
  /** The element's box in frame pixels. */
  rect: Rect;
  /** Boxes the name tag keeps off, in frame pixels. */
  obstacles: Rect[];
}

const scaled = (r: Rect, scale: number): Rect => ({
  left: r.left * scale,
  top: r.top * scale,
  width: r.width * scale,
  height: r.height * scale,
});

const sameRect = (a: Rect, b: Rect): boolean => a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;

const sameSpot = (a: Rect | null, b: Rect): boolean => a !== null && sameRect(a, b);

/**
 * The enlarged frame: the version page in a same-origin frame at 1920x1080, scaled to fit, seeked to `time`.
 * The page itself is never touched beyond reading it; the hover outline, name tag and pins are drawn here
 * over a transparent layer that takes the pointer (the frame has `pointer-events: none`).
 */
export function PinFrame({ pageUrl, time, title, footageUrl, onPick, onElements, draft = null, draftContent, children }: PinFrameProps) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const tagEl = useRef<HTMLDivElement>(null);
  const popEl = useRef<HTMLDivElement>(null);
  const elementsCallback = useRef(onElements);
  elementsCallback.current = onElements;

  const [loaded, setLoaded] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [hover, setHover] = useState<Hover | null>(null);
  const [tagAt, setTagAt] = useState<Rect | null>(null);
  const [popAt, setPopAt] = useState<Rect | null>(null);
  const scale = size.width / PAGE_WIDTH;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const sized = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    sized.observe(el);
    return () => sized.disconnect();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    let current = true;
    setDrawn(false);
    setHover(null);
    seekPage(frame.current?.contentWindow ?? null, time).then(
      () => {
        if (!current) return;
        setFailure(null);
        setDrawn(true);
        const doc = frame.current?.contentDocument;
        elementsCallback.current?.(doc ? namedElements(doc, { width: PAGE_WIDTH, height: PAGE_HEIGHT }) : []);
      },
      (err: unknown) => current && setFailure(err instanceof Error ? err.message : String(err)),
    );
    return () => {
      current = false;
    };
  }, [loaded, time]);

  /** Fractions of the frame under the pointer, and the named element there. */
  function probe(e: MouseEvent<HTMLDivElement>): { pick: FramePick; hit: ReturnType<typeof hitTest> } | null {
    const bounds = e.currentTarget.getBoundingClientRect();
    const doc = frame.current?.contentDocument;
    if (!drawn || !doc || bounds.width === 0 || bounds.height === 0) return null;
    const x = Math.min(1, Math.max(0, (e.clientX - bounds.left) / bounds.width));
    const y = Math.min(1, Math.max(0, (e.clientY - bounds.top) / bounds.height));
    const hit = hitTest(doc, x * PAGE_WIDTH, y * PAGE_HEIGHT);
    return { pick: { x, y, element: hit?.name ?? null }, hit };
  }

  function onMove(e: MouseEvent<HTMLDivElement>): void {
    const found = probe(e);
    const hit = found?.hit ?? null;
    if (!hit) {
      setHover(null);
      return;
    }
    const rect = scaled(hit.rect, scale);
    setHover((prev) => {
      if (prev && prev.name === hit.name && sameRect(prev.rect, rect)) return prev;
      const doc = frame.current!.contentDocument!;
      return { name: hit.name, rect, obstacles: contentBoxes(doc, hit.element).map((r) => scaled(r, scale)) };
    });
  }

  function onClick(e: MouseEvent<HTMLDivElement>): void {
    const found = probe(e);
    if (found) onPick(found.pick);
  }

  // Where the comment input goes: beside the pinned element (or the pin), off the page's content.
  const pop = useMemo(() => {
    const doc = frame.current?.contentDocument;
    if (!draft || !drawn || !doc || scale === 0) return null;
    const pin: Rect = { left: draft.x * size.width - PIN_SIZE / 2, top: draft.y * size.height - PIN_SIZE / 2, width: PIN_SIZE, height: PIN_SIZE };
    const found = draft.element ? findElement(doc, draft.element) : null;
    return {
      target: found ? scaled(found.rect, scale) : pin,
      obstacles: [pin, ...contentBoxes(doc, found?.element ?? null).map((r) => scaled(r, scale))],
    };
  }, [draft?.x, draft?.y, draft?.element, drawn, scale, size.width, size.height]);

  useLayoutEffect(() => {
    if (hover && tagEl.current) {
      const placed = placeBox(hover.rect, { width: tagEl.current.offsetWidth, height: tagEl.current.offsetHeight }, hover.obstacles, size);
      if (!sameSpot(tagAt, placed)) setTagAt(placed);
    }
    if (pop && popEl.current) {
      const placed = placeBox(pop.target, { width: popEl.current.offsetWidth, height: popEl.current.offsetHeight }, pop.obstacles, size);
      if (!sameSpot(popAt, placed)) setPopAt(placed);
    }
  });

  const state = failure !== null ? 'failed' : drawn ? 'ready' : 'loading';
  const at = (r: Rect | null): CSSProperties => ({ left: r?.left ?? 0, top: r?.top ?? 0 });

  return (
    <div ref={box} className="still pinnable" data-state={state}>
      {footageUrl !== undefined && <FootageLayer url={footageUrl} time={time} title={`${title} footage`} />}
      {failure === null && (
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
          <strong>Frame unavailable</strong>
          <span>{failure}</span>
        </div>
      )}
      {children}
      {draft && (
        <span className="hexpin draft" style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%` }} aria-hidden="true">
          <svg viewBox="0 0 28 28"><path d="M14 3l9.5 5.5v11L14 25 4.5 19.5v-11z" fill="var(--ground)" stroke="var(--light)" strokeWidth="2.2" strokeLinejoin="round" /></svg>
        </span>
      )}
      {hover && (
        <>
          <div
            className="hot"
            style={{ left: hover.rect.left, top: hover.rect.top, width: hover.rect.width, height: hover.rect.height }}
            aria-hidden="true"
          />
          <div ref={tagEl} className="tag" style={at(tagAt)} aria-hidden="true">{hover.name}</div>
        </>
      )}
      {failure === null && <div className="hit" onPointerMove={onMove} onPointerLeave={() => setHover(null)} onClick={onClick} />}
      {draft && (
        <div ref={popEl} className="pop" style={at(popAt)}>
          {draftContent}
        </div>
      )}
    </div>
  );
}
