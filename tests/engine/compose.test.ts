import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse } from 'node-html-parser';
import { describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { buildBrollProject, composePlan, EXAMPLE_PLAN } from '../helpers/engine.ts';
import { copyFixture } from '../helpers/project.ts';

const LAUNCHER = resolve(import.meta.dirname, '../../bin/kinotta.mjs');
const REEL = 'opus-aoe2';
const BUILD_TIMEOUT_MS = 60_000;

interface PlanClip {
  id: string;
  in: number;
  out: number;
  kind: string;
}

const plan = JSON.parse(readFileSync(EXAMPLE_PLAN, 'utf8')) as { duration: number; clips: PlanClip[] };

function builtProject(): { dir: string; html: ReturnType<typeof parse> } {
  const dir = copyFixture('broll-project');
  buildBrollProject(dir);
  return { dir, html: parse(readFileSync(join(dir, 'reels', REEL, 'v1', 'index.html'), 'utf8')) };
}

describe('engine plan build', () => {
  it('makes one scene per clip, at its in-point and as long as its slot', { timeout: BUILD_TIMEOUT_MS }, () => {
    const { html } = builtProject();

    const scenes = html.querySelectorAll('[data-scene]').map((s) => ({
      name: s.getAttribute('data-scene'),
      start: Number(s.getAttribute('data-start')),
      duration: Number(s.getAttribute('data-duration')),
    }));

    expect(scenes.map((s) => s.name)).toEqual(['01-opus-drop', '02-pip-builds', '03-effort-slider', '04-master-prompt', '05-low-vs-max', '06-chapter']);
    for (const [i, clip] of plan.clips.entries()) {
      expect(scenes[i]!.start).toBe(clip.in);
      expect(scenes[i]!.duration).toBeCloseTo(clip.out - clip.in, 6);
    }
  });

  it('names each clip\'s parts inside its own scene', { timeout: BUILD_TIMEOUT_MS }, () => {
    const { html } = builtProject();

    for (const scene of html.querySelectorAll('[data-scene]')) {
      const names = scene.querySelectorAll('[data-el]').map((el) => el.getAttribute('data-el'));
      expect(names).toEqual(expect.arrayContaining(['shape', 'cursor']));
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('the footage sample\'s committed page is what the engine builds from its plan today', { timeout: BUILD_TIMEOUT_MS }, () => {
    const sample = resolve(import.meta.dirname, '../fixtures/projects/footage-project');
    const out = join(mkdtempSync(join(tmpdir(), 'kinotta-sample-')), 'index.html');

    composePlan(join(sample, 'motion', 'plan.json'), out);

    const lf = (file: string): string => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    expect(lf(out) === lf(join(sample, 'reels', 'founder-talk', 'v1', 'index.html')), 'rebuild it: build.py --plan motion/plan.json reels/founder-talk/v1/index.html').toBe(true);
  });

  it('opens as a footage reel with no contract issues and passes kinotta check', { timeout: BUILD_TIMEOUT_MS }, async () => {
    const { dir } = builtProject();

    const version = await openProject(dir).readVersion(REEL, 1);
    const check = spawnSync(process.execPath, [LAUNCHER, 'check', REEL], { cwd: dir, encoding: 'utf8' });

    expect(version.footage).toEqual({ path: 'media/source.mp4', exists: true });
    expect(version.issues).toEqual([]);
    expect(check.stdout).toContain(`${REEL} v1: no contract issues`);
    expect(check.status).toBe(0);
  });
});
