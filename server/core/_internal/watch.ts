import { existsSync, readdirSync, statSync, watch } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import { join } from 'node:path';
import type { ProjectEvent } from './types.ts';

const STATE_DIR = '.kinotta';
const SHOTS_FILE = 'shots.json';
const APPROVAL_FILE = 'approval.json';
const VERSION_DIR = /^v(\d+)$/;
const TEMP_FILE = /\.tmp$/;
const DEBOUNCE_MS = 150;
/** Used only where recursive fs.watch is unavailable. */
const POLL_MS = 1000;

type Listener = (event: ProjectEvent) => void;

/** What is on disk that events are about: reels, version folders with a shots.json, saved comment files, and approvals. */
interface Snapshot {
  reels: Set<string>;
  /** `<reel>/<n>` */
  versions: Set<string>;
  /** `<reel>/<n>` to the state file's mtime and size. */
  states: Map<string, string>;
  /** `<reel>/<n>` of every version folder with an approval.json. */
  approvals: Set<string>;
}

function subdirs(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

function takeSnapshot(reelsDir: string): Snapshot {
  const snapshot: Snapshot = { reels: new Set(), versions: new Set(), states: new Map(), approvals: new Set() };
  for (const reel of subdirs(reelsDir)) {
    snapshot.reels.add(reel);
    for (const name of subdirs(join(reelsDir, reel))) {
      const match = VERSION_DIR.exec(name);
      if (match && existsSync(join(reelsDir, reel, name, SHOTS_FILE))) snapshot.versions.add(`${reel}/${match[1]}`);
      if (match && existsSync(join(reelsDir, reel, name, APPROVAL_FILE))) snapshot.approvals.add(`${reel}/${match[1]}`);
    }
  }
  const stateRoot = join(reelsDir, STATE_DIR);
  try {
    for (const reel of readdirSync(stateRoot, { withFileTypes: true }).filter((e) => e.isDirectory())) {
      for (const file of readdirSync(join(stateRoot, reel.name))) {
        const match = /^v(\d+)\.json$/.exec(file);
        if (!match || TEMP_FILE.test(file)) continue;
        const { mtimeMs, size } = statSync(join(stateRoot, reel.name, file));
        snapshot.states.set(`${reel.name}/${match[1]}`, `${mtimeMs}:${size}`);
      }
    }
  } catch {
    // No editor state yet, or a file was replaced while reading. The next check sees it.
  }
  return snapshot;
}

const splitKey = (key: string): { reel: string; version: number } => {
  const at = key.lastIndexOf('/');
  return { reel: key.slice(0, at), version: Number(key.slice(at + 1)) };
};

function diff(before: Snapshot, after: Snapshot): ProjectEvent[] {
  const events: ProjectEvent[] = [];
  const reelsMoved = [...before.reels].some((r) => !after.reels.has(r)) || [...after.reels].some((r) => !before.reels.has(r));
  const versionGone = [...before.versions].some((v) => !after.versions.has(v));
  if (reelsMoved || versionGone) events.push({ type: 'reels-changed' });
  for (const key of after.versions) {
    if (!before.versions.has(key)) events.push({ type: 'version-added', ...splitKey(key) });
  }
  for (const [key, stamp] of after.states) {
    if (before.states.get(key) !== stamp) events.push({ type: 'comments-changed', ...splitKey(key) });
  }
  for (const key of after.approvals) {
    if (!before.approvals.has(key)) events.push({ type: 'approval-changed', ...splitKey(key), approved: true });
  }
  for (const key of before.approvals) {
    if (!after.approvals.has(key)) events.push({ type: 'approval-changed', ...splitKey(key), approved: false });
  }
  return events;
}

/**
 * Watches a reels folder for as long as anyone is subscribed. Every burst of file events (or poll tick) becomes one
 * comparison of the folder against the last one seen, so events are debounced and never repeat.
 */
export function createWatcher(reelsDir: string): { subscribe(listener: Listener): () => void } {
  const listeners = new Set<Listener>();
  let snapshot: Snapshot | null = null;
  let watcher: FSWatcher | null = null;
  let poll: NodeJS.Timeout | null = null;
  let pending: NodeJS.Timeout | null = null;

  function check(): void {
    pending = null;
    if (snapshot === null) return;
    const next = takeSnapshot(reelsDir);
    const events = diff(snapshot, next);
    snapshot = next;
    for (const event of events) for (const listener of [...listeners]) listener(event);
  }

  function schedule(): void {
    pending ??= setTimeout(check, DEBOUNCE_MS);
  }

  function start(): void {
    snapshot = takeSnapshot(reelsDir);
    try {
      watcher = watch(reelsDir, { recursive: true }, (_type, filename) => {
        if (!filename || !TEMP_FILE.test(filename.toString())) schedule();
      });
      watcher.on('error', () => {
        watcher?.close();
        watcher = null;
        startPolling();
      });
    } catch {
      startPolling();
    }
  }

  function startPolling(): void {
    poll ??= setInterval(schedule, POLL_MS);
    poll.unref();
  }

  function stop(): void {
    watcher?.close();
    watcher = null;
    if (poll) clearInterval(poll);
    poll = null;
    if (pending) clearTimeout(pending);
    pending = null;
    snapshot = null;
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) start();
      return () => {
        if (!listeners.delete(listener)) return;
        if (listeners.size === 0) stop();
      };
    },
  };
}
