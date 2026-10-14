export const fixtures = [
  { name: 'no-alternates', count: 0, status: 'ready' },
  { name: 'loading-alternates', count: 3, status: 'loading' },
  { name: 'viewing-B', count: 3, status: 'ready', viewed: 'r2' },
  { name: 'frozen-alternates', count: 3, status: 'frozen' },
  { name: 'invalid-view', description: 'FAIL: reported viewed revision does not match the pressed control', fail: true },
];

export const invariants = [
  { description: 'Sheet status is valid', check: (root: Element) => root.getAttribute('data-verify-unit') === 'ShotSheet' && ['loading', 'ready', 'frozen'].includes(root.getAttribute('data-verify-status') ?? '') },
  { description: 'Offered count matches visible alternate controls', check: (root: Element) => Number(root.getAttribute('data-verify-count')) === root.querySelectorAll('.alternate-view').length },
  { description: 'Exactly one offered alternate is viewed', check: (root: Element) => Number(root.getAttribute('data-verify-count')) === 0 || root.querySelectorAll('.alternate-view[aria-pressed="true"]').length === 1 && root.querySelector('.alternate-view[aria-pressed="true"]')?.getAttribute('data-alternate-revision') === root.getAttribute('data-verify-viewed') },
  { description: 'Displayed pin count is exact', check: (root: Element) => Number(root.getAttribute('data-verify-pin-count')) === root.querySelectorAll('.well .hexpin:not(.draft)').length },
  { description: 'Frozen sheets cannot choose or dismiss', check: (root: Element) => root.getAttribute('data-verify-read-only') !== 'true' || root.querySelector('.alternate-actions') === null },
];
