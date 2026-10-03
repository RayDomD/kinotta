import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { copyFixture } from '../helpers/project.ts';

const LAUNCHER = resolve(import.meta.dirname, '../../bin/kinotta.mjs');
const CHECK_TIMEOUT_MS = 20_000;

function check(projectDir: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const run = spawnSync(process.execPath, [LAUNCHER, 'check', ...args], { cwd: projectDir, encoding: 'utf8', timeout: CHECK_TIMEOUT_MS });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

describe('kinotta check', () => {
  it('passes a clean version and checks the newest by default', () => {
    const dir = copyFixture('showreel-project');

    const run = check(dir, ['product-showreel']);

    expect(run.status).toBe(0);
    expect(run.stdout).toContain('product-showreel v2: no contract issues');
  });

  it('checks the version asked for, as a number or as v<n>', () => {
    const dir = copyFixture('showreel-project');

    expect(check(dir, ['product-showreel', '1']).stdout).toContain('product-showreel v1: no contract issues');
    expect(check(dir, ['product-showreel', 'v1']).stdout).toContain('product-showreel v1: no contract issues');
  });

  it('prints each issue on its own line and exits non-zero', () => {
    const dir = copyFixture('broken-project');

    const run = check(dir, ['launch-teaser']);
    const lines = run.stdout.trim().split('\n');

    expect(run.status).toBe(1);
    expect(lines[0]).toMatch(/^launch-teaser v1: \d+ contract issues?$/);
    expect(lines.length).toBeGreaterThan(1);
    expect(run.stdout).toContain('scene-gap');
    expect(run.stdout).toContain('shot-field');
  });

  it('exits non-zero with a readable message for an unknown reel or version', () => {
    const dir = copyFixture('showreel-project');

    const reel = check(dir, ['no-such-reel']);
    const version = check(dir, ['product-showreel', '9']);

    expect(reel.status).toBe(1);
    expect(reel.stderr).toContain('Reel "no-such-reel" not found.');
    expect(version.status).toBe(1);
    expect(version.stderr).toContain('Version 9');
  });

  it('asks for a reel when none is given', () => {
    const run = check(copyFixture('showreel-project'), []);

    expect(run.status).toBe(1);
    expect(run.stderr).toContain('Usage: kinotta check <reel> [version]');
  });
});
