export const fixtures = [
  { name: 'empty', description: 'No pictures at the playhead' },
  { name: 'split', description: 'Two independent picture regions' },
  { name: 'overlap', description: 'Three layered pictures with one selected' },
  { name: 'inconsistent', description: 'FAIL: count disagrees with the rendered layers', fail: true },
] as const;
export const invariants = [
  { description: 'unit is named', check: (root: Element) => root.getAttribute('data-verify-unit') === 'PictureLayers' },
  { description: 'count matches picture layers', check: (root: Element) => Number(root.getAttribute('data-verify-count')) === root.querySelectorAll('[data-verify-unit="PictureLayer"]').length },
  { description: 'empty matches count', check: (root: Element) => (root.getAttribute('data-verify-empty') === 'true') === (Number(root.getAttribute('data-verify-count')) === 0) },
  { description: 'selected picture exists', check: (root: Element) => !root.getAttribute('data-verify-selected') || [...root.querySelectorAll('[data-verify-id]')].some((el) => el.getAttribute('data-verify-id') === root.getAttribute('data-verify-selected')) },
] as const;
