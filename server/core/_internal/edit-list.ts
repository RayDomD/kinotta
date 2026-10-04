import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { applyOperations } from './edit-model.ts';
import type { NewOperation, Operation, Plan } from './edit-model.ts';
import { KinottaError } from './errors.ts';
import type { EditList } from './types.ts';
import { readReelPlan } from './sources.ts';
import { newestVersionNumber, requireReelDir } from './version.ts';

/** The reel's unsaved edits: in the reel folder, outside every version, rewritten on every change. */
export const EDIT_LIST_FILE = 'edit-list.json';
const KINDS: ReadonlySet<string> = new Set<Operation['kind']>(['snip']);

const queues = new Map<string, Promise<unknown>>();

/** Runs `task` after every earlier task on the same reel, so two changes never write the reel's files at once. */
export function withReelLock<T>(reelDir: string, task: () => Promise<T>): Promise<T> {
  const run = (queues.get(reelDir) ?? Promise.resolve()).then(task, task);
  queues.set(reelDir, run.catch(() => undefined));
  return run;
}

export async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  const staged = `${file}.tmp`;
  await writeFile(staged, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(staged, file);
}

async function readStored(reelDir: string): Promise<{ base: number; operations: Operation[] } | null> {
  try {
    const parsed = JSON.parse(await readFile(join(reelDir, EDIT_LIST_FILE), 'utf8')) as { base?: unknown; operations?: unknown };
    if (!Number.isInteger(parsed.base) || !Array.isArray(parsed.operations)) return null;
    return { base: parsed.base as number, operations: (parsed.operations as Operation[]).filter((op) => KINDS.has(op?.kind)) };
  } catch {
    return null;
  }
}

/** The reel's edit list. One kept for a version that is no longer the newest is `stale` and cannot be saved. */
export async function readEditList(projectDir: string, slug: string): Promise<EditList> {
  const reelDir = await requireReelDir(projectDir, slug);
  const newest = await newestVersionNumber(reelDir);
  const stored = await readStored(reelDir);
  if (stored === null || stored.operations.length === 0) return { base: newest, operations: [] };
  return stored.base === newest ? stored : { ...stored, stale: true };
}

/** Adds an operation to the list, after checking it applies on top of the ones already there. */
export async function addOperation(projectDir: string, slug: string, input: NewOperation): Promise<EditList> {
  const reelDir = await requireReelDir(projectDir, slug);
  return withReelLock(reelDir, async () => {
    const list = await readEditList(projectDir, slug);
    if (list.stale) throw new KinottaError('frozen', `The edit list was made on v${list.base}, which is no longer the newest version. Discard it to start again.`);
    if (!KINDS.has((input as { kind?: string }).kind ?? '')) throw new KinottaError('invalid', 'That kind of edit is not supported.');
    const operation = { ...input, id: randomUUID() } as Operation;
    applyOperations({ plan: (await readReelPlan(projectDir, reelDir)).plan, words: [] }, [...list.operations, operation]);
    const next = { base: list.base, operations: [...list.operations, operation] };
    await writeJsonAtomic(join(reelDir, EDIT_LIST_FILE), next);
    return next;
  });
}

/** Drops the whole list. */
export async function discardEdits(projectDir: string, slug: string): Promise<EditList> {
  const reelDir = await requireReelDir(projectDir, slug);
  return withReelLock(reelDir, async () => {
    await rm(join(reelDir, EDIT_LIST_FILE), { force: true });
    return readEditList(projectDir, slug);
  });
}
