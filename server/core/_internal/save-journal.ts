import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BUILT_BY_YOU } from './edit-model.ts';

/**
 * Save writes the edits into the reel's sources (plan, transcript) before it publishes the version, and the rename that
 * publishes it is the commit point. This journal, kept in the reel folder from just before the first source write to
 * just after the edit list is cleared, is what lets a crash in between be told apart on the next read. The Save
 * committed when `v<version>` exists and is the Save's own: built by Kinotta, applying exactly the journaled operations
 * (an agent may build `v<version>` after a crash, and that is not the Save). Then the sources hold the edits and the list
 * is spent. Otherwise the sources go back to what the journal holds and the list stays, to replay onto what is newest.
 */
export const SAVE_INTENT_FILE = 'save-intent.json';

interface SaveJournal {
  /** The version the Save was building. */
  version: number;
  /** Every source file the Save writes, as it was before. */
  files: { file: string; text: string }[];
  /** The ids of the operations the Save applies, in order. */
  operations: string[];
}

/** Records what the sources hold now, before Save changes them. `files` that do not exist are left out by the caller. */
export async function beginSave(reelDir: string, version: number, files: SaveJournal['files'], operations: string[]): Promise<void> {
  await writeFile(join(reelDir, SAVE_INTENT_FILE), `${JSON.stringify({ version, files, operations } satisfies SaveJournal, null, 2)}\n`, 'utf8');
}

/** The Save is over, however it ended: the journal goes. */
export const endSave = (reelDir: string): Promise<void> => rm(join(reelDir, SAVE_INTENT_FILE), { force: true });

/** Puts the sources back to what the journal holds. */
export async function rollBackSources(files: SaveJournal['files']): Promise<void> {
  for (const { file, text } of files) await writeFile(file, text, 'utf8');
}

/** Whether `versionDir` is the version the journaled Save built: Kinotta's own, with exactly the journaled operations in its edits.json. */
async function isOwnSave(versionDir: string, operations: string[]): Promise<boolean> {
  try {
    const shots = JSON.parse(await readFile(join(versionDir, 'shots.json'), 'utf8')) as { builtBy?: unknown };
    const edits = JSON.parse(await readFile(join(versionDir, 'edits.json'), 'utf8')) as { operations?: { id?: unknown }[] };
    const ids = (edits.operations ?? []).map((op) => op.id);
    return shots.builtBy === BUILT_BY_YOU && ids.length === operations.length && ids.every((id, i) => id === operations[i]);
  } catch {
    return false;
  }
}

/**
 * Finishes a Save a crash cut short, if one did. Under the reel's lock, before the edit list is read.
 * `editListFile` is the list's file name in the reel folder.
 */
export async function recoverSave(reelDir: string, editListFile: string): Promise<void> {
  let journal: SaveJournal;
  try {
    journal = JSON.parse(await readFile(join(reelDir, SAVE_INTENT_FILE), 'utf8')) as SaveJournal;
  } catch {
    return;
  }
  const committed = await isOwnSave(join(reelDir, `v${journal.version}`), journal.operations ?? []);
  if (committed) await rm(join(reelDir, editListFile), { force: true });
  else await rollBackSources(journal.files);
  await endSave(reelDir);
}
