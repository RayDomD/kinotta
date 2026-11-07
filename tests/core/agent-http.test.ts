import { mkdirSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchAgent } from '../../server/core/_internal/runner.ts';
import { afterEach, expect, it } from 'vitest';
import { startServer, type RunningServer } from '../../server/main.ts';
import { copyFixture } from '../helpers/project.ts';

const running: RunningServer[] = [];
afterEach(async () => { for (const server of running.splice(0)) await server.close(); });
it('exposes explicit agent settings, Copy fallback, reconnect status, retry, and origin protection', { timeout: 30_000 }, async () => {
  const dir = copyFixture('footage-project');
  const server = await startServer({ projectDir: dir, port: 0, transcriber: async () => [] }); running.push(server);
  const call = (path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) => fetch(`${server.url}${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  await server.project.saveAgentSettings({ provider: 'copy' });
  expect(await (await call('/api/agent/settings')).json()).toMatchObject({ provider: 'copy', usageNotice: expect.stringContaining('quota') });
  expect((await call('/api/agent/settings', 'PUT', { provider: 'wrong' })).status).toBe(422);
  expect((await call('/api/agent/settings', 'PUT', { provider: 'claude' }, { origin: 'https://untrusted.example' })).status).toBe(403);
  expect(await (await call('/api/agent/settings', 'PUT', { provider: 'codex' })).json()).toMatchObject({ provider: 'codex' });
  expect(await (await call('/api/agent/settings', 'PUT', { provider: 'copy' })).json()).toMatchObject({ provider: 'copy' });
  expect(await (await call('/api/agent/settings', 'PUT', { confirmed: true })).json()).toMatchObject({ provider: 'copy', confirmed: true });
  expect(await (await call('/api/agent/settings')).json()).toMatchObject({ provider: 'copy', confirmed: true });
  expect((await call('/api/reels', 'POST', { video: 'media/talk.mp4', agentConfirmed: true }, { origin: 'https://untrusted.example' })).status).toBe(403);
  const { slug } = await (await call('/api/reels', 'POST', { video: 'media/talk.mp4' })).json();
  await server.project.whenTranscribed(slug); await server.project.whenAgentDone(slug);
  const path = `/api/reels/${slug}/agent`;
  const first = await (await call(path)).json();
  expect(first.job).toMatchObject({ state: 'copy-ready', canRetry: true });
  const copied = await (await call(`${path}/copy`)).json();
  expect(copied.request).toContain(`reels/${slug}/.agent/jobs/${first.job.id}`);
  const retry = await call(`${path}/retry`, 'POST');
  expect(retry.status).toBe(202);
  const retried = await retry.json();
  expect(retried.id).not.toBe(first.job.id);
  await server.project.whenAgentDone(slug);
  expect(await (await call(path, 'DELETE')).json()).toMatchObject({ job: { state: 'copy-ready' } });
  expect((await call(`${path}/publish`, 'POST', { id: first.job.id })).status).toBe(422);
  const controller = new AbortController();
  await launchAgent({ provider: 'claude', cwd: join(dir, 'reels', slug, '.agent/jobs', retried.id), prompt: copied.request, signal: controller.signal, onOutput: () => {}, executable: { command: process.execPath, prefix: [resolve('tests/core/fake-broll-agent.mjs'), 'success'] } });
  const published = await call(`${path}/publish`, 'POST', { id: retried.id });
  expect(published.status).toBe(200);
  expect(await published.json()).toMatchObject({ state: 'succeeded', version: 2 });
  expect((await call(`${path}/publish`, 'POST', { id: retried.id })).status).toBe(422);
  const privateFile = await call(`/reels/${slug}/.agent/jobs/${first.job.id}/request.json`);
  expect(privateFile.status).toBe(404);
});


it('refuses a second Regenerate while the reel job runs', { timeout: 30_000 }, async () => {
  let release: (() => void) | undefined;
  const server = await startServer({ projectDir: copyFixture('footage-project'), port: 0, transcriber: async () => [], agent: { launch: async (input) => {
    await new Promise<void>((done, reject) => { release = done; input.signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }); });
  } } });
  running.push(server);
  await server.project.saveAgentSettings({ provider: 'copy' });
  const { slug } = await server.project.startReel({ video: 'media/talk.mp4' });
  await server.project.whenTranscribed(slug); await server.project.whenAgentDone(slug);
  await server.project.saveAgentSettings({ provider: 'claude' });
  await server.project.addComment(slug, 1, { text: 'Keep this moment', pin: { kind: 'frame', shot: '', time: 0.5, x: 0.5, y: 0.5, element: null } });
  const path = `${server.url}/api/reels/${slug}/agent/regenerate`;
  const post = () => fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  try {
    const first = await post();
    expect(first.status).toBe(202);
    expect(await first.json()).toMatchObject({ kind: 'regenerate', pins: [{ state: 'waiting' }] });
    const refused = await post();
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ error: expect.stringContaining('already has an agent run') });
    expect((await server.project.listVersions(slug)).map((version) => version.number)).toEqual([1]);
  } finally { release?.(); await server.project.cancelAgentJob(slug); }
});

it('rejects code-only Regenerate with a plain invalid error and no absolute path', async () => {
  const dir = copyFixture('showreel-project');
  const server = await startServer({ projectDir: dir, port: 0 }); running.push(server);
  await server.project.saveAgentSettings({ provider: 'claude' });
  const response = await fetch(`${server.url}/api/reels/product-showreel/agent/regenerate`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  });
  const body = await response.json();
  expect(response.status).toBe(422);
  expect(body).toEqual({ error: 'Use Copy request to regenerate a reel without a footage plan.' });
  expect(JSON.stringify(body)).not.toContain(dir);
  expect(JSON.stringify(body)).not.toMatch(/[A-Za-z]:[\\/]|ENOENT|plan\.json/);
  await expect(server.project.startAgentJob('product-showreel', false, 'regenerate')).rejects.toMatchObject({ code: 'invalid' });
  expect(await server.project.agentJob('product-showreel')).toBeNull();
});

it.each([
  ['invalid JSON', '{not json'], ['null', 'null'], ['array', '[]'], ['string', '"old marker"'], ['read error', null],
])('regenerates with a %s marker and rewrites it after success', { timeout: 30_000 }, async (_failure, contents) => {
  const dir = copyFixture('footage-project');
  let release!: () => void;
  const gate = new Promise<void>((done) => { release = done; });
  const server = await startServer({ projectDir: dir, port: 0, transcriber: async () => [{ text: 'hello', start: 0.5, end: 1 }], agent: { launch: async (input) => {
    await gate;
    await launchAgent({ ...input, executable: { command: process.execPath, prefix: [resolve('tests/core/fake-broll-agent.mjs'), 'success'] } });
  } } });
  running.push(server);
  await server.project.saveAgentSettings({ provider: 'copy' });
  const { slug } = await server.project.startReel({ video: 'media/talk.mp4' });
  await server.project.whenTranscribed(slug); await server.project.whenAgentDone(slug);
  await server.project.saveAgentSettings({ provider: 'claude' });
  for (const text of ['Warm up the title', 'Brighten the background']) {
    await server.project.addComment(slug, 1, { text, pin: { kind: 'frame', shot: '', time: 0.5, x: 0.5, y: 0.5, element: null } });
  }
  const marker = join(dir, 'reels', slug, '.agent/regenerate-pins.json');
  if (contents === null) mkdirSync(marker);
  else writeFileSync(marker, contents);
  try {
    const response = await fetch(`${server.url}/api/reels/${slug}/agent/regenerate`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    });
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ kind: 'regenerate', pins: [{ text: 'Warm up the title' }, { text: 'Brighten the background' }] });
    // Release the read-error fixture so a successful run can replace it with a file.
    if (contents === null) rmdirSync(marker);
    release();
    await server.project.whenAgentDone(slug);
    expect(await server.project.agentJob(slug)).toMatchObject({ kind: 'regenerate', state: 'succeeded', version: 2 });
    const comments = await server.project.listComments(slug, 2);
    expect(comments).toHaveLength(2);
    expect(JSON.parse(readFileSync(marker, 'utf8'))).toEqual(Object.fromEntries(comments.map((comment) => [comment.id, comment.text])));
    expect(comments.every((comment) => comment.regenerated)).toBe(true);
  } finally { release(); await server.project.whenAgentDone(slug); }
});

it('returns a path-free 422 when retrying Regenerate after its plan is removed', { timeout: 30_000 }, async () => {
  const dir = copyFixture('footage-project');
  const server = await startServer({ projectDir: dir, port: 0, transcriber: async () => [], agent: { launch: async (input) => {
    await launchAgent({ ...input, executable: { command: process.execPath, prefix: [resolve('tests/core/fake-broll-agent.mjs'), 'exit1'] } });
  } } });
  running.push(server);
  await server.project.saveAgentSettings({ provider: 'copy' });
  const { slug } = await server.project.startReel({ video: 'media/talk.mp4' });
  await server.project.whenTranscribed(slug); await server.project.whenAgentDone(slug);
  await server.project.saveAgentSettings({ provider: 'claude' });
  await server.project.addComment(slug, 1, { text: 'Warm up the title', pin: { kind: 'frame', shot: '', time: 0.5, x: 0.5, y: 0.5, element: null } });
  const path = `${server.url}/api/reels/${slug}/agent`;
  const post = (action: string) => fetch(`${path}/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  expect((await post('regenerate')).status).toBe(202);
  await server.project.whenAgentDone(slug);
  expect(await server.project.agentJob(slug)).toMatchObject({ kind: 'regenerate', state: 'failed', canRetry: true });
  unlinkSync(join(dir, 'reels', slug, 'v1/plan.json'));
  const response = await post('retry');
  const body = await response.json();
  expect(response.status).toBe(422);
  expect(body).toEqual({ error: 'Use Copy request to regenerate a reel without a footage plan.' });
  expect(JSON.stringify(body)).not.toContain(dir);
  expect(JSON.stringify(body)).not.toMatch(/[A-Za-z]:[\\/]|ENOENT|plan\.json/);
});
