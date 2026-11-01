import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { expect, it } from 'vitest';

// Exact paths only; remove each migration exception when its file moves to tempDir.
const EXCEPTIONS: Record<string, string> = {
  'tests/e2e/start-server.mjs': 'plain Node server owns and removes its project and home folders',
  'tests/e2e/agent-confirm.spec.ts': 'to be moved to tempDir',
  'tests/e2e/agent-strip.spec.ts': 'to be moved to tempDir',
  'tests/e2e/copy-round-trip.spec.ts': 'to be moved to tempDir',
  'tests/e2e/direction.spec.ts': 'to be moved to tempDir',
  'tests/e2e/drop-video.spec.ts': 'to be moved to tempDir',
  'tests/e2e/engine-compose.spec.ts': 'to be moved to tempDir',
  'tests/e2e/simple-mode.spec.ts': 'to be moved to tempDir',
  'tests/e2e/top-bar.spec.ts': 'to be moved to tempDir',
  'tests/helpers/engine.ts': 'to be moved to tempDir',
  'tests/web/browser.ts': 'to be moved to tempDir',
};

it('creates test temp directories through the run-owned helper', () => {
  const root = resolve(import.meta.dirname, '../..');
  const violations: string[] = [];
  function scan(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) scan(path);
      else if (/\.(?:[cm]?[jt]sx?)$/.test(entry.name)) {
        const file = relative(root, path).split(sep).join('/');
        if (file === 'tests/helpers/temp.ts' || EXCEPTIONS[file]) continue;
        // Assemble the token so this guard does not match its own source.
        const bareTemp = new RegExp('\\b' + 'mkd' + 'temp(?:Sync)?\\b');
        readFileSync(path, 'utf8').split(/\r?\n/).forEach((line, index) => {
          if (bareTemp.test(line)) violations.push(`${file}:${index + 1}`);
        });
      }
    }
  }
  scan(join(root, 'tests'));
  expect(violations, `Use tempDir instead of bare temp creation:\n${violations.join('\n')}`).toEqual([]);
});
