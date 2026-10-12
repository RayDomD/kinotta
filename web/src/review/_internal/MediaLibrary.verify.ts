export const fixtures = [
  { name: 'paths', description: 'Registered and unregistered paths in one list' },
  { name: 'filtered', description: 'Search and media kind narrow that list' },
  { name: 'problem', description: 'Relink and Retry appear for a missing source' },
  { name: 'effects', description: 'Bundled effects support search, preview and Add' },
  { name: 'effects-empty', description: 'No matching effects has no rows' },
  { name: 'effects-busy', description: 'Add is disabled while copying' },
  { name: 'effects-failed', description: 'Failed catalogue loading offers Retry' },
  { name: 'wrong-count', description: 'FAIL: row count disagrees with its metadata', fail: true },
] as const;
export const invariants = [
  { description: 'unit is named', check: (root: Element) => root.getAttribute('data-verify-unit') === 'MediaLibrary' },
  { description: 'kind is known', check: (root: Element) => ['', 'video', 'image', 'audio', 'effects'].includes(root.getAttribute('data-verify-kind') ?? '') },
  { description: 'rows match their count', check: (root: Element) => Number(root.getAttribute('data-verify-count')) === root.querySelectorAll('[data-media-path], [data-effect-id]').length },
  { description: 'busy effects cannot be added', check: (root: Element) => root.getAttribute('data-verify-busy') !== 'true' || Array.from(root.querySelectorAll('[data-effect-id] .editor-media-add')).every((button) => button.hasAttribute('disabled')) },
  { description: 'empty agrees with count', check: (root: Element) => root.getAttribute('data-verify-empty') === String(Number(root.getAttribute('data-verify-count')) === 0) },
  { description: 'status is known', check: (root: Element) => ['ready', 'working', 'loading', 'error'].includes(root.getAttribute('data-verify-status') ?? '') },
  { description: 'loading has no rows', check: (root: Element) => root.getAttribute('data-verify-loading') !== 'true' || Number(root.getAttribute('data-verify-count')) === 0 },
  { description: 'busy and error are boolean', check: (root: Element) => ['data-verify-busy', 'data-verify-error'].every((name) => ['true', 'false'].includes(root.getAttribute(name) ?? '')) },
] as const;
