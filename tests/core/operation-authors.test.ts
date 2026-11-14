import { execFile } from 'node:child_process';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { startServer } from '../../server/main.ts';
import { copyFixture } from '../helpers/project.ts';

const run = promisify(execFile);
const REEL = 'product-showreel';
const OPERATION = { kind: 'element-offset' as const, clip: 'cube-lands', element: 'cube', x: 10, y: 0, scale: 1 };

describe('operation authors', () => {
  it('records editor operations as you and named agent operations durably, with undo', async () => {
    const dir = copyFixture('showreel-project');
    const project = openProject(dir);
    expect((await project.addOperation(REEL, OPERATION)).operations[0]?.by).toBe('you');
    const agent = await project.addOperation(REEL, { ...OPERATION, by: 'Claude', x: 20 });
    expect(agent.operations[1]?.by).toBe('Claude');
    expect((await openProject(dir).readEditList(REEL)).operations[1]?.by).toBe('Claude');
    expect((await project.undoEdit(REEL)).operations.map((op) => op.by)).toEqual(['you']);
    expect((await project.redoEdit(REEL)).operations[1]?.by).toBe('Claude');
  });

  it('records HTTP agent operations under the supplied name and refuses an empty author', async () => {
    const server = await startServer({ projectDir: copyFixture('showreel-project'), port: 0 });
    try {
      const url = `${server.url}/api/reels/${REEL}/edits`;
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...OPERATION, by: 'Codex' }) });
      expect(response.status).toBe(201);
      expect((await response.json()).operations[0].by).toBe('Codex');
      const invalid = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...OPERATION, by: '' }) });
      expect(invalid.status).toBe(422);
    } finally { await server.close(); }
  });

  it('adds one named agent operation through kinotta edit without building a version', async () => {
    const dir = copyFixture('showreel-project');
    const command = resolve(import.meta.dirname, '../../bin/kinotta.mjs');
    const { stdout } = await run(process.execPath, [command, 'edit', REEL, '--by', 'Codex', JSON.stringify(OPERATION), '--project', dir]);
    const list = await openProject(dir).readEditList(REEL);
    expect(list.operations).toMatchObject([{ by: 'Codex', kind: 'element-offset' }]);
    expect(JSON.parse(stdout).operations).toEqual(list.operations);
    expect((await openProject(dir).listVersions(REEL)).map((v) => v.number)).toEqual([1, 2]);
  });

  it('offers no manual Save endpoint and keeps live operations in Working', async () => {
    const server = await startServer({ projectDir: copyFixture('showreel-project'), port: 0 });
    try {
      await server.project.addOperation(REEL, OPERATION);
      expect((await fetch(`${server.url}/api/reels/${REEL}/save`, { method: 'POST' })).status).toBe(405);
      expect((await server.project.readEditList(REEL)).operations).toHaveLength(1);
      expect((await server.project.listVersions(REEL)).map((version) => version.number)).toEqual([1, 2]);
    } finally { await server.close(); }
  });
});
