import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { writeFileAtomic } from './state.ts';

/** In the reel folder, outside every version: which version's batch is out. */
export const HANDOFF_FILE = 'handoff.json';

/** A comment batch the owner copied and has not yet seen a new version for. */
export interface Handoff {
  /** The version the batch was copied from. */
  version: number;
  copiedAt: string;
}

/** Marks the reel handed off from `version`. A later copy replaces an earlier one. */
export async function recordHandoff(reelDir: string, version: number, copiedAt: string): Promise<void> {
  await writeFileAtomic(join(reelDir, HANDOFF_FILE), `${JSON.stringify({ version, copiedAt }, null, 2)}\n`);
}

/** The hand-off still in force: one made on the newest version. A newer version ends it without anything being written. */
export async function readHandoff(reelDir: string, newest: number): Promise<Handoff | null> {
  try {
    const parsed = JSON.parse(await readFile(join(reelDir, HANDOFF_FILE), 'utf8')) as Partial<Handoff>;
    if (!Number.isInteger(parsed.version) || typeof parsed.copiedAt !== 'string' || parsed.version !== newest) return null;
    return { version: parsed.version as number, copiedAt: parsed.copiedAt };
  } catch {
    return null;
  }
}

export async function clearHandoff(reelDir: string): Promise<void> {
  await rm(join(reelDir, HANDOFF_FILE), { force: true });
}

/** What Save and the Edits panel say while a batch is out. No agent is named: whoever takes the batch is not Kinotta's business. */
export const handoffReason = (version: number): string =>
  `A comment batch for v${version} is out. Save is off until the next version appears or you cancel the hand-off. Edits still collect.`;
