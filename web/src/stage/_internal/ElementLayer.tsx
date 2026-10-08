import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent, RefObject } from 'react';
import { CLIP_ROOT } from '../../../../server/core/model.ts';
import { hitTest } from './dom.ts';
import type { Rect } from './placeBox.ts';

/** Where an element sits against where its clip puts it: CSS px of its parent's space, and a factor about its centre. */
export interface ElementOffset {
  x: number;
  y: number;
  scale: number;
}

/** An element dragged or scaled: its clip, its name (or `CLIP_ROOT`), and its new offset. */
export interface ElementChange extends ElementOffset {
  clip: string;
  element: string;
}

/** The reserved element name for a clip's root, as the plan names it. */
export { CLIP_ROOT };

export interface ElementEditing {
  /** Each clip's offsets by element name, as they should show. An element at home is listed too when a saved offset must be undone. */
  offsets: Readonly<Record<string, Readonly<Record<string, ElementOffset>>>>;
  /** The plan clip a scene of the page is, or undefined for one that is not a clip. */
  clipOf(scene: string): string | undefined;
  /** An element was dragged or scaled. Absent: the offsets show but nothing can be picked. */
  onChange?(change: ElementChange): void | Promise<unknown>;
}

interface Target {
  scene: string;
  clip: string;
  element: string;
}

/** The selected element's box and where it would sit with no offset, in page pixels. */
interface Marks {
  box: Rect;
  ghost: Rect;
}

type Drag = {
  kind: 'move' | 'scale';
  target: Target;
  start: ElementOffset;
  from: { x: number; y: number };
  /** Page pixels moved per unit of offset: the ancestors' scale. */
  ratio: number;
  /** Scale drags: the pointer's distance from the element's centre when it was pressed. */
  reach: number;
  center: { x: number; y: number };
};

const HOME: ElementOffset = { x: 0, y: 0, scale: 1 };
/** A pointer that moves less than this many page pixels did not drag. */
const DRAG_SLOP = 2;
/** Offsets written by a drag are whole pixels; a scale is in hundredths. */
const SCALE_STEP = 100;
const MIN_SCALE = 0.1;
const MAX_SCALE = 10;
const PROBE_PX = 100;
const GRIP_SIZE = 9;
const TAG_HEIGHT = 22;
const PERCENT = 100;
/** Arrow keys nudge the selected element by this many offset units, or the large step with Shift. */
const NUDGE_STEP = 1;
const NUDGE_STEP_LARGE = 10;
/** A run of arrow presses is written as one change after this long without another. */
const NUDGE_SETTLE_MS = 350;
const NUDGE_KEYS: Readonly<Record<string, readonly [number, number]>> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
const FIELD_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

const sameOffset = (a: ElementOffset, b: ElementOffset): boolean => a.x === b.x && a.y === b.y && a.scale === b.scale;
const sameRect = (a: Rect | null, b: Rect | null): boolean => (a === null || b === null ? a === b : a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height);

function sceneRoot(doc: Document, scene: string): HTMLElement | null {
  for (const root of doc.querySelectorAll<HTMLElement>('[data-scene]')) if (root.getAttribute('data-scene') === scene) return root;
  return null;
}

function elementIn(root: HTMLElement, name: string): HTMLElement | null {
  if (name === CLIP_ROOT) return root;
  for (const el of root.querySelectorAll<HTMLElement>('[data-el]')) if (el.getAttribute('data-el') === name) return el;
  return null;
}

const boxOf = (el: Element): Rect | null => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
};

function place(el: HTMLElement, offset: ElementOffset): void {
  el.style.translate = `${offset.x}px ${offset.y}px`;
  el.style.scale = String(offset.scale);
}

/** The element's box with the offset in place, and where it would be at home. Puts the offset back before anything draws. */
function measure(el: HTMLElement, offset: ElementOffset): Marks | null {
  const box = boxOf(el);
  if (!box) return null;
  place(el, HOME);
  const ghost = boxOf(el) ?? box;
  place(el, offset);
  return { box, ghost };
}

/** How far the element moves on the page for one unit of offset: the scale of the space it sits in (a camera zoom). */
function pageShiftPerUnit(el: HTMLElement, offset: ElementOffset): number {
  const before = el.getBoundingClientRect().left;
  el.style.translate = `${offset.x + PROBE_PX}px ${offset.y}px`;
  const shift = (el.getBoundingClientRect().left - before) / PROBE_PX;
  place(el, offset);
  return Math.abs(shift) > 1e-3 ? shift : 1;
}

const signed = (n: number): string => (n < 0 ? `−${Math.abs(Math.round(n))}` : `+${Math.round(n)}`);

