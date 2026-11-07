import { randomUUID } from 'node:crypto';
import { copyFile, cp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { brollJobPrompt, makeBrollJobRequest, type BrollJobRequest } from './requests.ts';
import { assertSafeCopyOutput, COPY_SETTLE_MS, removeCopyDoneMarker, watchCopyOutput, type CopyWatchHandle } from './copy-watch.ts';
import { readState, stateFilePath } from './state.ts';
import { listComments } from './comments.ts';
import type { Frame } from './direction.ts';
import { readReelStyle } from './style.ts';
import { AgentTreeStopError, agentSkillDirectory, launchAgent, type AgentLaunch } from './runner.ts';
import { readAgentSettings, type AgentProvider } from './agent-settings.ts';
import { appendAgentCutsNow, readEditListNow, withReelLock, writeJsonAtomic } from './edit-list.ts';
import { AGENT_CUT_BY } from './dead-air.ts';
import { requireReelDir, newestVersionNumber, nextVersionNumber } from './version.ts';
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
  kind?: BrollJobRequest['kind'];
  pins?: { id: string; text: string; state: 'waiting' | 'running' | 'done' | 'failed' }[];
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
interface Active { jobId?: string; controller: AbortController; done: Promise<void> }
export interface AgentJobsOptions {
  launch?: (input: AgentLaunch) => Promise<void>;
  ceilingMs?: number;
  quietMs?: number;
  settleMs?: number;
}
const activeState = (state: AgentJobState): boolean => ['queued', 'running', 'validating', 'cancelling'].includes(state);
const json = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, 'utf8')) as T;
const names = (dir: string): Promise<string[]> => readdir(dir).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return []; throw error; });

