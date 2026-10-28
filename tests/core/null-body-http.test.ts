import { expect, it } from 'vitest';
import { startServer } from '../../server/main.ts';
import { emptyProject } from '../helpers/project.ts';

it.each([
  ['/api/agent/any-reel/publish', 'POST'],
  ['/api/media/reference', 'POST'],
  ['/api/media/relink', 'POST'],
  ['/api/media/generate', 'POST'],
])('answers a null JSON body to %s with a 400 instead of an internal error', async (path, method) => {
  const server = await startServer({ projectDir: emptyProject(), port: 0 });
  try {
    for (const body of ['null', '[]', '5']) {
      const response = await fetch(`${server.url}${path}`, { method, headers: { 'content-type': 'application/json' }, body });
      expect(response.status, `${path} ${body}`).toBeLessThan(500);
    }
  } finally { await server.close(); }
});
