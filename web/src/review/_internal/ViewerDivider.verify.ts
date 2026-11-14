export const fixtures = [
  { name: 'default', description: 'Picture share starts at 55 percent' },
  { name: 'maximum', description: 'Picture share is bounded at 80 percent' },
  { name: 'out-of-range', description: 'FAIL: picture share is below the allowed minimum', fail: true },
] as const;
export const invariants = [
  { description: 'divider is keyboard reachable and horizontal', check: (root: Element) => root.getAttribute('role') === 'separator' && root.getAttribute('tabindex') === '0' && root.getAttribute('aria-orientation') === 'horizontal' },
  { description: 'divider stays between 25 and 80 percent', check: (root: Element) => { const share = Number(root.getAttribute('aria-valuenow')); return Number.isFinite(share) && share >= 25 && share <= 80; } },
] as const;
