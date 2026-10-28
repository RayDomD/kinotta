import { readdirSync, statSync, watch } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import { lstat, realpath, rm } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import { DONE_MARKER } from './requests.ts';

export { DONE_MARKER };
export const COPY_SETTLE_MS = 2000;
const MAX_POLL_MS = 250;
const MIN_POLL_MS = 25;
const POLL_SETTLE_DIVISOR = 4;

export async function assertSafeCopyOutput(jobDir: string, outputDir: string): Promise<void> {
  const jobInfo = await lstat(jobDir);
  const outputInfo = await lstat(outputDir);
  if (!jobInfo.isDirectory() || jobInfo.isSymbolicLink()) throw new Error('Agent job folder must be a real directory.');
  if (!outputInfo.isDirectory() || outputInfo.isSymbolicLink()) throw new Error('Agent output must be a real private directory.');
  const [jobRoot, outputRoot] = await Promise.all([realpath(jobDir), realpath(outputDir)]);
  const relativeOutput = relative(jobRoot, outputRoot);
  if (isAbsolute(relativeOutput) || relativeOutput === '..' || relativeOutput.startsWith(`..${sep}`)) {
    throw new Error('Agent output must stay inside its job folder.');
  }
}

export async function hasRegularDoneMarker(outputDir: string): Promise<boolean> {
  try {
    const marker = await lstat(join(outputDir, DONE_MARKER));
    if (!marker.isFile() || marker.isSymbolicLink()) throw new Error('Agent completion marker must be a regular file.');
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

export async function removeCopyDoneMarker(jobDir: string, outputDir: string): Promise<void> {
  await assertSafeCopyOutput(jobDir, outputDir);
  if (await hasRegularDoneMarker(outputDir)) await rm(join(outputDir, DONE_MARKER));
}

export interface CopyWatchHandle {
  stop(): void;
}

export interface CopyWatchOptions {
  settleMs?: number;
}

function takeOutputSnapshot(dir: string): Map<string, string> {
  const map = new Map<string, string>();
  function scan(current: string): void {
    let entries: import('node:fs').Dirent[];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        scan(full);
      } else if (entry.isFile()) {
        try {
          const st = statSync(full);
          map.set(relative(dir, full), `${st.mtimeMs}:${st.size}`);
        } catch {
          // ignore transient errors
        }
      }
    }
  }
  scan(dir);
  return map;
}

function snapshotsEqual(a: Map<string, string>, b: Map<string, string>): boolean {
  if (a.size !== b.size) return false;
  for (const [key, val] of a) {
    if (b.get(key) !== val) return false;
  }
  return true;
}

/**
 * Watches a copy-ready job's output directory. When DONE appears and writes have settled
 * (no further change for settleMs), triggers the onSettle callback. Acceptance removes DONE.
 */
export function watchCopyOutput(
  jobDir: string,
  outputDir: string,
  onSettle: () => Promise<void> | void,
  onFailure: (error: unknown) => Promise<void> | void,
  options: CopyWatchOptions = {},
): CopyWatchHandle {
  const settleMs = options.settleMs ?? COPY_SETTLE_MS;
  let closed = false;
  let settling = false;
  let watcher: FSWatcher | null = null;
  let poll: NodeJS.Timeout | null = null;
  let settleTimer: NodeJS.Timeout | null = null;
  let snapshot = new Map<string, string>();

  /** Reports a failure; a failing reporter must not become an unhandled rejection that takes the server down. */
  async function fail(error: unknown): Promise<void> {
    try {
      await onFailure(error);
    } catch (reportError) {
      console.error('Kinotta: could not record a copy-output failure.', reportError);
    }
  }

  async function triggerSettle(): Promise<void> {
    settleTimer = null;
    if (closed || settling) return;
    settling = true;
    stop();
    try {
      await onSettle();
    } catch (error) {
      await fail(error);
    }
  }

  function onActivity(): void {
    if (closed || settling) return;
    void (async () => {
      try {
        await assertSafeCopyOutput(jobDir, outputDir);
        const hasDone = await hasRegularDoneMarker(outputDir);
        if (closed || settling) return;
        if (hasDone) {
          if (settleTimer) clearTimeout(settleTimer);
          settleTimer = setTimeout(() => { void triggerSettle(); }, settleMs);
        } else if (settleTimer) {
          clearTimeout(settleTimer);
          settleTimer = null;
        }
      } catch (error) {
        if (closed || settling) return;
        stop();
        await fail(error);
      }
    })();
  }

  function startPolling(): void {
    if (poll || closed) return;
    snapshot = takeOutputSnapshot(outputDir);
    const pollInterval = Math.min(MAX_POLL_MS, Math.max(MIN_POLL_MS, Math.floor(settleMs / POLL_SETTLE_DIVISOR)));
    poll = setInterval(() => {
      if (closed || settling) return;
      const next = takeOutputSnapshot(outputDir);
      if (!snapshotsEqual(snapshot, next)) {
        snapshot = next;
        onActivity();
      }
    }, pollInterval);
    poll.unref();
  }

  function start(): void {
    snapshot = takeOutputSnapshot(outputDir);
    try {
      watcher = watch(outputDir, { recursive: true }, () => {
        onActivity();
      });
      watcher.on('error', () => {
        watcher?.close();
        watcher = null;
        startPolling();
      });
    } catch {
      startPolling();
    }
    onActivity();
  }

  function stop(): void {
    closed = true;
    if (settleTimer) {
      clearTimeout(settleTimer);
      settleTimer = null;
    }
    if (watcher) {
      watcher.close();
      watcher = null;
    }
    if (poll) {
      clearInterval(poll);
      poll = null;
    }
  }

  start();

  return { stop };
}
