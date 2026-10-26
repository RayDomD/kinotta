import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readState, stateFilePath, writeFileAtomic } from './state.ts';
import { newestVersionNumber, requireReelDir } from './version.ts';
import { isSent } from './carry.ts';
import { addReelRule } from './style.ts';
import { withReelLock } from './edit-list.ts';
import { KinottaError } from './errors.ts';

export interface BuiltPinNote { id: string; text: string }
const decisionFile = async (projectDir: string, slug: string) => join(await requireReelDir(projectDir, slug), 'pin-note-decisions.json');
async function decisions(projectDir: string, slug: string): Promise<Record<string, true>> {
  return JSON.parse(await readFile(await decisionFile(projectDir, slug), 'utf8').catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return '{}'; throw error; }));
}

/** A frozen hand-off is not a built answer. Only the newest authored build can offer its batch notes. */
export async function builtPinNotes(projectDir: string, slug: string): Promise<BuiltPinNote[]> {
  const reelDir = await requireReelDir(projectDir, slug);
  const newest = await newestVersionNumber(reelDir);
  const completed = await decisions(projectDir, slug);
  let authored = 0;
  for (let number = newest; number > 1; number--) {
    const manifest = JSON.parse(await readFile(join(reelDir, `v${number}`, 'shots.json'), 'utf8'));
    if (manifest.builtBy !== 'you' && !manifest.frozenBy) { authored = number; break; }
  }
  if (!authored) return [];
  // The latest hand-off preceding this authored answer is the batch it was asked to build.
  for (let number = authored - 1; number >= 1; number--) {
    const state = await readState(stateFilePath(projectDir, slug, number), number);
    if (!state.handedOff || !Object.keys(state.handedOff).length) continue;
    const notes = state.comments.filter((comment) => comment.effect && !comment.insertShot && comment.text.trim() && isSent(state.handedOff, comment.id));
    return notes.map((comment) => ({ id: createHash('sha256').update(`${comment.id}\0${comment.text}`).digest('hex'), text: comment.text })).filter((note) => !completed[note.id]);
  }
  return [];
}

/** Caller already owns the reel lock (a batch is about to be handed off). Ignoring is the default. */
export async function dismissBuiltPinNotes(projectDir: string, slug: string): Promise<void> {
  const pending = await builtPinNotes(projectDir, slug);
  if (!pending.length) return;
  const next = { ...await decisions(projectDir, slug), ...Object.fromEntries(pending.map((note) => [note.id, true])) };
  await writeFileAtomic(await decisionFile(projectDir, slug), JSON.stringify(next));
}

export async function decidePinNote(projectDir: string, slug: string, id: string, keep: boolean): Promise<void> {
  const reelDir = await requireReelDir(projectDir, slug);
  return withReelLock(reelDir, async () => {
    if (typeof keep !== 'boolean') throw new KinottaError('invalid', 'Choose whether to keep this note.');
    const note = (await builtPinNotes(projectDir, slug)).find((note) => note.id === id);
    if (!note) throw new KinottaError('not-found', 'This note has already been answered or is not built yet.');
    if (keep) await addReelRule(projectDir, slug, note.text);
    await writeFileAtomic(await decisionFile(projectDir, slug), JSON.stringify({ ...await decisions(projectDir, slug), [id]: true }));
  });
}
