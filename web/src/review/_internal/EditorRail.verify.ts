export const fixtures = [
  { name: 'collapsed', description: 'Only the two rail icons show' },
  { name: 'reel', description: 'Reels, sections and versions in the drawer' },
  { name: 'media', description: 'The media drawer instead of Reel' },
  { name: 'inconsistent', description: 'FAIL: the open flag is not boolean', fail: true },
] as const;
export const invariants = [
  { description: 'the unit is named', check: (root: Element) => root.getAttribute('data-verify-unit') === 'EditorRail' },
  { description: 'open is boolean', check: (root: Element) => ['true', 'false'].includes(root.getAttribute('data-verify-open') ?? '') },
  { description: 'tab is known', check: (root: Element) => ['reel', 'media'].includes(root.getAttribute('data-verify-tab') ?? '') },
  { description: 'only one drawer can be visible', check: (root: Element) => root.querySelectorAll('.editor-drawer:not([hidden])').length <= 1 },
] as const;
