import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '../..');
const SOURCE_DIRS = ['web/src', 'server'].map((dir) => resolve(REPO_ROOT, dir));
const AGENT_NAMES = /claude|codex|gemini|chatgpt|copilot/i;

// Explicitly allowed files for agent settings, runners, jobs, and settings UI (Phase 5a, 14a)
const ALLOWED_FILES = new Set([
  'server/core/_internal/agent-jobs.ts',
  'server/core/_internal/agent-settings.ts',
  'server/core/_internal/runner.ts',
  'web/src/SimpleMode.tsx',
  'web/src/api/_internal/client.ts',
]);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sources(path);
    return /\.(tsx?|css|html)$/.test(name) ? [path] : [];
  });
}

function relPath(file: string): string {
  return relative(REPO_ROOT, file).replace(/\\/g, '/');
}

describe('app wording names no particular agent (E20)', () => {
  it('has no agent name in web or server source outside allowed settings/runner/job files', () => {
    const hits = SOURCE_DIRS.flatMap(sources)
      .filter((file) => !ALLOWED_FILES.has(relPath(file)))
      .flatMap((file) =>
        readFileSync(file, 'utf8')
          .split('\n')
          .flatMap((line, i) => (AGENT_NAMES.test(line) ? [`${relPath(file)}:${i + 1}: ${line.trim()}`] : [])),
      );

    expect(hits).toEqual([]);
  });

  it('keeps handoff and copied request wording strictly agent-neutral', () => {
    const handoffFiles = [
      'server/core/_internal/requests.ts',
      'server/core/_internal/handoff.ts',
    ].map((f) => resolve(REPO_ROOT, f));

    const hits = handoffFiles.flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, i) => (AGENT_NAMES.test(line) ? [`${relPath(file)}:${i + 1}: ${line.trim()}`] : [])),
    );

    expect(hits).toEqual([]);
  });

  it('allows agent names in the settings UI only for explicit provider options, never copy-request copy', () => {
    const simpleModePath = resolve(REPO_ROOT, 'web/src/SimpleMode.tsx');
    const lines = readFileSync(simpleModePath, 'utf8').split('\n');

    // Any agent name mention in the UI must only be inside provider dropdown options
    const invalidHits = lines.flatMap((line, i) => {
      if (!AGENT_NAMES.test(line)) return [];
      if (/<option value="(claude|codex)">/.test(line)) return [];
      return [`SimpleMode.tsx:${i + 1}: ${line.trim()}`];
    });
    expect(invalidHits).toEqual([]);

    // Explicitly ensure copy-request UI strings do not mention specific agent names
    const copyUiHits = lines.flatMap((line, i) => {
      if (/copy/i.test(line) && AGENT_NAMES.test(line)) {
        return [`SimpleMode.tsx:${i + 1}: ${line.trim()}`];
      }
      return [];
    });
    expect(copyUiHits).toEqual([]);
  });
});
