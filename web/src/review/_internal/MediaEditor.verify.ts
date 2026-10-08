/**
 * Fixtures exercised by the browser seam (tests/core/render-media-verify.test.ts), and invariants that read only the
 * rendered DOM and are self-contained, so a harness can run them inside the page. `inconsistent` is the deliberate
 * FAIL fixture: a copy of the ready root with its count contradicting its emptiness, which the invariants must catch.
 */
export const fixtures = [
  { name: 'empty', description: 'A media version with no placements' },
  { name: 'preparing', description: 'Sound still downloading and decoding' },
  { name: 'ready', description: 'Sound prepared, paused at the start' },
  { name: 'playing', description: 'Playing on the sound clock' },
  { name: 'error', description: 'A sound that could not be prepared' },
  { name: 'inconsistent', description: 'FAIL: count says placements, empty says none', fail: true },
] as const;

export const invariants: ReadonlyArray<{ description: string; check: (root: Element) => boolean }> = [
  { description: 'the unit is named', check: (root) => root.getAttribute('data-verify-unit') === 'MediaEditor' },
  { description: 'the context menu names a selected placement', check: (root) => {
    const id = root.getAttribute('data-verify-menu');
    return id ? root.querySelectorAll('[role="menu"]').length === 1 && [...root.querySelectorAll('[data-placement][aria-pressed="true"]')].some((bar) => bar.getAttribute('data-placement') === id) : root.querySelectorAll('[role="menu"]').length === 0;
  } },
  { description: 'empty matches a zero count', check: (root) => (root.getAttribute('data-verify-empty') === 'true') === (Number(root.getAttribute('data-verify-count')) === 0) },
  { description: 'status is a known state', check: (root) => ['error', 'ready', 'preparing'].includes(root.getAttribute('data-verify-status') ?? '') },
  { description: 'an error shows as the error status', check: (root) => root.getAttribute('data-verify-error') !== 'true' || root.getAttribute('data-verify-status') === 'error' },
  { description: 'playing only once ready', check: (root) => root.getAttribute('data-verify-playing') !== 'true' || root.getAttribute('data-verify-status') === 'ready' },
  { description: 'waiting for picture is a boolean, and only while playing', check: (root) => ['true', 'false'].includes(root.getAttribute('data-verify-waiting') ?? '') && (root.getAttribute('data-verify-waiting') !== 'true' || root.getAttribute('data-verify-playing') === 'true') },
  { description: 'framing is crop or fit, positioned inside the frame', check: (root) => [...root.querySelectorAll('[data-verify-framing]')].every((frame) => ['crop', 'fit'].includes(frame.getAttribute('data-verify-framing') ?? '') && ['x', 'y'].every((axis) => { const position = Number(frame.getAttribute(`data-verify-framing-${axis}`)); return Number.isFinite(position) && position >= 0 && position <= 1; })) },
];
