import { randomUUID } from 'node:crypto';
import { copyFile, cp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { brollJobPrompt, makeBrollJobRequest, type BrollJobRequest } from './requests.ts';
import type { Frame } from './direction.ts';
import { readReelStyle } from './style.ts';
import { AgentTreeStopError, agentSkillDirectory, launchAgent, type AgentLaunch } from './runner.ts';
import { readAgentSettings, type AgentProvider } from './agent-settings.ts';
import { appendAgentCutsNow, readEditListNow, withReelLock, writeJsonAtomic } from './edit-list.ts';
import { AGENT_CUT_BY } from './dead-air.ts';
import { requireReelDir, newestVersionNumber } from './version.ts';
import { publishVersion } from './version-build.ts';
import { settleNewest } from './carry.ts';
import { validateAgentOutput } from './agent-output.ts';
import { KinottaError } from './errors.ts';
import type { SnipOperation } from './edit-model.ts';
import type { ProjectEvent } from './types.ts';

export const AGENT_CEILING_MS = 45 * 60 * 1000;
export const AGENT_QUIET_MS = 30_000;
const HEARTBEAT_MS = 5000;
const ERROR_LENGTH = 300;
const RETAINED_JOBS = 5;
export type AgentJobState = 'queued' | 'running' | 'validating' | 'succeeded' | 'failed' | 'cancelling' | 'cancelled' | 'interrupted' | 'copy-ready';
export interface AgentJob {
  id: string;
  reel: string;
  provider: AgentProvider;
  state: AgentJobState;
  createdAt: string;
  updatedAt: string;
  elapsedSeconds: number;
  quiet: boolean;
  error?: string;
  version?: number;
  canRetry: boolean;
  canCopy: boolean;
}
interface Active { controller: AbortController; done: Promise<void> }
export interface AgentJobsOptions {
  launch?: (input: AgentLaunch) => Promise<void>;
  ceilingMs?: number;
  quietMs?: number;
}
const activeState = (state: AgentJobState): boolean => ['queued', 'running', 'validating', 'cancelling'].includes(state);
const json = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, 'utf8')) as T;
const names = (dir: string): Promise<string[]> => readdir(dir).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return []; throw error; });

