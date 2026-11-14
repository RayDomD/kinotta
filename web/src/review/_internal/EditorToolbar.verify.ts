export const fixtures = [
  { name: 'select', description: 'Select active, icons only' },
  { name: 'blade', description: 'Blade active with visible labels' },
  { name: 'snip', description: 'Snip active with snap disabled' },
  { name: 'invalid-tool', description: 'FAIL: tool is not in the registry', fail: true },
] as const;
export const invariants = [
  { description: 'unit is named', check: (root: Element) => root.getAttribute('data-verify-unit') === 'EditorToolbar' },
  { description: 'tool is known', check: (root: Element) => ['select', 'blade', 'snip'].includes(root.getAttribute('data-verify-tool') ?? '') },
  { description: 'layout and snap flags are boolean', check: (root: Element) => ['data-verify-labels', 'data-verify-snap'].every((name) => ['true', 'false'].includes(root.getAttribute(name) ?? '')) },
  { description: 'one tool is pressed', check: (root: Element) => Array.from(root.querySelectorAll('button[aria-pressed="true"]')).filter((button) => ['Select', 'Blade', 'Snip'].includes(button.getAttribute('aria-label') ?? '')).length === 1 },
] as const;
