export const fixtures = [
  { name: 'paused', description: 'A paused reel with shots, pins and markers' },
  { name: 'empty', description: 'An empty reel has a disabled Play button' },
  { name: 'out-of-range', description: 'FAIL: playhead is beyond the reel', fail: true },
] as const;
export const invariants = [
  { description: 'scrubber exposes a bounded playhead', check: (root: Element) => {
    const slider = root.querySelector('[role="slider"]');
    const time = Number(slider?.getAttribute('aria-valuenow')); const total = Number(slider?.getAttribute('aria-valuemax'));
    return !!slider && Number.isFinite(time) && Number.isFinite(total) && total >= 0 && time >= 0 && time <= total;
  } },
  { description: 'an exact Playhead field remains available', check: (root: Element) => !!root.querySelector('input[aria-label="Playhead"]') },
  { description: 'frame and shot buttons have names', check: (root: Element) => ['Previous frame', 'Next frame', 'Previous shot', 'Next shot'].every((name) => [...root.querySelectorAll('button')].some((button) => button.getAttribute('aria-label') === name)) },
] as const;
