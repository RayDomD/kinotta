import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { copyFixture, emptyProject } from '../helpers/project.ts';

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

  it('checks the project given with --project, from any folder', () => {
    const dir = copyFixture('showreel-project');

    const run = check(emptyProject(), ['product-showreel', '--project', dir]);

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

describe('kinotta check on a footage reel', () => {
  const REEL = 'founder-talk';
  const reelPath = (dir: string, ...parts: string[]): string => join(dir, 'reels', REEL, ...parts);

  /** Rewrites one shot of the footage sample's v1 shot list. */
  function editShot(dir: string, number: string, edit: (shot: Record<string, unknown>) => void): void {
    const file = reelPath(dir, 'v1', 'shots.json');
    const shots = JSON.parse(readFileSync(file, 'utf8')) as { shots: Record<string, unknown>[] };
    edit(shots.shots.find((s) => s.number === number)!);
    writeFileSync(file, JSON.stringify(shots));
  }

  /** The issue lines of a run, after the summary line. */
  const issueLines = (stdout: string): string[] => stdout.trim().split('\n').slice(1);

  it('passes the footage sample', () => {
    const run = check(copyFixture('footage-project'), [REEL]);

    expect(run.status).toBe(0);
    expect(run.stdout).toContain(`${REEL} v1: no contract issues`);
  });

  it('reports a missing footage file', () => {
    const dir = copyFixture('footage-project');
    rmSync(join(dir, 'media', 'talk.mp4'));

    const run = check(dir, [REEL]);

    expect(run.status).toBe(1);
    expect(issueLines(run.stdout)).toEqual(['  footage file media/talk.mp4 not found [footage-missing]']);
  });

  it('reports a missing transcript', () => {
    const dir = copyFixture('footage-project');
    rmSync(reelPath(dir, 'transcript.json'));

    const run = check(dir, [REEL]);

    expect(run.status).toBe(1);
    expect(issueLines(run.stdout)).toEqual([expect.stringMatching(/no transcript\.json.*\[transcript\]$/)]);
  });

  it('reports an unreadable transcript', () => {
    const dir = copyFixture('footage-project');
    writeFileSync(reelPath(dir, 'transcript.json'), '{ "words": [ { "text": "hi" } ] }');

    const run = check(dir, [REEL]);

    expect(run.status).toBe(1);
    expect(issueLines(run.stdout)).toEqual([expect.stringMatching(/transcript\.json is not valid.*\[transcript\]$/)]);
  });

  it('reports a shot with no type', () => {
    const dir = copyFixture('footage-project');
    editShot(dir, '02', (shot) => delete shot.type);

    const run = check(dir, [REEL]);

    expect(run.status).toBe(1);
    expect(issueLines(run.stdout)).toEqual(['  shots.json: shot 02 has no type (cutaway or panel) [shot-type]']);
  });

  it('reports a shot with no spoken line, whether it has no line or its line holds no words', () => {
    const dir = copyFixture('footage-project');
    editShot(dir, '01', (shot) => delete shot.line);
    editShot(dir, '03', (shot) => (shot.line = { start: 20, end: 21 }));

    const run = check(dir, [REEL]);

    expect(run.status).toBe(1);
    expect(issueLines(run.stdout)).toEqual([
      '  shots.json: shot 01 has no spoken line [no-spoken-line]',
      '  shots.json: shot 03 has no spoken line [no-spoken-line]',
    ]);
  });

  it('lists footage problems after the timing contract issues', () => {
    const dir = copyFixture('footage-project');
    editShot(dir, '02', (shot) => delete shot.title);
    rmSync(join(dir, 'media', 'talk.mp4'));

    const lines = issueLines(check(dir, [REEL]).stdout);

    expect(lines.map((l) => l.match(/\[(.+)\]$/)?.[1])).toEqual(['shot-field', 'footage-missing']);
  });
});
