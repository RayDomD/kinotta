import { existsSync, readdirSync, statSync, watch } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { DONE_MARKER } from './requests.ts';

export { DONE_MARKER };
export const COPY_SETTLE_MS = 2000;

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
 * (no further change for settleMs), deletes DONE and triggers the onSettle callback.
 */
export function watchCopyOutput(
  outputDir: string,
  onSettle: () => Promise<void> | void,
  options: CopyWatchOptions = {},
): CopyWatchHandle {
  const settleMs = options.settleMs ?? COPY_SETTLE_MS;
  let closed = false;
  let settling = false;
  let watcher: FSWatcher | null = null;
  let poll: NodeJS.Timeout | null = null;
  let settleTimer: NodeJS.Timeout | null = null;
  let snapshot = new Map<string, string>();

  async function triggerSettle(): Promise<void> {
    settleTimer = null;
    if (closed || settling) return;
    const marker = join(outputDir, DONE_MARKER);
    if (!existsSync(marker)) return;
    settling = true;
    stop();
    try {
      await rm(marker, { force: true });
      await onSettle();
    } catch {
      // Handled by acceptance / caller
    }
  }

  function onActivity(): void {
    if (closed || settling) return;
    const marker = join(outputDir, DONE_MARKER);
    if (existsSync(marker)) {
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        void triggerSettle();
      }, settleMs);
    } else {
      if (settleTimer) {
        clearTimeout(settleTimer);
        settleTimer = null;
      }
    }
  }

  function startPolling(): void {
    if (poll || closed) return;
    snapshot = takeOutputSnapshot(outputDir);
    const pollInterval = Math.min(250, Math.max(25, Math.floor(settleMs / 4)));
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
    if (existsSync(join(outputDir, DONE_MARKER))) {
      onActivity();
    }
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
