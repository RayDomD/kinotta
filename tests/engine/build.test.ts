import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from 'node-html-parser';
import { describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { buildEngineProject } from '../helpers/engine.ts';
import { copyFixture } from '../helpers/project.ts';

const LAUNCHER = resolve(import.meta.dirname, '../../bin/kinotta.mjs');
const REEL = 'opus-drop';
const CLIP_LENGTH = 6.2;
const BUILD_TIMEOUT_MS = 30_000;

function builtProject(): { dir: string; html: ReturnType<typeof parse> } {
  const dir = copyFixture('engine-project');
  buildEngineProject(dir);
  return { dir, html: parse(readFileSync(join(dir, 'reels', REEL, 'v1', 'index.html'), 'utf8')) };
}

describe('engine build', () => {
  it('wraps the clip as one scene timed from 0 to its length', { timeout: BUILD_TIMEOUT_MS }, () => {
    const { html } = builtProject();

    const scenes = html.querySelectorAll('[data-scene]');

    expect(scenes).toHaveLength(1);
    expect(scenes[0].getAttribute('data-scene')).toBe('01-opus-drop');
    expect(Number(scenes[0].getAttribute('data-start'))).toBe(0);
    expect(Number(scenes[0].getAttribute('data-duration'))).toBe(CLIP_LENGTH);
  });

  it('names the shape, the cursor and every part with an id, but not the layer anchors', { timeout: BUILD_TIMEOUT_MS }, () => {
    const { html } = builtProject();

    const names = html.querySelectorAll('[data-el]').map((el) => el.getAttribute('data-el'));

    expect(names).toEqual(expect.arrayContaining(['shape', 'cursor', 'pill', 'badge', 'icSpark', 'icCastle']));
    expect(new Set(names).size).toBe(names.length);
    for (const layer of html.querySelectorAll('.L')) expect(layer.hasAttribute('data-el')).toBe(false);
  });

  it('builds a reel that opens with no contract issues and passes kinotta check', { timeout: BUILD_TIMEOUT_MS }, async () => {
    const { dir } = builtProject();

    const version = await openProject(dir).readVersion(REEL, 1);
    const check = spawnSync(process.execPath, [LAUNCHER, 'check', REEL], { cwd: dir, encoding: 'utf8' });

    expect(version.issues).toEqual([]);
    expect(check.status).toBe(0);
    expect(check.stdout).toContain(`${REEL} v1: no contract issues`);
  });
});
