export const fixtures = [
  { name: 'paths', description: 'Registered and unregistered paths in one list' },
  { name: 'filtered', description: 'Search and media kind narrow that list' },
  { name: 'problem', description: 'Relink and Retry appear for a missing source' },
  { name: 'wrong-count', description: 'FAIL: row count disagrees with its metadata', fail: true },
] as const;
export const invariants = [
  { description: 'unit is named', check: (root: Element) => root.getAttribute('data-verify-unit') === 'MediaLibrary' },
  { description: 'kind is known', check: (root: Element) => ['', 'video', 'image', 'audio'].includes(root.getAttribute('data-verify-kind') ?? '') },
  { description: 'rows match their count', check: (root: Element) => Number(root.getAttribute('data-verify-count')) === root.querySelectorAll('[data-media-path]').length },
  { description: 'busy and error are boolean', check: (root: Element) => ['data-verify-busy', 'data-verify-error'].every((name) => ['true', 'false'].includes(root.getAttribute(name) ?? '')) },
] as const;
