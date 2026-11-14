import { spawnSync } from 'node:child_process';
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { composePlan } from '../helpers/engine.ts';
import { copyFixture } from '../helpers/project.ts';

const SHOTS_SCRIPT = resolve(import.meta.dirname, '../../skill/kinotta/scripts/shots.py');
const PYTHON = process.platform === 'win32' ? 'python' : 'python3';
const REEL = 'founder-talk';
const BUILD_TIMEOUT_MS = 60_000;

/** Builds v2 of the footage sample the way the skill answers a section batch: edit that section's clips, compose, shot list last. */
function buildNextVersion(dir: string, editClip: (file: string) => void, changed: string[]): void {
  const v2 = join(dir, 'reels', REEL, 'v2');
  cpSync(join(dir, 'reels', REEL, 'v1'), v2, { recursive: true, filter: (src) => !/shots\.json$|comments.*\.json$|answers\.md$/.test(src) });
  editClip(join(dir, 'motion', 'clips'));
  composePlan(join(dir, 'motion', 'plan.json'), join(v2, 'index.html'));
  const run = spawnSync(PYTHON, [SHOTS_SCRIPT, join(dir, 'motion', 'plan.json'), join(v2, 'shots.json'), ...changed], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(run.stderr);
}

describe('a footage section batch', () => {
  it('a clip whose motion alone changes marks only its section as changed', { timeout: BUILD_TIMEOUT_MS }, async () => {
    const dir = copyFixture('footage-project');
    buildNextVersion(
      dir,
      (clips) => {
        const file = join(clips, '03-last-write-wins.html');
        writeFileSync(file, readFileSync(file, 'utf8').replace("[[1.2,'#B9B2A7']]", "[[0.8,'#B9B2A7']]"));
      },
      ['sync-problem'],
    );

    const v2 = await openProject(dir).readVersion(REEL, 2);

    expect(v2.changedSections).toEqual(['sync-problem']);
    expect(v2.claimMismatch ?? []).toEqual([]);
    expect(v2.issues).toEqual([]);
  });

  it('a rebuild with no edits changes no section', { timeout: BUILD_TIMEOUT_MS }, async () => {
    const dir = copyFixture('footage-project');
    buildNextVersion(dir, () => {}, []);

    const v2 = await openProject(dir).readVersion(REEL, 2);

    expect(v2.changedSections).toEqual([]);
  });
});
