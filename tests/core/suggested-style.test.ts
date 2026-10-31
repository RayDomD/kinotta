// Plan: docs/plans/2026-10-31-style-from-examples.md, step 4.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { startServer } from '../../server/main.ts';

let dir: string;
const suggestion = (id = 'fast-talk', changes: Record<string, unknown> = {}) => ({
  style: { id, name: 'Fast talk', scope: 'project', basedOn: 'creator', settings: { pace: 'fast', captions: 'word-by-word' }, yours: ['pace'], effects: [], rules: ['Hard cuts every 2–3 s (refs 1, 2)', 'Captions six words at most (refs 1, 2, 3)'] },
  references: ['refs/a.mp4', 'refs/b.mp4', 'refs/c.mp4'],
  measured: { summary: { shotsPerMinute: { median: 24 } } },
  suggestedBy: 'claude',
  ...changes,
});

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kinotta-suggest-'));
  vi.stubEnv('KINOTTA_HOME', join(dir, 'home'));
  await mkdir(join(dir, 'reels'), { recursive: true });
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true }); });

describe('suggested styles', () => {
  it('waits outside the style list until kept, then is an ordinary project style, as edited', async () => {
    const project = openProject(dir);
    await project.suggestStyle(suggestion());
    expect((await project.listSuggestedStyles()).map((s) => s.style.id)).toEqual(['fast-talk']);
    expect((await project.listStyles()).styles.some((s) => s.id === 'fast-talk')).toBe(false);

    const edited = { ...suggestion().style, rules: ['Hard cuts every 2–3 s (refs 1, 2)'] };
    const kept = await project.keepSuggestedStyle('fast-talk', edited);
    expect(kept.rules).toEqual(['Hard cuts every 2–3 s (refs 1, 2)']);
    expect((await project.listStyles()).styles.find((s) => s.id === 'fast-talk')).toMatchObject({ scope: 'project', rules: kept.rules });
    expect(await project.listSuggestedStyles()).toEqual([]);
  });

  it('discards a suggestion without keeping anything', async () => {
    const project = openProject(dir);
    await project.suggestStyle(suggestion());
    await project.discardSuggestedStyle('fast-talk');
    expect(await project.listSuggestedStyles()).toEqual([]);
    expect((await project.listStyles()).styles.some((s) => s.id === 'fast-talk')).toBe(false);
    await expect(project.discardSuggestedStyle('fast-talk')).rejects.toMatchObject({ code: 'not-found' });
  });

  it('refuses a suggestion that is not a project style, has no rules or references, names no agent, or takes a used id', async () => {
    const project = openProject(dir);
    const bad = [
      suggestion('a', { style: { ...suggestion().style, scope: 'user' } }),
      suggestion('b', { style: { ...suggestion().style, id: 'b', rules: [] } }),
      suggestion('c', { references: [] }),
      suggestion('d', { suggestedBy: 'Claude Code' }),
      suggestion('clean'),
    ];
    for (const input of bad) await expect(project.suggestStyle(input)).rejects.toMatchObject({ code: 'invalid' });
    await project.suggestStyle(suggestion());
    await expect(project.keepSuggestedStyle('fast-talk', { ...suggestion().style, id: 'other' })).rejects.toThrow('under its own id');
  });

  it('is listed, kept and discarded over HTTP', async () => {
    const server = await startServer({ projectDir: dir, port: 0 });
    try {
      await server.project.suggestStyle(suggestion());
      await server.project.suggestStyle(suggestion('slow-talk'));
      const listed = await (await fetch(`${server.url}/api/styles/suggested`)).json();
      expect(listed.suggested.map((s: { style: { id: string } }) => s.style.id)).toEqual(['fast-talk', 'slow-talk']);
      const kept = await fetch(`${server.url}/api/styles/suggested/fast-talk/keep`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) });
      expect(kept.status).toBe(200);
      expect((await fetch(`${server.url}/api/styles/suggested/slow-talk`, { method: 'DELETE' })).status).toBe(200);
      expect((await (await fetch(`${server.url}/api/styles/suggested`)).json()).suggested).toEqual([]);
    } finally { await server.close(); }
  });

  it('is recorded by the agent through the kinotta command', async () => {
    const file = join(dir, 'suggestion.json');
    await writeFile(file, JSON.stringify(suggestion()));
    const run = spawnSync(process.execPath, [resolve(import.meta.dirname, '../../bin/kinotta.mjs'), 'style', 'suggest', file, '--project', dir], { encoding: 'utf8', env: { ...process.env, KINOTTA_HOME: join(dir, 'home') } });
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain('waiting on the Direction screen');
    expect(existsSync(join(dir, 'reels', 'styles', '.suggested', 'fast-talk.json'))).toBe(true);
  });
});
