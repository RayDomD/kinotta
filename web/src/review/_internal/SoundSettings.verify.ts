export const fixtures = [
  { name: 'empty', description: 'No selected audio clip' },
  { name: 'busy', description: 'Applying an edit disables Apply' },
  { name: 'ready', description: 'Selected music with overlapping transcribed speech' },
  { name: 'unavailable', description: 'No overlapping words or a read-only version' },
  { name: 'error', description: 'Invalid ramp or rejected edit shows its reason' },
  { name: 'inconsistent', description: 'FAIL: Apply enabled while busy', fail: true },
] as const;
export const invariants = [
  { description: 'unit is named', check: (root: Element) => root.getAttribute('data-verify-unit') === 'SoundSettings' },
  { description: 'empty matches selected count', check: (root: Element) => (root.getAttribute('data-verify-empty') === 'true') === (root.getAttribute('data-verify-count') === '0') },
  { description: 'status is known', check: (root: Element) => ['empty', 'busy', 'ready', 'unavailable', 'error'].includes(root.getAttribute('data-verify-status') ?? '') },
  { description: 'busy never enables Apply', check: (root: Element) => root.getAttribute('data-verify-loading') !== 'true' || root.getAttribute('data-verify-can-apply') === 'false' },
  { description: 'error status matches error flag', check: (root: Element) => (root.getAttribute('data-verify-status') === 'error') === (root.getAttribute('data-verify-error') === 'true') },
  { description: 'Apply agrees with available state', check: (root: Element) => { const button = Array.from(root.querySelectorAll('button')).find((b) => b.textContent === 'Apply ducking'); return !button || !button.disabled === (root.getAttribute('data-verify-can-apply') === 'true'); } },
] as const;
