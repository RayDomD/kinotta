import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { startServer, type RunningServer } from '../../server/main.ts';
import { copyFixture } from '../helpers/project.ts';

const running: RunningServer[] = [];
afterEach(async () => { for (const server of running.splice(0)) await server.close(); });
it('POST /api/reels validates Make options before side effects and builds the chosen captions', { timeout: 90_000 }, async () => {
  const dir = copyFixture('footage-project');
  const server = await startServer({ projectDir: dir, port: 0, transcriber: async () => [{ text: 'hello', start: 0, end: 1 }] });
  running.push(server);
  const post = (body: unknown) => fetch(`${server.url}/api/reels`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const before = readdirSync(join(dir, 'reels'));
  expect((await post({ video: 'media/talk.mp4', pace: 'wrong' })).status).toBe(422);
  expect(readdirSync(join(dir, 'reels'))).toEqual(before);
  const response = await post({ video: 'media/talk.mp4', videoType: 'interview', broll: 'light', pace: 'calm', captions: 'off', notes: '  ' });
  expect(response.status).toBe(201);
  const { slug } = await response.json();
  await server.project.whenTranscribed(slug);
  const plan = JSON.parse(readFileSync(join(dir, 'reels', slug, 'v1/plan.json'), 'utf8'));
  expect(plan).toMatchObject({ videoType: 'interview', broll: 'light', pace: 'calm', captions: false });
  expect(plan).not.toHaveProperty('notes');
  expect(readFileSync(join(dir, 'reels', slug, 'v1/index.html'), 'utf8')).not.toContain('data-el="caption"');
});

