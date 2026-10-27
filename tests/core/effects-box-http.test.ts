import { expect, it } from 'vitest';
import { startServer } from '../../server/main.ts';
import { emptyProject } from '../helpers/project.ts';

it('effects box over HTTP: GET starts empty, PUT saves in order and drops unknown ids, a bad body is refused', async () => {
  const server = await startServer({ projectDir: emptyProject(), port: 0 });
  try {
    const url = `${server.url}/api/effects/box`;
    const put = (body: unknown) => fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    expect(await (await fetch(url)).json()).toEqual({ ids: [] });
    const saved = await put({ ids: ['big-word', 'nope', 'title-card'] });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({ ids: ['big-word', 'title-card'] });
    expect(await (await fetch(url)).json()).toEqual({ ids: ['big-word', 'title-card'] });
    expect((await put({ ids: 'big-word' })).status).toBe(422);
    expect(await (await fetch(url)).json()).toEqual({ ids: ['big-word', 'title-card'] });
  } finally { await server.close(); }
});
