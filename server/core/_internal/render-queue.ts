import { randomUUID } from 'node:crypto';
import { KinottaError } from './errors.ts';
import { estimateRemaining } from './transcription.ts';
import type { ProjectEvent, RenderJob, RenderRequest } from './types.ts';

/** Progress is reported in whole percents, so a long render doesn't raise an event per frame. */
const PROGRESS_STEPS = 100;
const JOB_ID_LENGTH = 8;

/**
 * Renders one job: reports frames done and the total as it goes, and resolves with the finished file. When `signal` aborts
 * it stops its processes, removes what it wrote and rejects.
 */
export type RenderRun = (job: RenderJob, report: (done: number, frames: number) => void, signal: AbortSignal) => Promise<string>;

export interface RenderQueue {
  /** Queues a job behind the others and returns it as queued. */
  add(request: RenderRequest, run: RenderRun): RenderJob;
  /** The jobs waiting or running, in queue order. */
  jobs(): RenderJob[];
  whenDone(id: string): Promise<RenderJob>;
  /** Drops a queued job, or stops a running one and resolves once it has stopped. A finished job comes back as it is. */
  cancel(id: string): Promise<RenderJob>;
}

/** One project's renders, run one at a time in the order they came (R8). Held in memory: a restart forgets them. */
export function createRenderQueue(emit: (event: ProjectEvent) => void, now: () => number = Date.now): RenderQueue {
  const jobs = new Map<string, RenderJob>();
  const finished = new Map<string, { promise: Promise<RenderJob>; settle: (job: RenderJob) => void }>();
  const controllers = new Map<string, AbortController>();
  let tail: Promise<unknown> = Promise.resolve();

  const update = (job: RenderJob, change: Partial<RenderJob>): void => {
    Object.assign(job, change);
    emit({ type: 'render-progress', job: { ...job } });
  };

  const settle = (job: RenderJob): void => {
    controllers.delete(job.id);
    finished.get(job.id)?.settle({ ...job });
  };

  async function runOne(job: RenderJob, run: RenderRun): Promise<void> {
    // Cancelled while it waited: it never starts.
    if (job.state === 'cancelled') return;
    const { signal } = controllers.get(job.id)!;
    const startedAt = now();
    update(job, { state: 'running' });
    try {
      const output = await run({ ...job }, (done, frames) => {
        const progress = frames > 0 ? Math.min(done / frames, 1) : 0;
        if (Math.floor(progress * PROGRESS_STEPS) === Math.floor(job.progress * PROGRESS_STEPS)) return;
        update(job, { progress, remaining: estimateRemaining(frames, done, now() - startedAt) });
      }, signal);
      update(job, { state: 'done', progress: 1, remaining: 0, output });
    } catch (err) {
      if (signal.aborted) update(job, { state: 'cancelled', remaining: null });
      else update(job, { state: 'failed', remaining: null, error: err instanceof Error ? err.message : String(err) });
    }
    settle(job);
  }

  return {
    add({ reel, version, preset }, run) {
      const job: RenderJob = { id: randomUUID().slice(0, JOB_ID_LENGTH), reel, version, preset, state: 'queued', progress: 0, remaining: null };
      jobs.set(job.id, job);
      controllers.set(job.id, new AbortController());
      let resolveDone!: (job: RenderJob) => void;
      finished.set(job.id, { promise: new Promise((resolve) => (resolveDone = resolve)), settle: resolveDone });
      update(job, {});
      tail = tail.then(() => runOne(job, run));
      return { ...job };
    },
    jobs: () => [...jobs.values()].filter((job) => job.state === 'queued' || job.state === 'running').map((job) => ({ ...job })),
    async whenDone(id) {
      const done = finished.get(id);
      if (!done) throw new KinottaError('not-found', `Render job "${id}" not found.`);
      return done.promise;
    },
    async cancel(id) {
      const job = jobs.get(id);
      if (!job) throw new KinottaError('not-found', `Render job "${id}" not found.`);
      if (job.state === 'queued') {
        update(job, { state: 'cancelled' });
        settle(job);
      } else if (job.state === 'running') {
        controllers.get(id)?.abort();
      }
      return finished.get(id)!.promise;
    },
  };
}
