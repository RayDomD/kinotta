export const fixtures = [
  { name: 'empty', description: 'Empty sequence with an empty sound track' },
  { name: 'placed', description: 'Footage and independent sound in their lanes' },
  { name: 'selected', description: 'The selected placement has highlighted bars' },
  { name: 'broken-attachment', description: 'A lost attachment retains a visible Reattach bar without invalid editing handles' },
  { name: 'missing-selection', description: 'FAIL: selected placement has no bar', fail: true },
] as const;

export const invariants = [
  { description: 'unit is named', check: (root: Element) => root.getAttribute('data-verify-unit') === 'NativeLanes' },
  { description: 'placement count is a nonnegative integer', check: (root: Element) => /^(0|[1-9]\d*)$/.test(root.getAttribute('data-verify-count') ?? '') },
  { description: 'the timeline window has a nonnegative start and positive length', check: (root: Element) => Number.isFinite(Number(root.getAttribute('data-verify-window-start'))) && Number(root.getAttribute('data-verify-window-start')) >= 0 && Number(root.getAttribute('data-verify-window-length')) > 0 },
  { description: 'selection names a highlighted bar', check: (root: Element) => {
    const selected = root.getAttribute('data-verify-selected');
    return !selected || Array.from(root.querySelectorAll('[data-placement]')).some((bar) => bar.getAttribute('data-placement') === selected && bar.getAttribute('aria-pressed') === 'true');
  } },
  { description: 'broken placements retain repair markers without trim or envelope controls', check: (root: Element) => [...root.querySelectorAll('[data-verify-broken-placement="true"]')].every((bar) => bar.textContent?.includes('Reattach') && !bar.querySelector('.native-trim, .native-volume, .native-fade') && Number.parseFloat((bar as HTMLElement).style.width) > 0) },
] as const;
