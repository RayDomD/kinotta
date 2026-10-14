export const fixtures = [
  { name: 'loading', description: 'The working reel is loading' },
  { name: 'working', description: 'Working takes durable edits' },
  { name: 'frozen', description: 'A numbered version offers Back to Working' },
  { name: 'invalid-frozen', description: 'FAIL: a frozen version exposes an enabled editing tool', fail: true },
] as const;

export const invariants = [
  { description: 'the unit is named', check: (root: Element) => root.getAttribute('data-verify-unit') === 'Review' },
  { description: 'status is known', check: (root: Element) => ['none', 'loading', 'error', 'ready'].includes(root.getAttribute('data-verify-status') ?? '') },
  { description: 'frozen versions offer a way back', check: (root: Element) => root.getAttribute('data-verify-frozen') !== 'true' || !!root.querySelector('.frozen-version-line button') },
  { description: 'frozen versions disable editing', check: (root: Element) => root.getAttribute('data-verify-frozen') !== 'true' || !root.querySelector('[data-verify-editable="true"]') },
] as const;