/** One in-memory claim per reel. Durable status is recovered as interrupted, never by killing stored PIDs. */
export function createAgentJobs(projectDir: string, emit: (event: ProjectEvent) => void, options: AgentJobsOptions = {}) {
  const latest = new Map<string, AgentJob>();
  const running = new Map<string, Active>();
  let closed = false;
  const jobDir = (job: Pick<AgentJob, 'reel' | 'id'>): string => join(projectDir, 'reels', job.reel, '.agent/jobs', job.id);
  const writes = new Map<string, Promise<void>>();
  const set = (job: AgentJob): Promise<void> => {
    const snapshot = { ...job };
    latest.set(job.reel, job);
    const task = (writes.get(job.id) ?? Promise.resolve()).catch(() => {}).then(async () => {
      await writeJsonAtomic(join(jobDir(job), 'state.json'), snapshot);
      emit({ type: 'agent-progress', reel: job.reel, job: snapshot });
    });
    writes.set(job.id, task);
    return task;
  };
  async function applyPendingCuts(job: AgentJob, version: number): Promise<void> {
    const reelDir = await requireReelDir(projectDir, job.reel);
    const file = join(reelDir, `v${version}`, 'cuts.json');
    const pending = await json<{ cuts: { from: number; to: number; reason: string }[] }>(file).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (!pending) return;
    const cuts: SnipOperation[] = pending.cuts.map((cut, index) => ({ kind: 'snip', from: cut.from, to: cut.to, reason: cut.reason, by: AGENT_CUT_BY, id: `${job.id}:cut:${index}` }));
    await appendAgentCutsNow(projectDir, job.reel, cuts);
    await rm(file);
  }

  const ready = (async () => {
    for (const reel of await names(join(projectDir, 'reels'))) {
      const jobs: AgentJob[] = [];
      for (const id of await names(join(projectDir, 'reels', reel, '.agent/jobs'))) {
        if (!/^[a-f0-9-]{36}$/.test(id)) continue;
        const job = await json<AgentJob>(join(projectDir, 'reels', reel, '.agent/jobs', id, 'state.json')).catch(() => null);
        if (!job || job.id !== id || job.reel !== reel) continue;
        if (activeState(job.state) || job.state === 'failed') {
          const published = await Promise.all((await names(join(projectDir, 'reels', reel))).filter((name) => /^v[1-9]\d*$/.test(name)).map(async (name) => {
            const manifest = await json<{ agentJobId?: string }>(join(projectDir, 'reels', reel, name, 'shots.json')).catch(() => null);
            return manifest?.agentJobId === id ? Number(name.slice(1)) : 0;
          }));
          const version = Math.max(0, ...published);
          if (version) {
            try {
              const reelDir = await requireReelDir(projectDir, reel);
              await withReelLock(reelDir, () => applyPendingCuts(job, version));
              await settleNewest(projectDir, reel);
              await set({ ...job, state: 'succeeded', version, canRetry: false, canCopy: false, error: undefined });
            } catch (error) {
              await set({ ...job, state: 'failed', version, canRetry: true, error: (error instanceof Error ? error.message : 'Could not recover agent cuts.').slice(0, ERROR_LENGTH) });
            }
            jobs.push(latest.get(reel)!);
            continue;
          }
        }
        if (activeState(job.state)) await set({ ...job, state: 'interrupted', canRetry: true, error: 'The server stopped during this run. Retry or Copy request.', updatedAt: new Date().toISOString() });
        jobs.push(latest.get(reel)?.id === id ? latest.get(reel)! : job);
      }
      const newest = jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      if (newest) latest.set(reel, newest);
    }
  })();

  void ready.catch(() => {});

  async function prune(reel: string): Promise<void> {
    const reelDir = await requireReelDir(projectDir, reel);
    const root = resolve(reelDir, '.agent/jobs');
    const completed: AgentJob[] = [];
    for (const id of await names(root)) {
      if (!/^[a-f0-9-]{36}$/.test(id)) continue;
      const stored = await json<AgentJob>(join(root, id, 'state.json')).catch(() => null);
      if (stored && stored.id === id && stored.reel === reel && !activeState(stored.state)) completed.push(stored);
    }
    for (const old of completed.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(RETAINED_JOBS)) {
      const target = resolve(root, old.id);
      if (target.startsWith(root + sep) && old.id !== latest.get(reel)?.id) await rm(target, { recursive: true, force: true });
    }
  }

  async function start(reel: string, retry = false): Promise<AgentJob> {
    await ready;
    if (closed) throw new KinottaError('invalid', 'The server is shutting down.');
    if (running.has(reel) || (latest.get(reel) && activeState(latest.get(reel)!.state))) throw new KinottaError('frozen', 'This reel already has an agent run.');
    const controller = new AbortController();
    // Claim before the first filesystem await: two HTTP submissions cannot both launch.
    let finish!: () => void;
    const done = new Promise<void>((resolveDone) => { finish = resolveDone; });
    running.set(reel, { controller, done });
    let job: AgentJob | undefined;
    try {
      const reelDir = await requireReelDir(projectDir, reel);
      const previous = latest.get(reel);
      if (retry && !previous?.canRetry) throw new KinottaError('invalid', 'This run cannot be retried.');
      const baseVersion = await newestVersionNumber(reelDir);
      if (!baseVersion) throw new KinottaError('invalid', 'Wait for the first version before adding b-roll.');
      const source = join(reelDir, `v${baseVersion}`);
      const plan = await json<Record<string, any>>(join(source, 'plan.json'));
      const captionMode = plan.captions === false ? 'off' : plan.captions?.look === 'phrase' ? 'phrases' : plan.captions?.look === 'words' ? 'word-by-word' : undefined;
      const manifest = await json<{ duration: number }>(join(source, 'shots.json'));
      const provider = (await readAgentSettings(projectDir)).provider;
      const id = randomUUID();
      // The reel's own style copy goes in the request, with the frame found when the reel was started.
      const style = await readReelStyle(projectDir, reel);
      const frame = await json<{ frame?: Frame }>(join(reelDir, 'reel.json')).then((file) => file.frame, () => undefined);
      const context = frame ? { frame, frameFound: true } : {};
      const request = retry && previous
        ? makeBrollJobRequest(id, reel, baseVersion, { ...(await json<BrollJobRequest>(join(jobDir(previous), 'request.json'))).options, captions: captionMode }, manifest.duration, style, context)
        : makeBrollJobRequest(id, reel, baseVersion, { videoType: plan.videoType, broll: plan.broll, pace: plan.pace, captions: captionMode, notes: plan.notes }, manifest.duration, style, context);
      const at = new Date().toISOString();
      job = { id, reel, provider, state: 'queued', createdAt: at, updatedAt: at, elapsedSeconds: 0, quiet: false, canRetry: false, canCopy: false };
      const dir = jobDir(job);
      await mkdir(join(dir, 'input'), { recursive: true });
      await mkdir(join(dir, 'output'));
      await writeJsonAtomic(join(dir, 'request.json'), request);
      const { writeFile } = await import('node:fs/promises');
      await writeFile(join(dir, 'prompt.txt'), brollJobPrompt(request), 'utf8');
      await set(job);
      const current = job;
      void execute(current, source, plan, controller, request).catch(() => {
        // A status-write failure leaves the durable unfinished job recoverable as interrupted.
        current.state = 'failed'; current.canRetry = true; current.error = 'Could not save agent status. Check available disk space.';
      }).finally(() => { running.delete(reel); finish(); });
      return { ...current };
    } catch (error) {
      running.delete(reel); finish();
      if (job) await set({ ...job, state: 'failed', canRetry: true, error: 'Could not prepare the agent request. Retry or Copy request.' });
      throw error;
    }
  }

  async function validateAndPublish(job: AgentJob, request: BrollJobRequest, controller: AbortController, frozenPlan: Record<string, unknown>, inputTranscript: string): Promise<void> {
    const output = join(jobDir(job), 'output');
    await validateAgentOutput(output, controller.signal, frozenPlan, inputTranscript);
    const reelDir = await requireReelDir(projectDir, job.reel);
    await withReelLock(reelDir, async () => {
      if (controller.signal.aborted) throw new Error('Agent cancelled.');
      const newest = await newestVersionNumber(reelDir);
      if (newest !== request.baseVersion) throw new Error('A newer version appeared during this run. Retry against the latest version.');
      const manifest = await json<Record<string, unknown>>(join(output, 'shots.json'));
      await writeJsonAtomic(join(output, 'shots.json'), { ...manifest, agentJobId: job.id });
      await publishVersion(reelDir, { dir: output }, newest + 1);
      // Replay every still-pending owner operation; publication does not consume the owner's journal.
      await readEditListNow(projectDir, job.reel);
      await applyPendingCuts(job, newest + 1);
      job.version = newest + 1;
      job.state = 'succeeded';
      job.canRetry = false;
      job.canCopy = false;
      delete job.error;
    });
    await settleNewest(projectDir, job.reel);
    emit({ type: 'version-added', reel: job.reel, version: job.version! });
  }

  async function execute(job: AgentJob, source: string, plan: Record<string, any>, controller: AbortController, request: BrollJobRequest): Promise<void> {
    const started = Date.now();
    let lastOutput = started;
    let timedOut = false;
    let beat: ReturnType<typeof setInterval> | undefined;
    let heartbeat = Promise.resolve();
    const ceiling = setTimeout(() => { timedOut = true; controller.abort(); }, options.ceilingMs ?? AGENT_CEILING_MS);
    const dir = jobDir(job);
    try {
      // Snapshot existing authored inputs, leaving owner operations to the established carry-forward path.
      await cp(source, join(dir, 'input'), { recursive: true });
      await cp(source, join(dir, 'output'), { recursive: true });
      const frozenPlan = { ...plan };
      if (typeof plan.video === 'string') {
        const video = `footage${extname(plan.video)}`;
        await copyFile(resolve(source, plan.video), join(dir, 'input', video));
        await copyFile(join(dir, 'input', video), join(dir, 'output', video));
        frozenPlan.video = video;
      }
      if (frozenPlan.transcript) frozenPlan.transcript = 'transcript.json';
      await writeJsonAtomic(join(dir, 'input/plan.json'), frozenPlan);
      await writeJsonAtomic(join(dir, 'output/plan.json'), frozenPlan);
      await cp(agentSkillDirectory(), join(dir, 'skill'), { recursive: true });
      if (controller.signal.aborted) throw new Error('Agent cancelled.');
      job.canCopy = true;
      if (job.provider === 'copy') {
        job.state = 'copy-ready'; job.canRetry = true;
        return;
      }
      const inputTranscript = await readFile(join(dir, 'input/transcript.json'), 'utf8');
      job.state = 'running';
      await set(job);
      beat = setInterval(() => {
        heartbeat = heartbeat.then(async () => {
          job.elapsedSeconds = Math.floor((Date.now() - started) / 1000);
          job.quiet = Date.now() - lastOutput >= (options.quietMs ?? AGENT_QUIET_MS);
          job.updatedAt = new Date().toISOString();
          await set(job);
        }).catch(() => { controller.abort(); });
      }, HEARTBEAT_MS);
      await (options.launch ?? launchAgent)({ provider: job.provider, cwd: dir, prompt: brollJobPrompt(request), signal: controller.signal, onOutput: () => { lastOutput = Date.now(); } });
      if (beat) clearInterval(beat); beat = undefined;
      await heartbeat;
      if (controller.signal.aborted) throw new Error('Agent cancelled.');
      job.state = 'validating'; await set(job);
      await validateAndPublish(job, request, controller, frozenPlan, inputTranscript);
    } catch (error) {
      const stopFailed = error instanceof AgentTreeStopError;
      job.state = stopFailed ? 'cancelling' : timedOut ? 'failed' : controller.signal.aborted ? 'cancelled' : 'failed';
      job.error = timedOut ? 'The agent exceeded the run time limit. Retry or Copy request.' : (error instanceof Error ? error.message : 'The agent run failed.').slice(0, ERROR_LENGTH);
      job.canRetry = !stopFailed;
      if (stopFailed) job.canCopy = false;
    } finally {
      clearTimeout(ceiling);
      if (beat) clearInterval(beat);
      await heartbeat;
      job.updatedAt = new Date().toISOString();
      job.elapsedSeconds = Math.floor((Date.now() - started) / 1000);
      await set(job);
      await prune(job.reel).catch(() => {});
    }
  }

  return {
    ready,
    start,
    async status(reel: string): Promise<AgentJob | null> { await ready; await requireReelDir(projectDir, reel); return latest.has(reel) ? { ...latest.get(reel)! } : null; },
    async copy(reel: string): Promise<{ request: string }> {
      await ready; await requireReelDir(projectDir, reel);
      const job = latest.get(reel);
      if (!job) throw new KinottaError('not-found', 'No agent request exists yet.');
      if (!job.canCopy) throw new KinottaError('frozen', 'The request is preparing or already published.');
      return { request: await readFile(join(jobDir(job), 'prompt.txt'), 'utf8') };
    },
    async acceptOutput(reel: string, id: string): Promise<AgentJob> {
      await ready;
      if (closed || running.has(reel)) throw new KinottaError('frozen', 'Wait for the managed run to stop before submitting output.');
      const job = latest.get(reel);
      if (!job || job.id !== id || !job.canRetry) throw new KinottaError('invalid', 'This is not the current unfinished request.');
      let finish!: () => void;
      const done = new Promise<void>((resolveDone) => { finish = resolveDone; });
      const controller = new AbortController();
      running.set(reel, { controller, done });
      try {
        const request = await json<BrollJobRequest>(join(jobDir(job), 'request.json'));
        job.state = 'validating'; await set(job);
        await validateAndPublish(job, request, controller, await json<Record<string, unknown>>(join(jobDir(job), 'input/plan.json')), await readFile(join(jobDir(job), 'input/transcript.json'), 'utf8'));
        job.canRetry = false;
      } catch (error) {
        job.state = controller.signal.aborted ? 'cancelled' : 'failed';
        job.error = (error instanceof Error ? error.message : 'Output validation failed.').slice(0, ERROR_LENGTH);
        job.canRetry = true;
      } finally {
        job.updatedAt = new Date().toISOString();
        await set(job).finally(() => { running.delete(reel); finish(); });
      }
      return { ...job };
    },
    async cancel(reel: string): Promise<AgentJob | null> {
      await ready;
      const reelDir = await requireReelDir(projectDir, reel);
      await withReelLock(reelDir, async () => {
        const active = running.get(reel);
        const job = latest.get(reel);
        if (active && job && activeState(job.state)) { job.state = 'cancelling'; active.controller.abort(); await set(job); }
      });
      await running.get(reel)?.done;
      return latest.get(reel) ?? null;
    },
    async whenDone(reel: string): Promise<void> { await ready; await running.get(reel)?.done; },
    async close(): Promise<void> { closed = true; await ready; for (const active of running.values()) active.controller.abort(); await Promise.all([...running.values()].map((a) => a.done)); },
  };
}
