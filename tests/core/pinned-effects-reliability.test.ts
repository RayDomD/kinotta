import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { openProject, KinottaError } from '../../server/core/index.ts';
import { partsFixture } from '../helpers/parts.ts';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, writeFile: vi.fn(actual.writeFile), rename: vi.fn(actual.rename), readFile: vi.fn(actual.readFile) };
});
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, execFile: vi.fn(actual.execFile) };
});
const actualFs = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
const actualProcess = await vi.importActual<typeof import('node:child_process')>('node:child_process');
afterEach(() => {
  vi.mocked(fs.writeFile).mockImplementation(actualFs.writeFile);
  vi.mocked(fs.rename).mockImplementation(actualFs.rename);
  vi.mocked(fs.readFile).mockImplementation(actualFs.readFile);
  vi.mocked(execFile).mockImplementation(actualProcess.execFile);
});
const pin = { shot: '01', x: 0.5, y: 0.5, element: null };
const RESPONSE_LIMIT_MS = 1500;
function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('pin reliability through the project API', () => {
  it('allows comment reads and edits while an instant build is pending', async () => {
    const { dir } = partsFixture(3, false); const project = openProject(dir);
    await project.buildParts('parts');
    const started = signal();
    const release = signal();
    vi.mocked(execFile).mockImplementation(((...args: unknown[]) => {
      const done = args.pop() as (...result: unknown[]) => void;
      return Reflect.apply(actualProcess.execFile, undefined, [...args, (...result: unknown[]) => {
        started.resolve();
        void release.promise.then(() => done(...result));
      }]);
    }) as typeof execFile);
    const adding = project.addComment('parts', 1, { pin, effect: 'title-card', text: '' });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await started.promise;
      const response = Promise.all([project.listComments('parts', 1), project.setNote('parts', 1, 'Still responsive')]);
      await Promise.race([response, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('The build held the reel lock')), RESPONSE_LIMIT_MS); })]);
      release.resolve();
      expect((await adding).comment.instant).toBe(true);
      expect(await project.readNote('parts', 1)).toBe('Still responsive');
    } finally { clearTimeout(timeout); release.resolve(); await adding.catch(() => {}); await project.close(); }
  });

  it('rolls back an ordinary request if removing the instant copy fails', async () => {
    const { dir, reelDir } = partsFixture(3, false); const project = openProject(dir);
    try {
      await project.buildParts('parts');
      const title = (await project.addComment('parts', 1, { pin, effect: 'title-card', text: '' })).comment;
      vi.mocked(fs.rename).mockImplementation(async (...args) => {
        if (String(args[1]) === join(reelDir, 'edit-list.json')) throw Object.assign(new Error('Working write failed'), { code: 'EIO' });
        return actualFs.rename(...args);
      });
      await expect(project.editComment('parts', 1, title.id, 'Keep this note')).rejects.toThrow('Working write failed');
      vi.mocked(fs.rename).mockImplementation(actualFs.rename);
      const state = JSON.parse(await fs.readFile(join(dir, 'reels/.kinotta/parts/v1.json'), 'utf8'));
      expect(state.comments).toEqual([]);
      expect(await project.listComments('parts', 1)).toEqual([expect.objectContaining({ id: title.id, instant: true, text: '' })]);
      await project.editComment('parts', 1, title.id, 'Keep this note');
      expect(await project.listComments('parts', 1)).toEqual([expect.objectContaining({ id: title.id, text: 'Keep this note' })]);
      expect((await project.readEditList('parts')).operations).toEqual([]);
    } finally { await project.close(); }
  });

  it('reports a missing Python executable as a typed invalid request', async () => {
    const { dir } = partsFixture(3, false); const project = openProject(dir);
    try {
      await project.buildParts('parts');
      vi.mocked(execFile).mockImplementationOnce(((...args: unknown[]) => {
        const done = args.at(-1) as (error: Error) => void;
        queueMicrotask(() => done(Object.assign(new Error('missing python'), { code: 'ENOENT' })));
        return {};
      }) as typeof execFile);
      await expect(project.addComment('parts', 1, { pin, effect: 'title-card', text: '' })).rejects.toMatchObject({ name: 'KinottaError', code: 'invalid', message: expect.stringContaining('not installed') });
      expect(await project.listComments('parts', 1)).toEqual([]);
    } finally { await project.close(); }
  });

  it('reports corrupt captured pins and decisions as typed errors', async () => {
    const { dir, reelDir } = partsFixture(3, false); const project = openProject(dir);
    try {
      await project.buildParts('parts');
      await fs.writeFile(join(reelDir, 'v1/pin-comments.json'), '{ broken');
      await expect(project.listComments('parts', 1)).rejects.toBeInstanceOf(KinottaError);
      await fs.rm(join(reelDir, 'v1/pin-comments.json'));
      await fs.writeFile(join(reelDir, 'pin-note-decisions.json'), '{ broken');
      await expect(project.builtPinNotes('parts')).rejects.toMatchObject({ name: 'KinottaError', code: 'invalid' });
    } finally { await project.close(); }
  });

  it('does not treat unreadable captured pins as an empty store', async () => {
    const { dir } = partsFixture(3, false); const project = openProject(dir);
    try {
      await project.buildParts('parts');
      vi.mocked(fs.readFile).mockImplementation((...args) => {
        if (String(args[0]).endsWith('pin-comments.json')) return Promise.reject(Object.assign(new Error('Permission denied'), { code: 'EACCES' }));
        return actualFs.readFile(...args);
      });
      await expect(project.listComments('parts', 1)).rejects.toMatchObject({ name: 'KinottaError', code: 'invalid', message: expect.stringContaining('Permission denied') });
    } finally { await project.close(); }
  });
});
