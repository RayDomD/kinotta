export const fixtures = [
  { name: 'idle', description: 'Empty prompt: Generate is unavailable' },
  { name: 'ready-to-generate', description: 'A prompt and a valid length enable Generate' },
  { name: 'running', description: 'A generation is running: inputs are locked, Cancel is offered and Generate cannot start another' },
  { name: 'ready', description: 'A finished sound can be played and added on the target track' },
  { name: 'error', description: 'A failed generation shows its reason and can be retried' },
  { name: 'not-installed', description: 'Stable Audio Open is missing: Generate stays unavailable and says why' },
  { name: 'inconsistent', description: 'FAIL: running without a Cancel button', fail: true },
] as const;
export const invariants = [
  { description: 'unit is named', check: (root: Element) => root.getAttribute('data-verify-unit') === 'SoundGenerate' },
  { description: 'status is known', check: (root: Element) => ['idle', 'running', 'ready', 'error'].includes(root.getAttribute('data-verify-status') ?? '') },
  { description: 'loading matches running', check: (root: Element) => (root.getAttribute('data-verify-status') === 'running') === (root.getAttribute('data-verify-loading') === 'true') },
  { description: 'running never allows another generation', check: (root: Element) => root.getAttribute('data-verify-loading') !== 'true' || root.getAttribute('data-verify-can-generate') === 'false' },
  { description: 'Generate agrees with the can-generate flag', check: (root: Element) => { const button = Array.from(root.querySelectorAll('button')).find((b) => b.textContent === 'Generate' || b.textContent === 'Generating…'); return !button || !button.disabled === (root.getAttribute('data-verify-can-generate') === 'true'); } },
  { description: 'running offers Cancel and idle does not', check: (root: Element) => (root.getAttribute('data-verify-status') === 'running') === Array.from(root.querySelectorAll('button')).some((b) => b.textContent === 'Cancel') },
  { description: 'error status shows an alert', check: (root: Element) => root.getAttribute('data-verify-status') !== 'error' || (root.getAttribute('data-verify-error') === 'true' && !!root.querySelector('[role="alert"]')) },
  { description: 'a result exists only when ready', check: (root: Element) => root.getAttribute('data-verify-has-result') !== 'true' || root.getAttribute('data-verify-status') === 'ready' },
  { description: 'a missing install blocks Generate', check: (root: Element) => root.getAttribute('data-verify-installed') !== 'false' || root.getAttribute('data-verify-can-generate') === 'false' },
] as const;
