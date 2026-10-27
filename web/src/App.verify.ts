export const fixtures = [
  { name: 'empty', description: 'Working with no edits' },
  { name: 'working', description: 'Working selected above saved versions' },
  { name: 'frozen', description: 'A saved version selected' },
  { name: 'invalid-selection', description: 'FAIL: Working and a saved version both selected', fail: true },
] as const;

export const topBarFixtures = [
  { name: 'empty', choices: 0 },
  { name: 'choice-needed', choices: 1 },
  { name: 'several-choices', choices: 2 },
  { name: 'invalid-choice-count', description: 'FAIL: reminder count differs from reported state', fail: true },
];

export const topBarInvariants = [
  { description: 'The reminder uses the reported nonnegative count', check: (root: Element) => {
    const count = Number(root.getAttribute('data-verify-choice-count'));
    const reminder = root.querySelector('[aria-label="Shots needing a choice"]');
    return root.getAttribute('data-verify-unit') === 'TopBar' && Number.isInteger(count) && count >= 0 && (count === 0 ? reminder === null : reminder?.textContent?.startsWith(`${count} `) === true);
  } },
];

export const invariants = [
  { description: 'the unit is named', check: (root: Element) => root.getAttribute('data-verify-unit') === 'VersionRail' },
  { description: 'exactly one row is selected', check: (root: Element) => root.querySelectorAll('button[aria-current="true"]').length === 1 },
  { description: 'Working reports its real selection', check: (root: Element) => (root.querySelector('[data-working-row]')?.getAttribute('aria-current') === 'true') === (root.getAttribute('data-verify-working') === 'true') },
  { description: 'saved version count matches rows', check: (root: Element) => root.querySelectorAll('[data-version]').length === Number(root.getAttribute('data-verify-count')) },
] as const;
