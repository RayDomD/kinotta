export const fixtures = [
  { name: 'closed', description: 'Settings sheet closed' },
  { name: 'keyboard', description: 'Open on Keyboard with no conflicts' },
  { name: 'conflict', description: 'Two actions assigned to one chord' },
  { name: 'inconsistent', description: 'FAIL: conflict count disagrees with the error flag', fail: true },
] as const;
export const invariants = [
  { description: 'the unit is named', check: (root: Element) => root.getAttribute('data-verify-unit') === 'EditorSettingsSheet' },
  { description: 'status is known', check: (root: Element) => ['open', 'closed'].includes(root.getAttribute('data-verify-status') ?? '') },
  { description: 'dialog matches status', check: (root: Element) => root.hasAttribute('open') === (root.getAttribute('data-verify-status') === 'open') },
  { description: 'pane is known', check: (root: Element) => ['Keyboard', 'Editing', 'Layout', 'Appearance'].includes(root.getAttribute('data-verify-pane') ?? '') },
  { description: 'conflicts match error', check: (root: Element) => (Number(root.getAttribute('data-verify-conflicts')) > 0) === (root.getAttribute('data-verify-error') === 'true') },
] as const;
