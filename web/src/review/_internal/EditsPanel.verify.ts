export const fixtures = [
  { name: 'empty', description: 'No pending operations' },
  { name: 'pending', description: 'Pending operations on the current base' },
  { name: 'replayed', description: 'Retained operations with a visible history reset notice' },
  { name: 'invalid-replay', description: 'FAIL: replay origin is not older than the current base', fail: true },
] as const;

export const invariants = [
  { description: 'the unit is named', check: (root: Element) => root.getAttribute('data-verify-unit') === 'EditsPanel' },
  { description: 'the panel tab is known', check: (root: Element) => ['edits', 'comments', 'clip'].includes(root.getAttribute('data-verify-tab') ?? '') },
  { description: 'operation count is a nonnegative integer', check: (root: Element) => /^(0|[1-9]\d*)$/.test(root.getAttribute('data-verify-count') ?? '') },
  { description: 'replay names an older base', check: (root: Element) => { const from = root.getAttribute('data-verify-replayed-from'); return !from || Number.isInteger(Number(from)) && Number(from) >= 0 && Number(from) < Number(root.getAttribute('data-verify-base')); } },
  { description: 'the Edits tab shows its replay notice', check: (root: Element) => root.getAttribute('data-verify-tab') !== 'edits' || !!root.querySelector('[data-verify-replay-notice]') === !!root.getAttribute('data-verify-replayed-from') },
] as const;
