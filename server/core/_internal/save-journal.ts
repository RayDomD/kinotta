import { readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Save writes the edits into the reel's sources (plan, transcript) before it publishes the version, and the rename that
 * publishes it is the commit point. This journal, kept in the reel folder from just before the first source write to
 * just after the edit list is cleared, is what lets a crash in between be told apart on the next read: a version
 * `v<version>` that exists means the Save committed (the sources hold the edits, the list is spent); one that does not
 * means it did not (the sources go back to what the journal holds, the list stays).
 */
export const SAVE_INTENT_FILE = 'save-intent.json';

interface SaveJournal {
  /** The version the Save was building. */
  version: number;
  /** Every source file the Save writes, as it was before. */
  files: { file: string; text: string }[];
}

/** Records what the sources hold now, before Save changes them. `files` that do not exist are left out by the caller. */
export async function beginSave(reelDir: string, version: number, files: SaveJournal['files']): Promise<void> {
  await writeFile(join(reelDir, SAVE_INTENT_FILE), `${JSON.stringify({ version, files } satisfies SaveJournal, null, 2)}\n`, 'utf8');
}

/** The Save is over, however it ended: the journal goes. */
export const endSave = (reelDir: string): Promise<void> => rm(join(reelDir, SAVE_INTENT_FILE), { force: true });

/** Puts the sources back to what the journal holds. */
export async function rollBackSources(files: SaveJournal['files']): Promise<void> {
  for (const { file, text } of files) await writeFile(file, text, 'utf8');
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
  const committed = await stat(join(reelDir, `v${journal.version}`)).then(() => true, () => false);
  if (committed) await rm(join(reelDir, editListFile), { force: true });
  else await rollBackSources(journal.files);
  await endSave(reelDir);
}
