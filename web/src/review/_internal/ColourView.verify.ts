export const fixtures = [
  { name: 'empty', description: 'No picture clips to grade' },
  { name: 'working', description: 'A selected Working picture with live grading controls' },
  { name: 'readonly', description: 'A saved version with disabled controls' },
  { name: 'inconsistent', description: 'FAIL: empty flag disagrees with picture count', fail: true },
] as const;
export const invariants = [
  { description: 'unit is named', check: (root: Element) => root.getAttribute('data-verify-unit') === 'ColourView' },
  { description: 'empty matches picture count', check: (root: Element) => (root.getAttribute('data-verify-empty') === 'true') === (Number(root.getAttribute('data-verify-count')) === 0) },
  { description: 'readonly is boolean', check: (root: Element) => ['true', 'false'].includes(root.getAttribute('data-verify-readonly') ?? '') },
  { description: 'selection names the current clip', check: (root: Element) => root.getAttribute('data-verify-empty') === 'true' || root.querySelectorAll('.rv-colour-clip[aria-current="true"]').length === 1 },
  { description: 'saved grades cannot change', check: (root: Element) => root.getAttribute('data-verify-readonly') !== 'true' || [...root.querySelectorAll('.rv-colour-deck input, .rv-colour-deck [role="slider"], .rv-colour-wheel, .rv-colour-transport button:last-child')].every((control) => control.hasAttribute('disabled') || control.getAttribute('aria-disabled') === 'true') },
] as const;
