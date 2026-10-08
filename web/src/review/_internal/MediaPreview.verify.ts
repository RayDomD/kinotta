export const fixtures = [
  { name: 'image', description: 'A still fills the shared frame' },
  { name: 'sound', description: 'A source audition has its own controls' },
  { name: 'video', description: 'A video preview fills the shared frame' },
  { name: 'failed', description: 'A failed preview offers a direct retry' },
  { name: 'unknown', description: 'FAIL: preview kind is unknown', fail: true },
] as const;
export const invariants = [
  { description: 'unit is named', check: (root: Element) => root.getAttribute('data-verify-unit') === 'MediaPreview' },
  { description: 'kind is known', check: (root: Element) => ['video', 'image', 'audio'].includes(root.getAttribute('data-verify-kind') ?? '') },
  { description: 'source identity is present', check: (root: Element) => !!root.getAttribute('data-verify-id') },
  { description: 'error is boolean', check: (root: Element) => ['true', 'false'].includes(root.getAttribute('data-verify-error') ?? '') },
  { description: 'failure has a notice and retry', check: (root: Element) => root.getAttribute('data-verify-error') === 'true' ? !!root.querySelector('[role="alert"] button') : !root.querySelector('[role="alert"]') },
] as const;
