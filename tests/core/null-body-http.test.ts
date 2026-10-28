import { expect, it } from 'vitest';
import { startServer } from '../../server/main.ts';
import { emptyProject } from '../helpers/project.ts';

it.each([
  ['/api/reels/any-reel/agent/publish', 'POST'],
  ['/api/media/reference', 'POST'],
  ['/api/media/relink', 'POST'],
  ['/api/media/generate', 'POST'],
])('answers a non-object JSON body to %s with a 400', async (path, method) => {
  const server = await startServer({ projectDir: emptyProject(), port: 0 });
  try {
    for (const body of ['null', '[]', '5']) {
      const response = await fetch(`${server.url}${path}`, { method, headers: { 'content-type': 'application/json' }, body });
      expect(response.status, `${path} ${body}`).toBe(400);
    }
  } finally { await server.close(); }
});
