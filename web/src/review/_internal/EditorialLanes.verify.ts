export const fixtures = [
  { name: 'empty', description: 'No graphics, words or pins' },
  { name: 'speech', description: 'A selected caption opens its words from named source occurrences' },
  { name: 'broken', description: 'A graphic needs its source attachment repaired' },
  { name: 'wrong-count', description: 'FAIL: visible word count disagrees with the open caption', fail: true },
] as const;
export const invariants = [
  { description: 'the timeline window has a nonnegative start and positive length', check: (root: Element) => Number.isFinite(Number(root.getAttribute('data-verify-window-start'))) && Number(root.getAttribute('data-verify-window-start')) >= 0 && Number(root.getAttribute('data-verify-window-length')) > 0 },
  { description: 'unit is named', check: (root: Element) => root.getAttribute('data-verify-unit') === 'EditorialLanes' },
  { description: 'visible word count matches its bars', check: (root: Element) => Number(root.getAttribute('data-verify-visible-words')) === root.querySelectorAll('[data-word]').length },
  { description: 'visible words belong to the open caption', check: (root: Element) => [...root.querySelectorAll('[data-word]')].every((word) => word.closest('[data-caption]')?.getAttribute('data-caption') === root.getAttribute('data-verify-caption')) },
  { description: 'graphic count matches its bars', check: (root: Element) => Number(root.getAttribute('data-verify-graphics')) === root.querySelectorAll('[data-graphic]').length },
  { description: 'broken graphics are marked', check: (root: Element) => Number(root.getAttribute('data-verify-broken')) === root.querySelectorAll('[data-verify-broken-graphic="true"]').length },
] as const;