export interface ElementLayerProps {
  frame: RefObject<HTMLIFrameElement | null>;
  loaded: boolean;
  /** The frame's scale: page pixels to screen pixels. */
  scale: number;
  /** Changes when the page shows something else (time), so the marks follow an element that moves. */
  time: number;
  editing: ElementEditing;
}

/**
 * Element offsets over the version page. Applies the offsets to the page as inline CSS `translate` and `scale` (so the
 * preview matches what `build.py` writes), and, when `editing.onChange` is set, lets a click select an element (Alt: the
 * whole clip), a drag move it and the corner grip scale it. The outline, grip, name tag and ghost are drawn here, over the
 * frame, never in the page.
 */
export function ElementLayer({ frame, loaded, scale, time, editing }: ElementLayerProps) {
  const layer = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Target | null>(null);
  const [live, setLive] = useState<{ target: Target; offset: ElementOffset } | null>(null);
  const [marks, setMarks] = useState<Marks | null>(null);
  const drag = useRef<Drag | null>(null);
  /** The drag's latest offset, read when the pointer is released (state may not have rendered yet). */
  const latest = useRef<ElementOffset | null>(null);
  const applied = useRef(new Set<HTMLElement>());
  const editable = editing.onChange !== undefined;

  const offsetOf = (target: Target): ElementOffset => editing.offsets[target.clip]?.[target.element] ?? HOME;
  /** The offset on show: the drag's while one is on this element. */
  const shownOffset = (target: Target): ElementOffset => (live && live.target.scene === target.scene && live.target.element === target.element ? live.offset : offsetOf(target));

  // The page shows the offsets, with a drag in progress over its element.
  useLayoutEffect(() => {
    const doc = frame.current?.contentDocument;
    if (!loaded || !doc) return;
    const now = new Set<HTMLElement>();
    for (const root of doc.querySelectorAll<HTMLElement>('[data-scene]:not([data-caption])')) {
      const scene = root.getAttribute('data-scene')!;
      const clip = editing.clipOf(scene);
      if (clip === undefined) continue;
      const offsets = { ...editing.offsets[clip] };
      if (live && live.target.scene === scene) offsets[live.target.element] = live.offset;
      for (const [name, offset] of Object.entries(offsets)) {
        const el = elementIn(root, name);
        if (!el) continue;
        place(el, offset);
        now.add(el);
      }
    }
    for (const el of applied.current) {
      if (now.has(el)) continue;
      el.style.translate = '';
      el.style.scale = '';
    }
    applied.current = now;

    const root = selected ? sceneRoot(doc, selected.scene) : null;
    const el = selected && root ? elementIn(root, selected.element) : null;
    const next = el && selected ? measure(el, shownOffset(selected)) : null;
    setMarks((was) => (was !== null && next !== null && sameRect(was.box, next.box) && sameRect(was.ghost, next.ghost) ? was : next));
  }, [loaded, editing, live, selected, time]);

  const targetAt = (e: PointerEvent<HTMLDivElement>): Target | null => {
    const doc = frame.current?.contentDocument;
    const bounds = layer.current?.getBoundingClientRect();
    if (!doc || !bounds || scale <= 0) return null;
    const hit = hitTest(doc, (e.clientX - bounds.left) / scale, (e.clientY - bounds.top) / scale);
    const scene = hit?.element.closest('[data-scene]');
    if (!hit || !scene || scene.hasAttribute('data-caption')) return null;
    const name = scene.getAttribute('data-scene')!;
    const clip = editing.clipOf(name);
    return clip === undefined ? null : { scene: name, clip, element: e.altKey ? CLIP_ROOT : hit.name };
  };

  const begin = (kind: Drag['kind'], target: Target, e: PointerEvent<HTMLDivElement>): void => {
    const doc = frame.current?.contentDocument;
    const root = doc ? sceneRoot(doc, target.scene) : null;
    const el = root ? elementIn(root, target.element) : null;
    const bounds = layer.current?.getBoundingClientRect();
    if (!el || !bounds) return;
    const start = offsetOf(target);
    const box = boxOf(el);
    const center = box ? { x: bounds.left + (box.left + box.width / 2) * scale, y: bounds.top + (box.top + box.height / 2) * scale } : { x: e.clientX, y: e.clientY };
    const reach = Math.hypot(e.clientX - center.x, e.clientY - center.y);
    layer.current?.setPointerCapture(e.pointerId);
    drag.current = { kind, target, start, from: { x: e.clientX, y: e.clientY }, ratio: pageShiftPerUnit(el, start), reach, center };
  };

  const press = (e: PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0 || !editable) return;
    // No text selection or native drag starts under a drag of ours.
    e.preventDefault();
    // Which also keeps focus where it was: a field typed in before would take the arrow keys meant for this element.
    if (document.activeElement instanceof HTMLElement && FIELD_TAGS.has(document.activeElement.tagName)) document.activeElement.blur();
    if ((e.target as HTMLElement).dataset.grip !== undefined && selected) {
      begin('scale', selected, e);
      return;
    }
    const target = targetAt(e);
    setSelected(target);
    if (target) begin('move', target, e);
  };

  const show = (d: Drag, offset: ElementOffset): void => {
    latest.current = offset;
    setLive({ target: d.target, offset });
  };

  const dragTo = (e: PointerEvent<HTMLDivElement>): void => {
    const d = drag.current;
    if (!d || scale <= 0) return;
    if (d.kind === 'move') {
      const dx = (e.clientX - d.from.x) / scale / d.ratio;
      const dy = (e.clientY - d.from.y) / scale / d.ratio;
      show(d, { ...d.start, x: Math.round(d.start.x + dx), y: Math.round(d.start.y + dy) });
      return;
    }
    if (d.reach <= 0) return;
    const factor = Math.hypot(e.clientX - d.center.x, e.clientY - d.center.y) / d.reach;
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(d.start.scale * factor * SCALE_STEP) / SCALE_STEP));
    show(d, { ...d.start, scale: next });
  };

  const release = async (): Promise<void> => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const end = latest.current;
    latest.current = null;
    const moved = end !== null && !sameOffset(end, d.start) && (d.kind === 'scale' || Math.hypot(end.x - d.start.x, end.y - d.start.y) * d.ratio >= DRAG_SLOP);
    if (moved && end) await editing.onChange?.({ clip: d.target.clip, element: d.target.element, ...end });
    setLive(null);
  };

  // Arrow keys nudge the selected element (Shift: ten at a time) in place of stepping the player; they settle into one change.
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const offsetRef = useRef(shownOffset);
  offsetRef.current = shownOffset;
  const nudge = useRef<{ target: Target; offset: ElementOffset; timer: number } | null>(null);
  useEffect(() => {
    if (!editable || !selected) return;
    const target = selected;
    const onKey = (e: KeyboardEvent): void => {
      const dir = NUDGE_KEYS[e.key];
      if (!dir || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const el = e.target;
      if (el instanceof HTMLElement && (FIELD_TAGS.has(el.tagName) || el.isContentEditable)) return;
      e.preventDefault();
      const step = e.shiftKey ? NUDGE_STEP_LARGE : NUDGE_STEP;
      const base = nudge.current?.offset ?? offsetRef.current(target);
      const offset = { ...base, x: base.x + dir[0] * step, y: base.y + dir[1] * step };
      if (nudge.current) window.clearTimeout(nudge.current.timer);
      setLive({ target, offset });
      const timer = window.setTimeout(() => {
        nudge.current = null;
        void Promise.resolve(editingRef.current.onChange?.({ clip: target.clip, element: target.element, ...offset })).finally(() => setLive(null));
      }, NUDGE_SETTLE_MS);
      nudge.current = { target, offset, timer };
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [editable, selected]);

  const box = marks?.box;
  const ghost = marks?.ghost;
  const tagBelow = box !== undefined && box.top * scale < TAG_HEIGHT + 4;
  const name = selected ? (selected.element === CLIP_ROOT ? 'clip' : selected.element) : '';
  const offset = selected ? shownOffset(selected) : HOME;
  return (
    <div
      ref={layer}
      className="rv-elayer"
      data-editable={editable || undefined}
      onPointerDown={press}
      onPointerMove={dragTo}
      onPointerUp={() => void release()}
      onPointerCancel={() => {
        drag.current = null;
        latest.current = null;
        setLive(null);
      }}
    >
      {selected && box && scale > 0 && (
        <>
          {ghost && !sameRect(ghost, box) && (
            <div className="rv-elghost" data-testid="element-ghost" style={{ left: ghost.left * scale, top: ghost.top * scale, width: ghost.width * scale, height: ghost.height * scale }} />
          )}
          <div className="rv-elbox" data-testid="element-box" data-dragging={live !== null || undefined} style={{ left: box.left * scale, top: box.top * scale, width: box.width * scale, height: box.height * scale }}>
            {editable && <span className="rv-elgrip" data-grip="" aria-hidden="true" style={{ width: GRIP_SIZE, height: GRIP_SIZE }} />}
          </div>
          <div className="rv-eltag" data-testid="element-tag" style={{ left: box.left * scale, ...(tagBelow ? { top: (box.top + box.height) * scale + GRIP_SIZE } : { bottom: `calc(100% - ${box.top * scale}px + 4px)` }) }}>
            {`${selected.clip} · ${name}`}
            <b>{`${signed(offset.x)}, ${signed(offset.y)} · ${Math.round(offset.scale * PERCENT)}%`}</b>
          </div>
        </>
      )}
    </div>
  );
}
