import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { openProject, type Project } from '../../server/core/index.ts';
import { alternatesFixture } from '../helpers/parts.ts';

// Browser/encoder boundary: keep the real project preparation and queue, without launching media processes.
vi.mock('../../server/core/_internal/runner.ts', async (actual) => ({
  ...await actual<typeof import('../../server/core/_internal/runner.ts')>(),
  pageInfo: async () => ({ width: 1920, height: 1080, duration: 3, alpha: false }),
  renderPage: async (_input: unknown, _report: unknown, signal: AbortSignal) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('Render cancelled')), { once: true });
    if (signal.aborted) reject(new Error('Render cancelled'));
  }),
}));

const projects: Project[] = [];
afterEach(async () => {
  for (const project of projects.splice(0)) {
    for (const job of project.renderJobs()) await project.cancelRender(job.id);
    await project.close();
  }
});
const contents = (dir: string): string[] => readdirSync(dir, { recursive: true }).map(String).sort().map((path) => {
  try { return `${path}:${readFileSync(join(dir, path)).toString('base64')}`; } catch { return `${path}/`; }
});

it.each(['running', 'queued'] as const)('refuses version deletion during a %s render for that reel', async (state) => {
  const { dir, reelDir } = alternatesFixture();
  const project = openProject(dir, { renderSegments: 1 }); projects.push(project);
  await project.buildParts('parts');
  for (const number of [2, 3]) cpSync(join(reelDir, 'v1'), join(reelDir, `v${number}`), { recursive: true });
  if (state === 'queued') {
    cpSync(reelDir, join(dir, 'reels', 'other'), { recursive: true });
    await project.render({ reel: 'other', version: 1, preset: 'draft' });
  }
  const job = await project.render({ reel: 'parts', version: 1, preset: 'draft' });
  await vi.waitFor(() => expect(project.renderJobs().find((entry) => entry.id === job.id)?.state).toBe(state));
  const before = contents(dir);
  await expect(project.deleteVersion('parts', 2)).rejects.toMatchObject({ code: 'frozen', message: expect.stringContaining(`${state} render`) });
  expect(contents(dir)).toEqual(before);
});

it('refuses version deletion while a comment batch is handed off', async () => {
  const { dir, reelDir } = alternatesFixture();
  const project = openProject(dir); projects.push(project);
  await project.buildParts('parts');
  for (const number of [2, 3]) cpSync(join(reelDir, 'v1'), join(reelDir, `v${number}`), { recursive: true });
  await project.addComment('parts', 3, { pin: { shot: '01', x: 0.2, y: 0.2, element: 'document' }, text: 'Change the hook' });
  await project.copyBatch('parts', 3);
  const before = contents(dir);
  await expect(project.deleteVersion('parts', 2)).rejects.toMatchObject({ code: 'frozen', message: expect.stringMatching(/handed.off/i) });
  expect(contents(dir)).toEqual(before);
});

it('refuses version deletion while an agent job is handed off for Copy', async () => {
  const { dir, reelDir } = alternatesFixture(true);
  for (const number of [2, 3]) cpSync(join(reelDir, 'v1'), join(reelDir, `v${number}`), { recursive: true });
  const id = '11111111-1111-4111-8111-111111111111';
  const jobDir = join(reelDir, '.agent', 'jobs', id);
  mkdirSync(join(jobDir, 'output'), { recursive: true });
  writeFileSync(join(jobDir, 'state.json'), JSON.stringify({ id, reel: 'parts', provider: 'copy', state: 'copy-ready', createdAt: '2026-11-07T00:00:00Z', updatedAt: '2026-11-07T00:00:00Z', elapsedSeconds: 0, quiet: false, canRetry: true, canCopy: true }));
  const project = openProject(dir); projects.push(project);
  await project.agentJob('parts');
  const before = contents(dir);
  await expect(project.deleteVersion('parts', 2)).rejects.toMatchObject({ code: 'frozen', message: expect.stringMatching(/agent.*handed.off/i) });
  expect(contents(dir)).toEqual(before);
});
