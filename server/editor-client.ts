import { basename } from 'node:path';
import type { ProjectEvent, RenderJob, RenderRequest } from './core/index.ts';
import { readPortFile } from './port-file.ts';

/** Every call `kinotta` makes to a running Kinotta server goes through here. */

/** A live server answers at once; a port file whose server doesn't is stale. */
const PROBE_TIMEOUT_MS = 2000;
const FINISHED: ReadonlyArray<RenderJob['state']> = ['done', 'failed', 'cancelled'];

/** Whether a process with this id is running. EPERM means it runs under another user, which still counts. */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * The URL of the server running for this project, from its port file, or null when there is none. A port file is stale,
 * and ignored, when its process is gone or the server on its port doesn't answer as this project.
 */
export async function findEditor(projectDir: string): Promise<string | null> {
  const entry = await readPortFile(projectDir);
  if (entry === null || !isAlive(entry.pid)) return null;
  const url = `http://localhost:${entry.port}`;
  try {
    const res = await fetch(`${url}/api/project`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    const { name } = (await res.json()) as { name?: unknown };
    return res.ok && name === basename(projectDir) ? url : null;
  } catch {
    return null;
  }
}

/** A refusal from the server, carrying its message (the core's reason, for a 422). */
export class ServerError extends Error {}

export interface FollowedRender {
  /** The job as queued. */
  job: RenderJob;
  /** Jobs ahead of it when it was queued. */
  ahead: number;
  /** Resolves with the job once it is done, failed or cancelled. */
  finished: Promise<RenderJob>;
}

/**
 * Calls `onEvent` for each event the server sends on `/api/events` until `signal` aborts, and `onEnd` if the stream ends
 * first (the server went away). Resolves once the stream is open.
 */
async function openEvents(url: string, signal: AbortSignal, onEvent: (event: ProjectEvent) => void, onEnd: () => void): Promise<void> {
  const res = await fetch(`${url}/api/events`, { signal });
  if (!res.ok || res.body === null) throw new ServerError(`The server's event stream failed: HTTP ${res.status}`);
  const decoder = new TextDecoder();
  let pending = '';
  void (async () => {
    try {
      for await (const chunk of res.body!) {
        const messages = (pending + decoder.decode(chunk as Uint8Array, { stream: true })).split('\n\n');
        pending = messages.pop() ?? '';
        for (const message of messages) {
          const data = message.split('\n').find((line) => line.startsWith('data: '));
          if (data !== undefined) onEvent(JSON.parse(data.slice('data: '.length)) as ProjectEvent);
        }
      }
    } catch {
      // Aborted once the job finished, or the connection dropped.
    }
    if (!signal.aborted) onEnd();
  })();
}

/**
 * Queues a render on the server and follows it (R12): `onProgress` gets each `render-progress` of this job. Throws
 * `ServerError` with the server's reason when it refuses the request.
 */
export async function queueRender(url: string, request: RenderRequest, onProgress: (job: RenderJob) => void): Promise<FollowedRender> {
  const stream = new AbortController();
  // Events can arrive before the POST returns the job's id, so they wait here until it does.
  const early: RenderJob[] = [];
  let jobId: string | null = null;
  let last: RenderJob | null = null;
  let settle!: (job: RenderJob) => void;
  const finished = new Promise<RenderJob>((resolve) => (settle = resolve));
  const take = (job: RenderJob): void => {
    last = job;
    onProgress(job);
    if (!FINISHED.includes(job.state)) return;
    stream.abort();
    settle(job);
  };
  const lost = (): void => {
    if (last !== null) settle({ ...last, state: 'failed', remaining: null, error: 'The Kinotta server stopped before the render finished.' });
  };
  await openEvents(url, stream.signal, (event) => {
    if (event.type !== 'render-progress') return;
    if (jobId === null) early.push(event.job);
    else if (event.job.id === jobId) take(event.job);
  }, lost);
  try {
    const before = (await (await fetch(`${url}/api/renders`)).json()) as { jobs: RenderJob[] };
    const res = await fetch(`${url}/api/renders`, { method: 'POST', body: JSON.stringify(request) });
    const body = (await res.json()) as RenderJob & { error?: string };
    if (!res.ok) throw new ServerError(body.error ?? `The server refused the render: HTTP ${res.status}`);
    jobId = body.id;
    last = body;
    for (const job of early.splice(0)) if (job.id === jobId) take(job);
    return { job: body, ahead: before.jobs.length, finished };
  } catch (err) {
    stream.abort();
    throw err;
  }
}
