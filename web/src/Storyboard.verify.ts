export const fixtures = [
  { name: 'empty', count: 0, duration: 0, workingParts: false },
  { name: 'frozen-parts', count: 3, duration: 3, workingParts: false },
  { name: 'working-trim', count: 3, duration: 2.5, workingParts: true },
];

export const invariants = [
  { description: 'Storyboard count equals the rendered shot cards', check: (root: Element) => root.getAttribute('data-verify-unit') === 'Storyboard' && Number(root.getAttribute('data-verify-count')) === root.querySelectorAll('.shot').length },
  { description: 'Empty agrees with the rendered shot count', check: (root: Element) => (root.getAttribute('data-verify-empty') === 'true') === (root.querySelectorAll('.shot').length === 0) },
  { description: 'The duration is finite and nonnegative', check: (root: Element) => Number.isFinite(Number(root.getAttribute('data-verify-duration'))) && Number(root.getAttribute('data-verify-duration')) >= 0 },
  { description: 'Working parts stills use the generated Working page', check: (root: Element) => root.getAttribute('data-verify-working-parts') !== 'true' || [...root.querySelectorAll('iframe')].every((frame) => frame.getAttribute('src')?.includes('/working/index.html')) },
];

export const cardFixtures = [
  { name: 'single-page', alternates: 0, choiceMade: false },
  { name: 'three-offered', alternates: 3, choiceMade: false },
  { name: 'chosen', alternates: 3, choiceMade: true },
  { name: 'invalid-selected-revision', description: 'FAIL: selected marker differs from reported revision', fail: true },
];

export const cardInvariants = [
  { description: 'Card count matches alternate markers', check: (root: Element) => root.getAttribute('data-verify-unit') === 'ShotCard' && Number(root.getAttribute('data-verify-count')) === root.querySelectorAll('.shot-alternates i').length },
  { description: 'The selected marker matches the revision in the reel', check: (root: Element) => Number(root.getAttribute('data-verify-count')) === 0 || root.querySelector('.shot-alternates i.on')?.getAttribute('data-alternate-revision') === root.getAttribute('data-verify-selected') },
  { description: 'Only unresolved plural options need a choice', check: (root: Element) => (root.getAttribute('data-verify-needs-choice') === 'true') === (Number(root.getAttribute('data-verify-count')) > 1 && root.getAttribute('data-verify-choice-made') !== 'true') },
];
