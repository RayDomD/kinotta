export const fixtures = [
  { name: 'whole', description: 'The whole reel is inside the window' },
  { name: 'zoomed', description: 'A smaller window pans inside the reel' },
  { name: 'outside', description: 'FAIL: the window extends beyond the reel', fail: true },
] as const;
export const invariants = [
  { description: 'unit is named', check: (root: Element) => root.getAttribute('data-verify-unit') === 'TimelineOverview' },
  { description: 'window fits the reel', check: (root: Element) => {
    const total = Number(root.getAttribute('data-verify-total'));
    const start = Number(root.getAttribute('data-verify-start'));
    const length = Number(root.getAttribute('data-verify-length'));
    return Number.isFinite(total) && total > 0 && Number.isFinite(start) && start >= 0 && Number.isFinite(length) && length > 0 && start + length <= total + 0.000001;
  } },
  { description: 'slider reports the visible window start', check: (root: Element) => Number(root.querySelector('[role="slider"]')?.getAttribute('aria-valuenow')) === Number(root.getAttribute('data-verify-start')) },
] as const;
