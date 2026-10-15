export const fixtures = [
  { name: 'working', description: 'Render Working with no save choice' },
  { name: 'frozen', description: 'Render an explicit frozen version' },
  { name: 'busy', description: 'Approval request pending' },
  { name: 'invalid-working', description: 'FAIL: Working still asks which saved content to render', fail: true },
] as const;

export const invariants = [
  { description: 'the unit is named', check: (root: Element) => root.getAttribute('data-verify-unit') === 'VersionActions' },
  { description: 'Working is a boolean', check: (root: Element) => ['true', 'false'].includes(root.getAttribute('data-verify-working') ?? '') },
  { description: 'working renders have no Save choice', check: (root: Element) => root.getAttribute('data-verify-working') !== 'true' || !root.querySelector('.pk-base') },
] as const;
