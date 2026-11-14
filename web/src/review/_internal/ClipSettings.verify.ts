export const fixtures = [
  { name: 'empty', description: 'Selection hint before opening a clip' },
  { name: 'sound', description: 'Sound and Timing for one audio placement' },
  { name: 'picture', description: 'Framing and placement of an insert' },
  { name: 'inconsistent', description: 'FAIL: empty flag disagrees with selection', fail: true },
] as const;
export const invariants = [
  { description: 'unit is named', check: (root: Element) => root.getAttribute('data-verify-unit') === 'ClipSettings' },
  { description: 'at most one placement is shown', check: (root: Element) => ['0', '1'].includes(root.getAttribute('data-verify-count') ?? '') },
  { description: 'empty matches the selection count', check: (root: Element) => (root.getAttribute('data-verify-empty') === 'true') === (Number(root.getAttribute('data-verify-count')) === 0) },
  { description: 'readonly is boolean', check: (root: Element) => ['true', 'false'].includes(root.getAttribute('data-verify-readonly') ?? '') },
] as const;
