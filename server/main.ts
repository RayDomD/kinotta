import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { openProject } from './core/index.ts';
import { createHandler } from './http/index.ts';

export const DEFAULT_PORT = 4317;
const WEB_ROOT = resolve(import.meta.dirname, '../dist/web');

export interface StartOptions {
  projectDir: string;
  port?: number;
}

export interface RunningServer {
  url: string;
  port: number;
  close(): Promise<void>;
}

function listen(server: ReturnType<typeof createServer>, port: number): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(port, () => {
      server.off('error', reject);
      resolvePromise();
    });
  });
}

/** Serves the project's reels. Falls back to a free port when the requested one is taken. */
export async function startServer({ projectDir, port = DEFAULT_PORT }: StartOptions): Promise<RunningServer> {
  const server = createServer(createHandler(openProject(projectDir), WEB_ROOT));
  try {
    await listen(server, port);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw err;
    await listen(server, 0);
  }
  const bound = (server.address() as { port: number }).port;
  return {
    url: `http://localhost:${bound}`,
    port: bound,
    close: () =>
      new Promise((done) => {
        server.close(() => done());
        // Event streams stay open until the browser leaves; closing must not wait for them.
        server.closeAllConnections();
      }),
  };
}
