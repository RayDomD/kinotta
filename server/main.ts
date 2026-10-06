import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { openProject, type Project, type Transcriber } from './core/index.ts';
import { createHandler } from './http/index.ts';
import { removePortFile, writePortFile } from './port-file.ts';

export const DEFAULT_PORT = 4317;
const WEB_ROOT = resolve(import.meta.dirname, '../dist/web');

export interface StartOptions {
  projectDir: string;
  port?: number;
  /** Replaces the audio transcription when a reel starts; the e2e server passes a fake. */
  transcriber?: Transcriber;
}

export interface RunningServer {
  url: string;
  port: number;
  /** The project it serves; `kinotta render` waits on its queue before closing a server it started. */
  project: Project;
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

/**
 * Serves the project's reels. Falls back to a free port when the requested one is taken. While it runs, the project's port
 * file names it (R12), so `kinotta render` joins its queue; closing or exiting removes the file.
 */
export async function startServer({ projectDir, port = DEFAULT_PORT, transcriber }: StartOptions): Promise<RunningServer> {
  const project = openProject(projectDir, { transcriber });
  const server = createServer(createHandler(project, WEB_ROOT));
  try {
    await listen(server, port);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw err;
    await listen(server, 0);
  }
  const bound = (server.address() as { port: number }).port;
  const entry = { port: bound, pid: process.pid };
  await writePortFile(projectDir, entry);
  const removeOnExit = (): void => removePortFile(projectDir, entry);
  process.on('exit', removeOnExit);
  return {
    url: `http://localhost:${bound}`,
    port: bound,
    project,
    close: () =>
      new Promise((done) => {
        process.off('exit', removeOnExit);
        removePortFile(projectDir, entry);
        server.close(() => done());
        // Event streams stay open until the browser leaves; closing must not wait for them.
        server.closeAllConnections();
      }),
  };
}
