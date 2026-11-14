export const fixtures = [
  { name: 'collapsed', description: 'Neutral dark with the rail closed' },
  { name: 'media', description: 'Media rail open' },
  { name: 'light', description: 'Light theme and a saved accent' },
  { name: 'inconsistent', description: 'FAIL: an invalid rail-open flag', fail: true },
] as const;
export const invariants = [
  { description: 'the unit is named', check: (root: Element) => root.getAttribute('data-verify-unit') === 'EditorWorkspace' },
  { description: 'theme is known', check: (root: Element) => ['dark', 'light'].includes(root.getAttribute('data-verify-theme') ?? '') },
  { description: 'rail-open is boolean', check: (root: Element) => ['true', 'false'].includes(root.getAttribute('data-verify-rail-open') ?? '') },
  { description: 'rail tab is known', check: (root: Element) => ['reel', 'media'].includes(root.getAttribute('data-verify-rail-tab') ?? '') },
  { description: 'settings-open is boolean', check: (root: Element) => ['true', 'false'].includes(root.getAttribute('data-verify-settings-open') ?? '') },
] as const;
