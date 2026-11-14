import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SimpleMode } from '../../web/src/SimpleMode.tsx';
import { EditorWorkspace } from '../../web/src/review/index.ts';
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


it.each([
  ['foreign Origin', { origin: 'http://evil.example' }],
  ['cross-site fetch', { 'sec-fetch-site': 'cross-site' }],
] as const)('rejects comment and note writes from %s without changing stored text', async (_label, headers) => {
  const server = await startServer({ projectDir: copyFixture('showreel-project'), port: 0 }); running.push(server);
  const slug = 'product-showreel';
  const base = `/api/reels/${slug}/versions/2`;
  const pin = { shot: '03', x: 0.5, y: 0.5, element: null };
  const existing = (await server.project.addComment(slug, 2, { text: 'Original pin', pin })).comment;
  await server.project.setNote(slug, 2, 'Original note');
  const before = await server.project.listComments(slug, 2);
  const call = (path: string, method: string, body: unknown, source: Record<string, string>) => fetch(`${server.url}${path}`, {
    method, headers: { 'content-type': 'text/plain', ...source }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const writes = [
    [`${base}/comments`, 'POST', { text: 'Planted pin', pin }],
    [`${base}/comments/${existing.id}`, 'PATCH', { text: 'Planted edit' }],
    [`${base}/comments/${existing.id}`, 'DELETE', undefined],
    [`${base}/note`, 'PUT', { note: 'Planted note' }],
  ] as const;
  for (const [path, method, body] of writes) {
    expect.soft((await call(path, method, body, headers)).status, `${method} ${path}`).toBe(403);
    expect.soft(await server.project.listComments(slug, 2)).toEqual(before);
    expect.soft(await server.project.readNote(slug, 2)).toBe('Original note');
  }
  const sameOrigin = { origin: server.url };
  const added = await call(`${base}/comments`, 'POST', { text: 'Owner pin', pin }, sameOrigin);
  expect(added.status).toBe(201);
  const { comment } = await added.json();
  expect((await call(`${base}/comments/${comment.id}`, 'PATCH', { text: 'Owner edit' }, sameOrigin)).status).toBe(200);
  expect((await server.project.listComments(slug, 2)).find((pin) => pin.id === comment.id)?.text).toBe('Owner edit');
  expect((await call(`${base}/comments/${comment.id}`, 'DELETE', undefined, sameOrigin)).status).toBe(200);
  expect((await server.project.listComments(slug, 2)).some((pin) => pin.id === comment.id)).toBe(false);
  expect((await call(`${base}/note`, 'PUT', { note: 'Owner note' }, sameOrigin)).status).toBe(200);
  expect(await server.project.readNote(slug, 2)).toBe('Owner note');
});


it.each([
  ['foreign Origin', { origin: 'http://evil.example' }],
  ['cross-site fetch', { 'sec-fetch-site': 'cross-site' }],
] as const)('globally rejects every mutating method from %s', async (_label, headers) => {
  const server = await startServer({ projectDir: copyFixture('showreel-project'), port: 0 }); running.push(server);
  const reel = '/api/reels/product-showreel';
  const routes = [
    `${reel}/versions/2/comments`, `${reel}/versions/2/comments/pin`, `${reel}/versions/2/note`,
    `${reel}/edits`, `${reel}/style`, '/api/agent/settings', '/api/effects/box',
    `${reel}/markers`, `${reel}/versions/2/batch`, `${reel}/build`,
  ];
  const failures: string[] = [];
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    for (const route of routes) {
      const response = await fetch(`${server.url}${route}`, { method, headers: { 'content-type': 'text/plain', ...headers }, body: '{}' });
      const body = await response.text();
      if (response.status !== 403 || body !== JSON.stringify({ error: 'Writes must come from this editor.' })) failures.push(`${method} ${route}: ${response.status} ${body}`);
    }
  }
  expect(failures).toEqual([]);
});

it('blocks a cross-site pin-comment edit before it can enter the Regenerate prompt', { timeout: 30_000 }, async () => {
  const prompts: string[] = [];
  const server = await startServer({ projectDir: copyFixture('footage-project'), port: 0, transcriber: async () => [], agent: { launch: async (input) => {
    prompts.push(input.prompt); throw new Error('Captured test prompt');
  } } }); running.push(server);
  await server.project.saveAgentSettings({ provider: 'copy' });
  const { slug } = await server.project.startReel({ video: 'media/talk.mp4' });
  await server.project.whenTranscribed(slug); await server.project.whenAgentDone(slug);
  await server.project.saveAgentSettings({ provider: 'claude' });
  await server.project.addComment(slug, 1, { text: 'Owner title request', pin: { kind: 'frame', shot: '', time: 0.5, x: 0.5, y: 0.5, element: null } });
  const before = await server.project.readEditList(slug);
  const comments = await server.project.listComments(slug, 1);
  const response = await fetch(`${server.url}/api/reels/${slug}/edits`, {
    method: 'POST', headers: { 'content-type': 'text/plain', 'sec-fetch-site': 'cross-site' },
    body: JSON.stringify({ kind: 'pin-comment', commentId: 'planted', comment: {
      id: 'planted', number: 2, createdAt: new Date().toISOString(), text: '', effect: 'title-card', instant: true,
      pin: { kind: 'frame', shot: '', time: 0.5, x: 0.5, y: 0.5, version: 1, element: 'INJECTED element instruction', extra: 'INJECTED extra instruction' },
    } }),
  });
  expect.soft(response.status).toBe(403);
  expect.soft(await server.project.readEditList(slug)).toEqual(before);
  expect.soft(await server.project.listComments(slug, 1)).toEqual(comments);
  expect((await fetch(`${server.url}/api/reels/${slug}/agent/regenerate`, { method: 'POST', body: '{}' })).status).toBe(202);
  await server.project.whenAgentDone(slug);
  expect(prompts).toHaveLength(1);
  expect(prompts[0]).toContain('Owner title request');
  expect(prompts[0]).not.toContain('INJECTED');
});

it.each(['localhost', '127.0.0.1', 'no Origin'])('allows comment, note, edits and Regenerate writes with %s', { timeout: 30_000 }, async (source) => {
  const prompts: string[] = [];
  const server = await startServer({ projectDir: copyFixture('footage-project'), port: 0, transcriber: async () => [], agent: { launch: async (input) => {
    prompts.push(input.prompt); throw new Error('Captured test prompt');
  } } }); running.push(server);
  await server.project.saveAgentSettings({ provider: 'copy' });
  const { slug } = await server.project.startReel({ video: 'media/talk.mp4' });
  await server.project.whenTranscribed(slug); await server.project.whenAgentDone(slug);
  await server.project.saveAgentSettings({ provider: 'claude' });
  const address = source === 'no Origin' ? server.url : `http://${source}:${new URL(server.url).port}`;
  const headers: Record<string, string> = { 'content-type': 'application/json', ...(source === 'no Origin' ? {} : { origin: address }) };
  const call = (path: string, method: string, body: unknown) => fetch(`${address}/api/reels/${slug}${path}`, { method, headers, body: JSON.stringify(body) });
  const added = await call('/versions/1/comments', 'POST', { text: 'Owner pin', pin: { kind: 'frame', shot: '', time: 0.5, x: 0.5, y: 0.5, element: null } });
  expect(added.status).toBe(201);
  const { comment } = await added.json();
  expect((await call(`/versions/1/comments/${comment.id}`, 'PATCH', { text: 'Owner edited pin' })).status).toBe(200);
  expect((await call('/versions/1/note', 'PUT', { note: 'Owner note' })).status).toBe(200);
  expect(await server.project.readNote(slug, 1)).toBe('Owner note');
  expect((await call('/edits', 'POST', { kind: 'caption-position', x: 0.5, y: 0.7 })).status).toBe(201);
  expect((await server.project.readEditList(slug)).operations).toHaveLength(1);
  expect((await call('/agent/regenerate', 'POST', {})).status).toBe(202);
  await server.project.whenAgentDone(slug);
  expect(prompts).toHaveLength(1);
  expect(prompts[0]).toContain('Owner edited pin');
  expect((await call(`/versions/1/comments/${comment.id}`, 'DELETE', {})).status).toBe(200);
  expect(await server.project.listComments(slug, 1)).toEqual([]);
});

it('preserves cross-site read and OPTIONS behavior', async () => {
  const server = await startServer({ projectDir: copyFixture('showreel-project'), port: 0 }); running.push(server);
  const headers = { origin: 'http://evil.example', 'sec-fetch-site': 'cross-site' };
  for (const [path, status] of [
    ['/api/reels/product-showreel/versions/2/comments', 200], ['/api/reels/product-showreel/versions/2/note', 200],
    ['/api/reels/product-showreel/edits', 200], ['/api/effects/box', 200], ['/api/styles', 403], ['/api/agent/settings', 403],
  ] as const) expect((await fetch(`${server.url}${path}`, { headers })).status, path).toBe(status);
  expect((await fetch(`${server.url}/api/reels/product-showreel/versions/2/comments`, { method: 'HEAD', headers })).status).toBe(200);
  expect((await fetch(`${server.url}/api/reels/product-showreel/edits`, { method: 'OPTIONS', headers })).status).toBe(405);
});


it('excludes instant pins from the rendered Regenerate button count', async () => {
  const server = await startServer({ projectDir: copyFixture('showreel-project'), port: 0 }); running.push(server);
  const listing = await server.project.listReels();
  const reel = listing.reels.find((reel) => reel.slug === 'product-showreel')!;
  const version: ComponentProps<typeof SimpleMode>['version'] = await (await fetch(`${server.url}/api/reels/${reel.slug}/versions/2`)).json();
  const idle = async () => {};
  const instant = { id: 'instant', number: 1, text: '', createdAt: '', instant: true as const, effect: 'title-card', pin: { kind: 'frame' as const, version: 2, shot: '03', time: 0.5, x: 0.5, y: 0.5, element: null, section: null } };
  const ordinary = { ...instant, id: 'ordinary', number: 2, instant: undefined, text: 'Warm up the title' };
  const props: ComponentProps<typeof SimpleMode> = {
    agentStripSlot: null, isJobActive: false, listing, reel, version, state: 'ready', creating: false,
    comments: { comments: [instant], error: null, save: idle, edit: idle, remove: idle },
    edits: { list: null, busy: false, error: null, add: async () => true, remove: idle, undo: idle, redo: idle, cancelHandoff: idle, dismissSkipped: idle },
    onOpen: () => {}, onNew: () => {}, onStarted: () => {}, onBriefStarted: () => {}, topBar: null, onRefresh: () => {},
  };
  const render = (comments: typeof props.comments.comments) => renderToStaticMarkup(createElement(EditorWorkspace, null, createElement(SimpleMode, { ...props, comments: { ...props.comments, comments } })));
  const regenerateButton = (html: string) => html.match(/<button[^>]*>Regenerate.*?<\/button>/)?.[0];
  expect.soft(regenerateButton(render([instant]))).toMatch(/disabled=""[^>]*>Regenerate \(<span class="num">0<\/span> pins\)/);
  expect(regenerateButton(render([instant, ordinary]))).toContain('Regenerate (<span class="num">1</span> pins)');
});
