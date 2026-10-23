import { vi } from 'vitest';

// Redirect only the packaged catalogue root: keep real HTTP, media import and render paths.
// The pending generator's files are owned by another lane and are never modified by tests.
vi.mock('node:path', async (importOriginal) => {
  const paths = await importOriginal<typeof import('node:path')>();
  return {
    ...paths,
    resolve: (...parts: string[]) => parts.at(-1) === '../../../skill/kinotta/assets/sfx-synth'
      ? paths.resolve('tests/fixtures/sfx-synth')
      : paths.resolve(...parts),
  };
});
