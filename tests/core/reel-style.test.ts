import { readdirSync, readFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { startServer, type RunningServer } from '../../server/main.ts';
import { agentTold } from '../../server/core/_internal/direction.ts';
import { brollJobPrompt, makeBrollJobRequest } from '../../server/core/_internal/requests.ts';
import type { Style } from '../../server/core/_internal/style.ts';
import { copyFixture } from '../helpers/project.ts';

const running: RunningServer[] = [];
beforeEach(() => { vi.stubEnv('KINOTTA_HOME', mkdtempSync(join(tmpdir(), 'kinotta-home-'))); });
afterEach(async () => {
  for (const server of running.splice(0)) await server.close();
  vi.unstubAllEnvs();
});

const direction = (overrides: Partial<Style> = {}): Style => ({
  id: 'clean', name: 'Clean', scope: 'builtin', look: 'clean', form: 'vlog',
  settings: { broll: 'heavy', captions: 'off', pace: 'calm' }, yours: ['broll'],
  effects: ['checklist'], shots: 'Open on the summit', rules: ['Keep captions low'], ...overrides,
});

async function serve() {
  const dir = copyFixture('footage-project');
  const server = await startServer({ projectDir: dir, port: 0, transcriber: async () => [{ text: 'hello', start: 0, end: 1 }] });
  running.push(server);
  const call = async (path: string, method = 'GET', body?: unknown) => fetch(`${server.url}${path}`, {
    method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { dir, server, call };
}

it('Auto by style id: the reel stores its own copy, the plan takes its settings and the agent request names it', { timeout: 60_000 }, async () => {
  const { dir, server, call } = await serve();
  const response = await call('/api/reels', 'POST', { video: 'media/talk.mp4', title: 'Styled', style: { id: 'creator' } });
  expect(response.status).toBe(201);
  const { slug } = await response.json();
  await server.project.whenTranscribed(slug); await server.project.whenAgentDone(slug);
  const copy = await (await call(`/api/reels/${slug}/style`)).json();
  expect(copy).toMatchObject({ id: 'creator', scope: 'project', basedOn: 'creator', settings: { broll: 'heavy', pace: 'fast' } });
  expect(JSON.parse(readFileSync(join(dir, 'reels', slug, 'plan.json'), 'utf8'))).toMatchObject({ broll: 'heavy', pace: 'fast', captions: { look: 'words' } });
  expect(JSON.parse(readFileSync(join(dir, 'reels', slug, 'reel.json'), 'utf8'))).toMatchObject({ frame: 'landscape' });
  const { request } = await (await call(`/api/reels/${slug}/agent/copy`)).json();
  // The request carries exactly the lines Direction shows under "What the agent is told".
  for (const line of agentTold(copy, { frame: 'landscape', frameFound: true })) expect(request).toContain(`- ${line}`);
  expect(request).toContain('Style: creator.');
});

it('Direct: a whole style is stored as the reel copy with its rules, given Make options still win, and a bad style writes nothing', { timeout: 60_000 }, async () => {
  const { dir, server, call } = await serve();
  const before = readdirSync(join(dir, 'reels'));
  expect((await call('/api/reels', 'POST', { video: 'media/talk.mp4', style: { ...direction(), scope: 'nowhere' } })).status).toBe(422);
  expect((await call('/api/reels', 'POST', { video: 'media/talk.mp4', style: { id: 'missing-style' } })).status).toBe(404);
  expect(readdirSync(join(dir, 'reels'))).toEqual(before);

  const response = await call('/api/reels', 'POST', { video: 'media/talk.mp4', title: 'Directed', pace: 'fast', notes: 'A weekend hike', style: direction() });
  const { slug } = await response.json();
  await server.project.whenTranscribed(slug); await server.project.whenAgentDone(slug);
  const copy = await server.project.readReelStyle(slug);
  expect(copy).toMatchObject({ id: 'clean', scope: 'project', basedOn: 'clean', rules: ['Keep captions low'], effects: ['checklist'], yours: ['broll'] });
  // MakeOptions callers keep their meaning: pace given beside the style wins; videoType comes from the form.
  expect(JSON.parse(readFileSync(join(dir, 'reels', slug, 'plan.json'), 'utf8'))).toMatchObject({ broll: 'heavy', pace: 'fast', captions: false, videoType: 'vlog', notes: 'A weekend hike' });
  const jobs = join(dir, 'reels', slug, '.agent', 'jobs');
  const saved = JSON.parse(readFileSync(join(jobs, readdirSync(jobs)[0]!, 'request.json'), 'utf8'));
  expect(saved.style).toEqual(copy);
  expect(saved.told).toEqual(agentTold(copy!, { about: 'A weekend hike', frame: 'landscape', frameFound: true }));
  expect(saved.told).toContain('Rule: "Keep captions low".');
});

it('editing a saved style never changes the copy a reel already holds', { timeout: 60_000 }, async () => {
  const { server, call } = await serve();
  const mine: Style = { ...direction(), id: 'my-style', name: 'My style', scope: 'user', basedOn: 'clean' };
  expect((await call('/api/styles', 'PUT', { scope: 'user', style: mine })).status).toBe(200);
  const { slug } = await (await call('/api/reels', 'POST', { video: 'media/talk.mp4', title: 'First', style: { id: 'my-style' } })).json();
  const { slug: other } = await (await call('/api/reels', 'POST', { video: 'media/talk.mp4', title: 'Second', style: { id: 'my-style' } })).json();
  await server.project.whenTranscribed(slug); await server.project.whenTranscribed(other);
  await call('/api/styles', 'PUT', { scope: 'user', style: { ...mine, rules: ['A new rule'], settings: { broll: 'light' } } });
  // Changing one reel's copy leaves the other reel's copy alone too.
  await call(`/api/reels/${other}/style`, 'PUT', { id: 'creator' });
  expect(await server.project.readReelStyle(slug)).toMatchObject({ id: 'my-style', rules: ['Keep captions low'], settings: { broll: 'heavy' } });
  expect(await server.project.readReelStyle(other)).toMatchObject({ id: 'creator' });
});

it('a brief reel stores its style and its request, then and in the listing, carries the style lines', async () => {
  const { server, call } = await serve();
  const style = direction({ id: 'flat-2d', look: 'flat-2d', form: 'explainer', name: 'Flat 2D' });
  const response = await call('/api/reels/brief', 'POST', { title: 'How it works', brief: 'Three steps to a result', style });
  expect(response.status).toBe(201);
  const { slug, request } = await response.json();
  const copy = (await server.project.readReelStyle(slug))!;
  for (const line of agentTold(copy)) expect(request).toContain(`- ${line}`);
  expect(request).toContain('Form: explainer.');
  const listed = (await server.project.listReels()).reels.find((reel) => reel.slug === slug)!;
  expect(listed.brief?.request).toBe(request);
  // Without a style the brief request is as before.
  const plain = await (await call('/api/reels/brief', 'POST', { title: 'Plain', brief: 'Just this' })).json();
  expect(plain.request).not.toContain('What the agent is told');
});

it('the agent prompt lists the same told lines as the request, after the owner notes', () => {
  const style = { ...direction(), scope: 'project' as const };
  const request = makeBrollJobRequest('id', 'talk', 1, { notes: 'About a hike' }, 30, style, { frame: 'portrait', frameFound: true });
  expect(request.told).toEqual(agentTold(style, { about: 'About a hike', frame: 'portrait', frameFound: true }));
  const prompt = brollJobPrompt(request);
  for (const line of request.told!) expect(prompt).toContain(`- ${line}`);
  expect(brollJobPrompt(makeBrollJobRequest('id', 'talk', 1, {}, 30))).not.toContain('What the agent is told');
});

it('agentTold omits an unknown frame without throwing', () => {
  const context = { frame: 'unknown' } as unknown as Parameters<typeof agentTold>[1];
  expect(() => agentTold(direction(), context)).not.toThrow();
  expect(agentTold(direction(), context).some((line) => line.startsWith('Frame:'))).toBe(false);
});
it('agentTold prints an unknown setting key instead of undefined', () => {
  const style = direction({ settings: { futureSetting: 'enabled' } as unknown as Style['settings'] });
  const lines = agentTold(style);
  expect(lines).toContain('Settings: futureSetting enabled.');
  expect(lines.join('\n')).not.toContain('undefined');
});
it('Phase 6 request-only: footage and brief requests carry every style line and rule from one saved project style', { timeout: 60_000 }, async () => {
  const { dir, server, call } = await serve();
  expect((await call('/api/agent/settings', 'PUT', { provider: 'copy' })).status).toBe(200);
  const style = direction({ id: 'summit-style', name: 'Summit style', scope: 'project', basedOn: 'clean' });
  expect((await call('/api/styles', 'PUT', { scope: 'project', style })).status).toBe(200);

  const footage = await call('/api/reels', 'POST', { video: 'media/talk.mp4', title: 'Summit footage', style: { id: style.id } });
  expect(footage.status).toBe(201);
  const { slug } = await footage.json();
  await server.project.whenTranscribed(slug); await server.project.whenAgentDone(slug);
  const footageCopy = (await server.project.readReelStyle(slug))!;
  expect(footageCopy).toMatchObject({ id: style.id, scope: 'project', rules: ['Keep captions low'] });
  const footageLines = agentTold(footageCopy, { frame: 'landscape', frameFound: true });
  expect(footageLines).toContain('Rule: "Keep captions low".');
  const status = await (await call(`/api/reels/${slug}/agent`)).json();
  expect(status.job).toMatchObject({ provider: 'copy', state: 'copy-ready' });
  const job = JSON.parse(readFileSync(join(dir, 'reels', slug, '.agent', 'jobs', status.job.id, 'request.json'), 'utf8'));
  expect(job.style).toEqual(footageCopy);
  expect(job.told).toEqual(footageLines);
  const copied = await call(`/api/reels/${slug}/agent/copy`);
  expect(copied.status).toBe(200);
  const { request: footageRequest } = await copied.json();
  for (const line of footageLines) expect(footageRequest).toContain(`- ${line}`);

  const brief = await call('/api/reels/brief', 'POST', { title: 'Summit graphics', brief: 'Three steps to the summit', style: { id: style.id } });
  expect(brief.status).toBe(201);
  const { slug: briefSlug, request: briefRequest } = await brief.json();
  const briefCopy = (await server.project.readReelStyle(briefSlug))!;
  expect(briefCopy).toEqual(footageCopy);
  const briefLines = agentTold(briefCopy);
  expect(briefLines).toContain('Rule: "Keep captions low".');
  for (const line of briefLines) expect(briefRequest).toContain(`- ${line}`);
});