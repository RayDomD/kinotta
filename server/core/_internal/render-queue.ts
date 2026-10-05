import { randomUUID } from 'node:crypto';
import { KinottaError } from './errors.ts';
import { estimateRemaining } from './transcription.ts';
import type { ProjectEvent, RenderJob, RenderRequest } from './types.ts';

/** Progress is reported in whole percents, so a long render doesn't raise an event per frame. */
const PROGRESS_STEPS = 100;
const JOB_ID_LENGTH = 8;

/** Renders one job: reports frames done and the total as it goes, and resolves with the finished file. */
export type RenderRun = (job: RenderJob, report: (done: number, frames: number) => void) => Promise<string>;

export interface RenderQueue {
  /** Queues a job behind the others and returns it as queued. */
  add(request: RenderRequest, run: RenderRun): RenderJob;
  /** The jobs waiting or running, in queue order. */
  jobs(): RenderJob[];
  whenDone(id: string): Promise<RenderJob>;
}

/** One project's renders, run one at a time in the order they came (R8). Held in memory: a restart forgets them. */
export function createRenderQueue(emit: (event: ProjectEvent) => void, now: () => number = Date.now): RenderQueue {
  const jobs = new Map<string, RenderJob>();
  const finished = new Map<string, Promise<RenderJob>>();
  let tail: Promise<unknown> = Promise.resolve();

  const update = (job: RenderJob, change: Partial<RenderJob>): void => {
    Object.assign(job, change);
    emit({ type: 'render-progress', job: { ...job } });
  };

  async function runOne(job: RenderJob, run: RenderRun): Promise<RenderJob> {
    const startedAt = now();
    update(job, { state: 'running' });
    try {
      const output = await run({ ...job }, (done, frames) => {
        const progress = frames > 0 ? Math.min(done / frames, 1) : 0;
        if (Math.floor(progress * PROGRESS_STEPS) === Math.floor(job.progress * PROGRESS_STEPS)) return;
        update(job, { progress, remaining: estimateRemaining(frames, done, now() - startedAt) });
      });
      update(job, { state: 'done', progress: 1, remaining: 0, output });
    } catch (err) {
      update(job, { state: 'failed', remaining: null, error: err instanceof Error ? err.message : String(err) });
    }
    return { ...job };
  }

  return {
    add({ reel, version, preset }, run) {
      const job: RenderJob = { id: randomUUID().slice(0, JOB_ID_LENGTH), reel, version, preset, state: 'queued', progress: 0, remaining: null };
      jobs.set(job.id, job);
      update(job, {});
      const done = tail.then(() => runOne(job, run));
      tail = done;
      finished.set(job.id, done);
      return { ...job };
    },
    jobs: () => [...jobs.values()].filter((job) => job.state === 'queued' || job.state === 'running').map((job) => ({ ...job })),
    async whenDone(id) {
      const done = finished.get(id);
      if (!done) throw new KinottaError('not-found', `Render job "${id}" not found.`);
      return done;
    },
  };
}
