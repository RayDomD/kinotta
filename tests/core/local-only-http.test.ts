import { createServer, request, Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import { afterEach, expect, it, vi } from 'vitest';
import { startServer, type RunningServer } from '../../server/main.ts';
import { emptyProject } from '../helpers/project.ts';

const running: RunningServer[] = [];
afterEach(async () => {
  for (const server of running.splice(0)) await server.close();
  vi.restoreAllMocks();
});

/** Send Host verbatim, independently of the address used for the connection. */
function call(port: number, path: string, headers: Record<string, string>, method = 'GET'): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method, headers, setHost: false }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode!));
    });
    req.on('error', reject);
    req.end();
  });
}

it('rejects foreign Hosts before routing and accepts only local names with the bound port', async () => {
  const server = await startServer({ projectDir: emptyProject(), port: 0 });
  running.push(server);
  expect(await call(server.port, '/api/project', {})).toBe(403);
  expect(await call(server.port, '/api/reels', {}, 'POST')).toBe(403);
  for (const host of [`untrusted.example:${server.port}`, `localhost:${server.port + 1}`, 'localhost', '', `localhost:${server.port}.untrusted.example`]) {
    for (const path of ['/api/project', '/', '/reels/missing/v1/index.html', '/api/events']) {
      expect(await call(server.port, path, { host }), `${host} ${path}`).toBe(403);
    }
    expect(await call(server.port, '/api/reels', { host, origin: `http://${host}` }, 'POST')).toBe(403);
  }
  for (const host of [`localhost:${server.port}`, `127.0.0.1:${server.port}`]) {
    expect(await call(server.port, '/api/project', { host })).toBe(200);
    expect(await call(server.port, '/api/missing', { host })).toBe(404);
  }
  expect((await fetch(`${server.url}/api/project`)).status).toBe(200);
});

it('checks agent Origins against the local allowlist and preserves cross-site protection', async () => {
  const server = await startServer({ projectDir: emptyProject(), port: 0 });
  running.push(server);
  const host = `localhost:${server.port}`;
  for (const origin of ['https://untrusted.example', `http://untrusted.example:${server.port}`, `http://localhost:${server.port + 1}`, 'null', '']) {
    for (const path of ['/api/agent/settings', '/api/reels', '/api/reels/missing/agent', '/api/reels/missing/agent/retry', '/api/reels/missing/agent/publish']) {
      expect(await call(server.port, path, { host, origin }, 'POST'), `${origin} ${path}`).toBe(403);
    }
  }
  for (const origin of [`http://${host}`, `http://127.0.0.1:${server.port}`]) {
    expect(await call(server.port, '/api/agent/settings', { host, origin })).toBe(200);
    expect(await call(server.port, '/api/agent/settings', { host, origin, 'sec-fetch-site': 'cross-site' })).toBe(403);
  }
  expect(await call(server.port, '/api/agent/settings', { host, 'sec-fetch-site': 'cross-site' })).toBe(403);
  expect(await call(server.port, '/api/agent/settings', { host })).toBe(200);
});

it('binds the chosen port and the occupied-port fallback to IPv4 loopback only', async () => {
  const occupied = createServer();
  await new Promise<void>((resolve) => occupied.listen(0, '127.0.0.1', resolve));
  try {
    const port = (occupied.address() as AddressInfo).port;
    const address = vi.spyOn(Server.prototype, 'address');
    for (const requestedPort of [0, port]) {
      const server = await startServer({ projectDir: emptyProject(), port: requestedPort });
      running.push(server);
      expect(server.port).not.toBe(port);
      expect(address.mock.results.map((result) => result.value)).toContainEqual({ address: '127.0.0.1', family: 'IPv4', port: server.port });
      expect((await fetch(`${server.url}/api/project`)).status).toBe(200);
    }
  } finally {
    await new Promise<void>((resolve, reject) => occupied.close((err) => err ? reject(err) : resolve()));
  }
});
