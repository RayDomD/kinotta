import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { contentBoxes, findElement, hitTest, namedElements } from './dom.ts';
import type { FrameElement } from './dom.ts';
import { FootageLayer } from './FootageLayer.tsx';
import { useSeekReporter } from './issues.ts';
import { PAGE_HEIGHT, PAGE_WIDTH, renderUrl, seekPage } from './page.ts';
import { ANCHOR_SIZE, PinMark } from './PinMark.tsx';
import { placeBox } from './placeBox.ts';
import type { Rect, Size } from './placeBox.ts';

/** Where the reviewer pointed: fractions of the frame, and the named element there (null over empty frame). */
export interface FramePick {
  x: number;
  y: number;
  element: string | null;
}

/** A saved pin to draw on the frame, with the start of its comment for the tag. */
export interface FramePin extends FramePick {
  id: string;
  number: number;
  text: string;
  marked?: boolean;
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
  /** Set when the shot is known not to render (a contract problem found before loading): shown as the reason, and the page is not loaded. */
  unavailable?: string;
  /** A click on the frame. Ignored until the frame has drawn. */
  onPick(pick: FramePick): void;
  /** The named elements in view, reported each time the frame draws. */
  onElements?(elements: FrameElement[]): void;
  /** A pin being placed. Drawn as the anchor it keeps once saved, with `draftContent` floated beside it. */
  draft?: FramePick | null;
  draftContent?: ReactNode;
  /** Saved pins: each an anchor on its spot, with its tag placed off its element and off the page's content. */
  pins?: FramePin[];
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

/** A saved pin's anchor hex, in frame pixels. */
const anchorBox = (p: FramePick, size: Size): Rect => ({
  left: p.x * size.width - ANCHOR_SIZE / 2,
  top: p.y * size.height - ANCHOR_SIZE / 2,
  width: ANCHOR_SIZE,
  height: ANCHOR_SIZE,
});

/**
 * The enlarged frame: the version page in a same-origin frame at 1920x1080, scaled to fit, seeked to `time`.
 * The page itself is never touched beyond reading it; the hover outline, name tag and pins are drawn here
 * over a transparent layer that takes the pointer (the frame has `pointer-events: none`).
 */
export function PinFrame({ pageUrl, time, title, footageUrl, unavailable, onPick, onElements, draft = null, draftContent, pins = [] }: PinFrameProps) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const tagEl = useRef<HTMLDivElement>(null);
  const popEl = useRef<HTMLDivElement>(null);
  const pinTags = useRef(new Map<string, HTMLSpanElement>());
  const [pinSpots, setPinSpots] = useState<Record<string, Rect>>({});
  const elementsCallback = useRef(onElements);
  elementsCallback.current = onElements;

  const [loaded, setLoaded] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const report = useSeekReporter(pageUrl);
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
        report(null);
        const doc = frame.current?.contentDocument;
        elementsCallback.current?.(doc ? namedElements(doc, { width: PAGE_WIDTH, height: PAGE_HEIGHT }) : []);
      },
      (err: unknown) => current && (setFailure(err instanceof Error ? err.message : String(err)), report(err)),
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
    const pin: Rect = { left: draft.x * size.width - ANCHOR_SIZE / 2, top: draft.y * size.height - ANCHOR_SIZE / 2, width: ANCHOR_SIZE, height: ANCHOR_SIZE };
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

  // Each pin's tag goes beside its element (or its anchor, for a position pin), clear of every anchor, the
  // page's content and the tags placed before it. Until the frame draws, tags keep their default spot.
  useLayoutEffect(() => {
    const doc = frame.current?.contentDocument;
    if (!drawn || !doc || scale === 0) return;
    const anchors = pins.map((p) => anchorBox(p, size));
    const placed: Rect[] = [];
    const next: Record<string, Rect> = {};
    for (const p of pins) {
      const tag = pinTags.current.get(p.id);
      if (!tag) continue;
      const found = p.element ? findElement(doc, p.element) : null;
      const target = found ? scaled(found.rect, scale) : anchorBox(p, size);
      const obstacles = [...anchors, ...contentBoxes(doc, found?.element ?? null).map((r) => scaled(r, scale)), ...placed];
      const spot = placeBox(target, { width: tag.offsetWidth, height: tag.offsetHeight }, obstacles, size);
      placed.push(spot);
      next[p.id] = spot;
    }
    setPinSpots((prev) => (Object.keys(next).length === Object.keys(prev).length && Object.entries(next).every(([id, r]) => sameSpot(prev[id] ?? null, r)) ? prev : next));
  }, [pins, drawn, scale, size]);

  const reason = unavailable ?? failure;
  const state = reason !== null ? 'failed' : drawn ? 'ready' : 'loading';
  const at = (r: Rect | null): CSSProperties => ({ left: r?.left ?? 0, top: r?.top ?? 0 });

  return (
    <div ref={box} className="still pinnable" data-state={state}>
      {footageUrl !== undefined && <FootageLayer url={footageUrl} time={time} title={`${title} footage`} />}
      {reason === null && (
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
      {reason !== null && (
        <div className="still-failed" role="img" aria-label={`${title} unavailable`}>
          <strong>Frame unavailable</strong>
          <span>{reason}</span>
        </div>
      )}
      {pins.length > 0 && (
        <svg className="pinlines" aria-hidden="true">
          {pins.map((p) => {
            const spot = pinSpots[p.id];
            if (!spot) return null;
            const ax = p.x * size.width;
            const ay = p.y * size.height;
            // To the nearest point of the tag, so the line never crosses it.
            const tx = Math.min(Math.max(ax, spot.left), spot.left + spot.width);
            const ty = Math.min(Math.max(ay, spot.top), spot.top + spot.height);
            return <line key={p.id} x1={ax} y1={ay} x2={tx} y2={ty} />;
          })}
        </svg>
      )}
      {pins.map((p) => {
        const spot = pinSpots[p.id];
        const anchor = anchorBox(p, size);
        return (
          <PinMark
            key={p.id}
            number={p.number}
            x={p.x}
            y={p.y}
            marked={p.marked}
            text={p.text}
            tagStyle={spot && { left: spot.left - anchor.left, top: spot.top - anchor.top }}
            tagRef={(el) => {
              if (el) pinTags.current.set(p.id, el);
              else pinTags.current.delete(p.id);
            }}
          />
        );
      })}
      {draft && (
        <span className="hexpin draft" style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%` }} aria-hidden="true">
          <svg viewBox="0 0 28 28"><path d="M14 3l9.5 5.5v11L14 25 4.5 19.5v-11z" fill="var(--light)" stroke="var(--ground)" strokeWidth="3" strokeLinejoin="round" /></svg>
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
      {reason === null && <div className="hit" onPointerMove={onMove} onPointerLeave={() => setHover(null)} onClick={onClick} />}
      {draft && (
        <div ref={popEl} className="pop" style={at(popAt)}>
          {draftContent}
        </div>
      )}
    </div>
  );
}
