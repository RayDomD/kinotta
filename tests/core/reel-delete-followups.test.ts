import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openProject, type Project } from '../../server/core/index.ts';
import { deleteReel, sweepStaleDeleteStages } from '../../server/core/_internal/delete.ts';
import { hashOf } from '../../server/core/_internal/import.ts';
import { copyFixture, emptyProject } from '../helpers/project.ts';

const projects: Project[] = [];
afterEach(async () => { for (const project of projects.splice(0)) await project.close(); });
function open(dir: string): Project {
  const project = openProject(dir);
  projects.push(project);
  return project;
}

describe('reel delete follow-ups (#137)', () => {
  it('F1: counts the newest version as a dependent of the plan provider', async () => {
    const dir = copyFixture('footage-project');
    const reelDir = join(dir, 'reels', 'founder-talk');
    cpSync(join(reelDir, 'v1'), join(reelDir, 'v2'), { recursive: true });
    cpSync(join(dir, 'motion', 'plan.json'), join(reelDir, 'v1', 'plan.json'));
    await expect(open(dir).deleteVersion('founder-talk', 1)).rejects.toMatchObject({ code: 'frozen', message: expect.stringMatching(/v2.*inherit/i) });
    expect(existsSync(join(reelDir, 'v1'))).toBe(true);
  });

  it('F3: sweeps an old staging folder and keeps a recent one', async () => {
    const dir = copyFixture('footage-project');
    const old = join(dir, '.delete-11111111-1111-4111-8111-111111111111');
    const recent = join(dir, '.delete-22222222-2222-4222-8222-222222222222');
    const other = join(dir, '.delete-not-ours');
    for (const folder of [old, recent, other]) { mkdirSync(folder); writeFileSync(join(folder, '0'), 'x'); }
    const aged = new Date(Date.now() - 2 * 60 * 60 * 1000);
    utimesSync(old, aged, aged);
    utimesSync(other, aged, aged);
    await sweepStaleDeleteStages(dir);
    expect(existsSync(old)).toBe(false);
    expect(existsSync(recent)).toBe(true);
    expect(existsSync(other)).toBe(true);
  });

  it.each([
    { preservationFails: false, name: 'keeps the only copy after a stuck rollback even when the stage is two hours old' },
    { preservationFails: true, name: 'reports the original kept folder and cleanup risk when the preservation rename also fails' },
  ])('$name', async ({ preservationFails }) => {
    const dir = emptyProject();
    const reel = join(dir, 'reels', 'victim');
    const output = join(dir, 'output', 'victim');
    mkdirSync(join(reel, 'v1'), { recursive: true });
    writeFileSync(join(reel, 'v1', 'precious.txt'), 'only copy');
    mkdirSync(output, { recursive: true });
    writeFileSync(join(output, 'render.txt'), 'render');
    const rename = fs.rename;
    fs.rename = async (from, to) => {
      if (String(from) === output || String(to) === reel || (preservationFails && String(to).endsWith('-kept'))) {
        throw Object.assign(new Error('injected move or rollback failure'), { code: 'EIO' });
      }
      return rename(from, to);
    };
    syncBuiltinESMExports();
    let error: unknown;
    try { await deleteReel(dir, 'victim', 'other', async () => {}); }
    catch (caught) { error = caught; }
    finally { fs.rename = rename; syncBuiltinESMExports(); }
    const stages = readdirSync(dir).filter((name) => name.startsWith('.delete-'));
    expect(stages).toHaveLength(1);
    const stage = join(dir, stages[0]!);
    expect(error).toMatchObject({ code: 'invalid', message: expect.stringContaining(relative(dir, stage)) });
    expect(existsSync(reel)).toBe(false);
    const original = join(stage, '0', 'v1', 'precious.txt');
    expect(readFileSync(original, 'utf8')).toBe('only copy');
    if (preservationFails) {
      expect(stages[0]).toMatch(/^\.delete-[0-9a-f-]{36}$/);
      expect(error).toMatchObject({ message: expect.stringContaining('Could not protect this folder from automatic cleanup') });
      return;
    }
    expect(stages[0]).toMatch(/-kept$/);
    const aged = new Date(Date.now() - 2 * 60 * 60 * 1000);
    utimesSync(stage, aged, aged);
    await sweepStaleDeleteStages(dir);
    expect(existsSync(original)).toBe(true);
    expect(readFileSync(original, 'utf8')).toBe('only copy');
  });

  it('cost: a delete-time hash reads a stored hash and writes none', async () => {
    const dir = copyFixture('footage-project');
    const kept = join(dir, 'kept.bin');
    const probed = join(dir, 'probed.bin');
    writeFileSync(kept, 'kept');
    writeFileSync(probed, 'probed');
    const folder = join(dir, 'footage', '.playback', '.hashes');
    await hashOf(kept, dir);
    expect(await hashOf(probed, dir, false)).toMatch(/^[a-f0-9]{64}$/);
    const stored = readdirSync(folder);
    expect(stored).toHaveLength(1);
    const record = JSON.parse(readFileSync(join(folder, stored[0]!), 'utf8'));
    const planted = 'a'.repeat(64);
    writeFileSync(join(folder, stored[0]!), JSON.stringify({ ...record, hash: planted }));
    // A new module instance has an empty in-memory memo, so only the stored file can answer.
    vi.resetModules();
    const fresh = await import('../../server/core/_internal/import.ts');
    expect(await fresh.hashOf(kept, dir, false)).toBe(planted);
  });
});