/** One in-memory claim per reel. Durable status is recovered as interrupted, never by killing stored PIDs. */
export function createAgentJobs(projectDir: string, emit: (event: ProjectEvent) => void, options: AgentJobsOptions = {}) {
  const latest = new Map<string, AgentJob>();
  const running = new Map<string, Active>();
  const copyWatchers = new Map<string, CopyWatchHandle>();
  let closed = false;
  const jobDir = (job: Pick<AgentJob, 'reel' | 'id'>): string => join(projectDir, 'reels', job.reel, '.agent/jobs', job.id);
  const writes = new Map<string, Promise<void>>();

  function stopWatching(reel: string): void {
    const watcher = copyWatchers.get(reel);
    if (watcher) {
      watcher.stop();
      copyWatchers.delete(reel);
    }
  }

  async function startWatchingCopyJob(job: AgentJob): Promise<void> {
    if (closed || job.state !== 'copy-ready') return;
    stopWatching(job.reel);
    const outputDir = join(jobDir(job), 'output');
    try {
      await assertSafeCopyOutput(jobDir(job), outputDir);
      // Acceptance or close may have run during the await, when stopWatching had no watcher to stop.
      if (closed || job.state !== 'copy-ready' || latest.get(job.reel)?.id !== job.id) return;
      let watcher: CopyWatchHandle;
      watcher = watchCopyOutput(
        jobDir(job),
        outputDir,
        async () => {
          if (copyWatchers.get(job.reel) === watcher) copyWatchers.delete(job.reel);
          try {
            await runAcceptOutput(job.reel, job.id);
          } catch {
            // Handled within runAcceptOutput
          }
        },
        async (error) => {
          if (copyWatchers.get(job.reel) !== watcher || latest.get(job.reel)?.id !== job.id || job.state !== 'copy-ready') return;
          stopWatching(job.reel);
          job.state = 'failed';
          job.error = (error instanceof Error ? error.message : 'Could not accept Copy request output.').slice(0, ERROR_LENGTH);
          job.canRetry = true;
          job.updatedAt = new Date().toISOString();
          await set(job);
        },
        { settleMs: options.settleMs ?? COPY_SETTLE_MS },
      );
      copyWatchers.set(job.reel, watcher);
    } catch (error) {
      job.state = 'failed';
      job.error = (error instanceof Error ? error.message : 'Could not watch Copy request output.').slice(0, ERROR_LENGTH);
      job.canRetry = true;
      job.updatedAt = new Date().toISOString();
      await set(job);
    }
  }

  const set = (job: AgentJob): Promise<void> => {
    if (job.pins) {
      const state = job.state === 'succeeded' ? 'done' : ['failed', 'cancelled', 'interrupted'].includes(job.state) ? 'failed' : job.state === 'queued' ? 'waiting' : 'running';
      job.pins = job.pins.map((pin) => ({ ...pin, state }));
    }
    const snapshot = { ...job };
    latest.set(job.reel, job);
    const task = (writes.get(job.id) ?? Promise.resolve()).catch(() => {}).then(async () => {
      await writeJsonAtomic(join(jobDir(job), 'state.json'), snapshot);
      emit({ type: 'agent-progress', reel: job.reel, job: snapshot });
    });
    writes.set(job.id, task);
    return task;
  };

  // Carry-forward assigns fresh pin IDs. Follow its recorded pairs so an unchanged note stays sent.
  async function pinAliases(reel: string, version: number): Promise<Map<string, string>> {
    const aliases = new Map<string, string>();
    let number = version;
    while (number > 1) {
      const state = await readState(stateFilePath(projectDir, reel, number), number);
      if (!state.carriedFrom) break;
      const previous = state.carriedFrom.version;
      const before = await readState(stateFilePath(projectDir, reel, previous), previous);
      if (before.carriedTo?.version === number) {
        before.carriedTo.carried.forEach((id, index) => {
          const next = state.carriedFrom!.ids[index];
          if (next) aliases.set(id, aliases.get(next) ?? next);
        });
      }
      number = previous;
    }
    return aliases;
  }

  async function pinMarkers(reel: string, version: number): Promise<Record<string, string>> {
    const stored = await json<Record<string, string>>(join(projectDir, 'reels', reel, '.agent/regenerate-pins.json')).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return {}; throw error; });
    const aliases = await pinAliases(reel, version);
    return Object.fromEntries(Object.entries(stored).map(([id, text]) => [aliases.get(id) ?? id, text]));
  }

  async function carryJobPins(job: AgentJob, version: number): Promise<void> {
    if (!job.pins) return;
    const aliases = await pinAliases(job.reel, version);
    job.pins = job.pins.map((pin) => ({ ...pin, id: aliases.get(pin.id) ?? pin.id }));
    await writeJsonAtomic(join(projectDir, 'reels', job.reel, '.agent/regenerate-pins.json'), {
      ...await pinMarkers(job.reel, version),
      ...Object.fromEntries(job.pins.map((pin) => [pin.id, pin.text])),
    });
  }

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
              await carryJobPins(job, version);
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
      if (newest) {
        latest.set(reel, newest);
        if (newest.state === 'copy-ready') {
          if (!closed) await startWatchingCopyJob(newest);
        }
      }
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

  async function start(reel: string, retry = false, kind: BrollJobRequest['kind'] = 'make-broll'): Promise<AgentJob> {
    await ready;
    if (closed) throw new KinottaError('invalid', 'The server is shutting down.');
    if (running.has(reel) || (latest.get(reel) && activeState(latest.get(reel)!.state))) throw new KinottaError('frozen', 'This reel already has an agent run.');
    stopWatching(reel);
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
      const previousRequest = retry && previous ? await json<BrollJobRequest>(join(jobDir(previous), 'request.json')) : undefined;
      if (previousRequest) kind = previousRequest.kind;
      const request = retry && previous
        ? makeBrollJobRequest(id, reel, baseVersion, { ...(await json<BrollJobRequest>(join(jobDir(previous), 'request.json'))).options, captions: captionMode }, manifest.duration, style, context)
        : makeBrollJobRequest(id, reel, baseVersion, { videoType: plan.videoType, broll: plan.broll, pace: plan.pace, captions: captionMode, notes: plan.notes }, manifest.duration, style, context);
      if (kind === 'regenerate') {
        if (provider === 'copy') throw new KinottaError('invalid', 'Use Copy request to copy the pin batch.');
        await settleNewest(projectDir, reel);
        const markers = await pinMarkers(reel, baseVersion);
        const pins = previousRequest?.pins ?? (await listComments(projectDir, reel, baseVersion)).filter((pin) => !pin.state && markers[pin.id] !== pin.text).map(({ id, number, text, pin }) => ({ id, number, text, pin }));
        if (!pins.length) throw new KinottaError('invalid', 'No new or changed pins to regenerate.');
        request.kind = 'regenerate';
        request.pins = pins;
      }
      const at = new Date().toISOString();
      job = { id, kind, ...(request.pins ? { pins: request.pins.map(({ id, text }) => ({ id, text, state: 'waiting' as const })) } : {}), reel, provider, state: 'queued', createdAt: at, updatedAt: at, elapsedSeconds: 0, quiet: false, canRetry: false, canCopy: false };
      const dir = jobDir(job);
      await mkdir(join(dir, 'input'), { recursive: true });
      await mkdir(join(dir, 'output'));
      await writeJsonAtomic(join(dir, 'request.json'), request);
      const { writeFile } = await import('node:fs/promises');
      await writeFile(join(dir, 'prompt.txt'), brollJobPrompt(request, true), 'utf8');
      await set(job);
      const current = job;
      void execute(current, source, plan, controller, request).catch(() => {
        // A status-write failure leaves the durable unfinished job recoverable as interrupted.
        current.state = 'failed'; current.canRetry = true; current.error = 'Could not save agent status. Check available disk space.';
      }).finally(() => {
        running.delete(reel);
        finish();
        if (current.state === 'copy-ready' && !closed) {
          void startWatchingCopyJob(current);
        }
      });
      return { ...current };
    } catch (error) {
      running.delete(reel); finish();
      if (job) await set({ ...job, state: 'failed', canRetry: true, error: 'Could not prepare the agent request. Retry or Copy request.' });
      throw error;
    }
  }

  async function validateAndPublish(job: AgentJob, request: BrollJobRequest, controller: AbortController, frozenPlan: Record<string, unknown>, inputTranscript: string): Promise<void> {
    const output = join(jobDir(job), 'output');
    await assertSafeCopyOutput(jobDir(job), output);
    await validateAgentOutput(output, controller.signal, frozenPlan, inputTranscript, request.kind);
    const reelDir = await requireReelDir(projectDir, job.reel);
    await withReelLock(reelDir, async () => {
      if (controller.signal.aborted) throw new Error('Agent cancelled.');
      const newest = await newestVersionNumber(reelDir);
      if (newest !== request.baseVersion) throw new Error('A newer version appeared during this run. Retry against the latest version.');
      const manifest = await json<Record<string, unknown>>(join(output, 'shots.json'));
      await writeJsonAtomic(join(output, 'shots.json'), { ...manifest, agentJobId: job.id });
      const number = await nextVersionNumber(reelDir);
      await publishVersion(reelDir, { dir: output }, number);
      // Replay every still-pending owner operation; publication does not consume the owner's journal.
      await readEditListNow(projectDir, job.reel);
      await applyPendingCuts(job, number);
      job.version = number;
      job.state = 'succeeded';
      job.canRetry = false;
      job.canCopy = false;
      delete job.error;
    });
    await settleNewest(projectDir, job.reel);
    await carryJobPins(job, job.version!);
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
      await removeCopyDoneMarker(dir, join(dir, 'output'));
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

  async function runAcceptOutput(reel: string, id: string): Promise<AgentJob> {
    if (closed) throw new KinottaError('frozen', 'Wait for the managed run to stop before submitting output.');
    const active = running.get(reel);
    if (active?.jobId === id) {
      await active.done;
      return { ...latest.get(reel)! };
    }
    if (active) throw new KinottaError('frozen', 'Wait for the managed run to stop before submitting output.');
    const job = latest.get(reel);
    if (!job || job.id !== id || !job.canRetry) throw new KinottaError('invalid', 'This is not the current unfinished request.');
    stopWatching(reel);
    let finish!: () => void;
    const done = new Promise<void>((resolveDone) => { finish = resolveDone; });
    const controller = new AbortController();
    running.set(reel, { jobId: id, controller, done });
    try {
      const outputDir = join(jobDir(job), 'output');
      await removeCopyDoneMarker(jobDir(job), outputDir);
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
  }

  return {
    async deletionReason(reel: string): Promise<string | null> {
      await ready;
      const job = latest.get(reel);
      return running.has(reel) || job && (activeState(job.state) || job.state === 'copy-ready') ? 'An agent job is running or handed off for this reel. Finish it before deleting it or a version.' : null;
    },
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
      return runAcceptOutput(reel, id);
    },
    async cancel(reel: string): Promise<AgentJob | null> {
      await ready;
      const reelDir = await requireReelDir(projectDir, reel);
      await withReelLock(reelDir, async () => {
        const active = running.get(reel);
        const job = latest.get(reel);
        if (active && job && (activeState(job.state) || (job.state === 'copy-ready' && active.jobId === job.id))) { job.state = 'cancelling'; active.controller.abort(); await set(job); }
      });
      await running.get(reel)?.done;
      const job = latest.get(reel);
      if (job && !activeState(job.state) && job.state !== 'copy-ready') {
        stopWatching(reel);
      }
      return job ?? null;
    },
    async whenDone(reel: string): Promise<void> { await ready; await running.get(reel)?.done; },
    async close(): Promise<void> {
      closed = true;
      for (const watcher of copyWatchers.values()) watcher.stop();
      copyWatchers.clear();
      await ready;
      for (const active of running.values()) active.controller.abort();
      await Promise.all([...running.values()].map((a) => a.done));
    },
  };
}
