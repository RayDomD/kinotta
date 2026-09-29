/** The one line that says why a version cannot take comments. */
export const readOnlyNote = (version: number, newest: number): string =>
  `v${version} is read-only. Only the newest version, v${newest}, takes comments.`;
