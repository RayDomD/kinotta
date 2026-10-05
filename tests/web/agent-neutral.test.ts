import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE_DIRS = ['web/src', 'server'].map((dir) => resolve(import.meta.dirname, '../..', dir));
const AGENT_NAMES = /claude|codex|gemini|chatgpt|copilot/i;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sources(path);
    return /\.(tsx?|css|html)$/.test(name) ? [path] : [];
  });
}

describe('app wording names no particular agent (E20)', () => {
  it('has no agent name anywhere in the web or server source', () => {
    const hits = SOURCE_DIRS.flatMap(sources).flatMap((file) =>
      readFileSync(file, 'utf8').split('\n').flatMap((line, i) => (AGENT_NAMES.test(line) ? [`${file}:${i + 1}: ${line.trim()}`] : [])),
    );

    expect(hits).toEqual([]);
  });
});
