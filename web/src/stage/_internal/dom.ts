import type { Rect } from './placeBox.ts';

/** What the pointer is over in the page: the named element under it, with its box in page pixels. */
export interface Hit {
  name: string;
  element: Element;
  rect: Rect;
}

/** A named element of the page, its centre given as fractions of the frame. */
export interface FrameElement {
  name: string;
  x: number;
  y: number;
}

const NAMED = '[data-el]';

function boxOf(el: Element): Rect | null {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
}

/** The named element at a page position, or null over empty frame. Reads the page, never changes it. */
export function hitTest(doc: Document, x: number, y: number): Hit | null {
  const named = doc.elementFromPoint(x, y)?.closest(NAMED) ?? null;
  const name = named?.getAttribute('data-el');
  const rect = named ? boxOf(named) : null;
  return named && name && rect ? { name, element: named, rect } : null;
}

/** Visible named elements (those in the active scene), first of each name, in document order. */
export function namedElements(doc: Document, page: { width: number; height: number }): FrameElement[] {
  const seen = new Set<string>();
  const found: FrameElement[] = [];
  for (const el of doc.querySelectorAll(NAMED)) {
    const name = el.getAttribute('data-el');
    const rect = boxOf(el);
    if (!name || !rect || seen.has(name)) continue;
    seen.add(name);
    found.push({
      name,
      x: Math.min(1, Math.max(0, (rect.left + rect.width / 2) / page.width)),
      y: Math.min(1, Math.max(0, (rect.top + rect.height / 2) / page.height)),
    });
  }
  return found;
}

/** The first visible element with this name, with its box in page pixels. */
export function findElement(doc: Document, name: string): { element: Element; rect: Rect } | null {
  for (const el of doc.querySelectorAll(NAMED)) {
    const rect = el.getAttribute('data-el') === name ? boxOf(el) : null;
    if (rect) return { element: el, rect };
  }
  return null;
}

/**
 * Boxes a floating label should stay off: every visible named element, every visible leaf element and every
 * line of text, in page pixels. Named elements and leaves that contain `around` are left out, since the label
 * sits beside `around` and can only ever be inside its ancestors.
 */
export function contentBoxes(doc: Document, around: Element | null): Rect[] {
  const boxes: Rect[] = [];
  for (const el of doc.body.querySelectorAll('*')) {
    if (['SCRIPT', 'STYLE'].includes(el.tagName)) continue;
    const contains = around !== null && el.contains(around);
    if (!contains && (el.hasAttribute('data-el') || el.children.length === 0)) {
      const box = boxOf(el);
      if (box) boxes.push(box);
    }
    for (const node of el.childNodes) {
      if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) continue;
      const range = doc.createRange();
      range.selectNodeContents(node);
      for (const r of range.getClientRects()) {
        if (r.width > 0 && r.height > 0) boxes.push({ left: r.left, top: r.top, width: r.width, height: r.height });
      }
    }
  }
  return boxes;
}
