import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { ElementLayer } from './ElementLayer.tsx';
import type { ElementEditing } from './ElementLayer.tsx';
import { useSeekReporter } from './issues.ts';
import { PAGE_HEIGHT, PAGE_WIDTH, renderUrl, seekNow } from './page.ts';

/** One caption phrase as the page draws it: a `[data-caption]` scene. Times are the reel's. */
export interface CaptionPhrase {
  start: number;
  end: number;
  text: string;
  /** From its first word's start to its last word's end; absent for a phrase with no words. */
  spoken?: { start: number; end: number };
}

/** A word of a caption shown in place of the built ones, in the reel's seconds. */
export interface CaptionWord {
  text: string;
  start: number;
  end: number;
}

/** The caption on show retyped: its index among the page's caption scenes and the whole phrase's new text. */
export interface CaptionText {
  index: number;
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

/**
 * Clips played at other times than the page has them, before Save: a slid or trimmed clip, or one being dragged. The
 * page's engine reads each scene's `data-start` and `data-duration` on every seek, so rewriting them moves the clip with
 * no rebuild; the clip still plays from its own first frame, as a rebuilt page would.
 */
export interface ClipTiming {
  /** The clip a scene belongs to, from its `data-scene` name. */
  clipOf(scene: string): string | undefined;
  /** Where each moved clip now plays, by clip id, in the reel's seconds. Clips not listed play as built. */
  spans: ReadonlyMap<string, { start: number; end: number }>;
  /** Page seconds minus reel seconds at the moment shown, where unsaved cuts make the two differ. */
  offset: number;
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
  /** Element offsets previewed in the page; with `onChange` set, a click picks an element, a drag moves it and its corner grip scales it. Absent: the page as built. */
  elements?: ElementEditing;
  /** Clips moved before Save, played at their new times. Absent or null: every clip as built. */
  clipTiming?: ClipTiming | null;
  /** Words shown in place of a caption's built ones, by index among the page's caption scenes; null for one as built. */
  captionWords?: readonly (readonly CaptionWord[] | null)[] | null;
  /** A double-click (or Enter) on the caption handle opens its text to retype; this reports the new text. Absent: no text editing. */
  onCaptionText?(edit: CaptionText): void | Promise<unknown>;
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

/** The page's built timing for a scene, kept so a clip that is no longer moved gets it back. */
const BUILT_START = 'builtStart';
const BUILT_DURATION = 'builtDuration';

/** Sets each moved clip's scene to its new times and every other clip scene back to its built ones. */
function applyClipTiming(frame: HTMLIFrameElement | null, timing: ClipTiming | null | undefined): void {
  for (const scene of frame?.contentDocument?.querySelectorAll<HTMLElement>('[data-scene]:not([data-caption])') ?? []) {
    const { dataset } = scene;
    if (dataset[BUILT_START] === undefined) {
      dataset[BUILT_START] = dataset.start ?? '0';
      dataset[BUILT_DURATION] = dataset.duration ?? '0';
    }
    const id = timing?.clipOf(dataset.scene ?? '');
    const span = id === undefined ? undefined : timing?.spans.get(id);
    dataset.start = span ? String(span.start + timing!.offset) : dataset[BUILT_START];
    dataset.duration = span ? String(span.end - span.start) : dataset[BUILT_DURATION];
  }
}

/** The page's built words of a caption, kept so a caption that is no longer edited gets them back. */
const BUILT_WORDS = 'builtWords';
/** Marks a caption showing words other than its built ones. */
const WORDS_EDITED = 'wordsEdited';
/** Seconds the last word stays marked after it ends: the engine's own hold (`NOW_HOLD` in motion.js). */
const NOW_HOLD = 0.25;

/** Puts the given words in each edited caption and the built ones back in the rest. An emptied caption is hidden. */
function applyCaptionWords(frame: HTMLIFrameElement | null, captionWords: PagePlayerProps['captionWords']): void {
  const doc = frame?.contentDocument;
  if (!doc) return;
  captionScenes(frame).forEach((scene, i) => {
    const caption = scene.querySelector<HTMLElement>('.caption');
    const line = caption?.querySelector<HTMLElement>('.ph');
    if (!caption || !line) return;
    if (scene.dataset[BUILT_WORDS] === undefined) scene.dataset[BUILT_WORDS] = line.innerHTML;
    const words = captionWords?.[i] ?? null;
    if (words === null) {
      if (scene.dataset[WORDS_EDITED] !== undefined) {
        line.innerHTML = scene.dataset[BUILT_WORDS];
        delete scene.dataset[WORDS_EDITED];
        caption.hidden = false;
      }
      return;
    }
    line.replaceChildren(
      ...words.flatMap((w, n) => {
        const span = doc.createElement('span');
        span.dataset.t = String(w.start);
        span.dataset.e = String(w.end);
        span.textContent = w.text;
        return n === 0 ? [span] : [doc.createTextNode(' '), span];
      }),
    );
    scene.dataset[WORDS_EDITED] = '';
    caption.hidden = words.length === 0;
  });
}

/**
 * Marks the words of each edited caption said and now, as the engine does for built ones: the engine keeps the spans
 * it found when the page loaded, so swapped-in spans are marked here after each seek.
 */
function markCaptionWords(frame: HTMLIFrameElement | null, time: number): void {
  for (const scene of frame?.contentDocument?.querySelectorAll<HTMLElement>('[data-caption][data-words-edited]') ?? []) {
    const words = [...scene.querySelectorAll<HTMLElement>('[data-t]')];
    const said = words.filter((w) => time >= Number(w.dataset.t));
    const now = said[said.length - 1];
    for (const w of words) {
      w.classList.toggle('said', said.includes(w));
      w.classList.toggle('now', w === now && time < Number(now.dataset.e) + NOW_HOLD);
    }
  }
}

function readPhrases(doc: Document | null): CaptionPhrase[] {
  if (!doc) return [];
  return [...doc.querySelectorAll<HTMLElement>('[data-caption]')].map((scene) => {
    const start = Number(scene.dataset.start);
    const words = [...scene.querySelectorAll<HTMLElement>('[data-t]')];
    const spoken = words.length > 0 ? { start: Number(words[0]!.dataset.t), end: Number(words[words.length - 1]!.dataset.e) } : undefined;
    return { start, end: start + Number(scene.dataset.duration), text: (scene.textContent ?? '').replace(/\s+/g, ' ').trim(), ...(spoken ? { spoken } : {}) };
  });
}

/**
 * The version page playing: a same-origin frame at 1920x1080 scaled to its box, seeked to `time` each time that
 * changes. Not interactive. The page's background is transparent, so footage stacked under the box shows through.
 */
export function PagePlayer({ pageUrl, time, title, className, onPhrases, captionShifts, onCaptionMove, elements, clipTiming, captionWords, onCaptionText }: PagePlayerProps) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [scale, setScale] = useState(0);
  const report = useSeekReporter(pageUrl);
  const [handle, setHandle] = useState<Handle | null>(null);
  const [drag, setDrag] = useState<(CaptionMove & { from: { x: number; y: number } }) | null>(null);
  const [retyping, setRetyping] = useState<(Handle & { text: string }) | null>(null);
  const movable = onCaptionMove !== undefined || onCaptionText !== undefined;

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
    applyClipTiming(frame.current, clipTiming);
    applyCaptionWords(frame.current, captionWords);
    seekNow(frame.current?.contentWindow ?? null, time).then(
      () => {
        markCaptionWords(frame.current, time);
        report(null);
        measure();
      },
      (err: unknown) => report(err),
    );
  }, [loaded, time, clipTiming, captionWords]);

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
    if (!handle || e.button !== 0 || !onCaptionMove) return;
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
  /** Opens the caption on show for retyping, with the text it reads now. */
  const retype = (): void => {
    if (!handle || !onCaptionText) return;
    const caption = captionScenes(frame.current)[handle.index]?.querySelector('.caption');
    setRetyping({ ...handle, text: (caption?.textContent ?? '').replace(/\s+/g, ' ').trim() });
  };
  const finishRetype = async (text: string | null): Promise<void> => {
    const open = retyping;
    setRetyping(null);
    if (open && text !== null && text.replace(/\s+/g, ' ').trim() !== open.text) await onCaptionText?.({ index: open.index, text });
  };
  const nudge = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Enter' && onCaptionText) {
      e.preventDefault();
      retype();
      return;
    }
    if (!onCaptionMove) return;
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
      {elements && <ElementLayer frame={frame} loaded={loaded} scale={scale} time={time} editing={elements} />}
      {handle && scale > 0 && retyping === null && (
        <div
          className="rv-caphandle"
          role="button"
          tabIndex={0}
          aria-label={`${onCaptionMove ? 'Move captions. Drag or use the arrow keys to move every caption; hold Alt to move this phrase only.' : 'Caption.'}${onCaptionText ? ' Double-click or press Enter to edit its text.' : ''}`}
          data-dragging={drag !== null || undefined}
          style={{ left: handle.left * scale, top: handle.top * scale, width: handle.width * scale, height: handle.height * scale }}
          onPointerDown={press}
          onPointerMove={dragTo}
          onPointerUp={() => void release()}
          onPointerCancel={() => setDrag(null)}
          onKeyDown={nudge}
          onDoubleClick={retype}
        >
          <span className="rv-caphint">{onCaptionText ? 'Drag moves every caption · Alt-drag this phrase · Double-click edits the text' : 'Drag moves every caption · Alt-drag moves this phrase'}</span>
        </div>
      )}
      {retyping && scale > 0 && (
        <input
          className="rv-captext"
          aria-label="Caption text"
          defaultValue={retyping.text}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          style={{ left: retyping.left * scale, top: retyping.top * scale, minWidth: retyping.width * scale, height: retyping.height * scale }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void finishRetype(e.currentTarget.value);
            else if (e.key === 'Escape') void finishRetype(null);
            else return;
            e.preventDefault();
            e.stopPropagation();
          }}
          onBlur={() => void finishRetype(null)}
        />
      )}
    </div>
  );
}
