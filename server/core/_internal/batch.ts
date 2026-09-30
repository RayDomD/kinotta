import { randomUUID } from 'node:crypto';
import { rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { numbered, readState, serialized, stateFilePath } from './comments.ts';
import { KinottaError } from './errors.ts';
import { readTitle } from './reels.ts';
import type { BatchOptions, Comment, CopiedBatch, Version } from './types.ts';
import { assertTakesComments } from './version.ts';

const REELS_DIR = 'reels';
const BATCH_FILE = 'comments.json';
const SECONDS_PER_MINUTE = 60;
const PLAIN_LIMIT = 100;
const PERCENT = 100;

const pad = (n: number): string => String(n).padStart(2, '0');

/** The same timecode the UI shows on shots: `03.60`, or `mm:ss.ff` past 99s. */
function timecode(seconds: number): string {
  const hundredths = Math.round(Math.max(0, seconds) * 100);
  const whole = Math.floor(hundredths / 100);
  const fraction = pad(hundredths % 100);
  if (whole < PLAIN_LIMIT) return `${pad(whole)}.${fraction}`;
  return `${pad(Math.floor(whole / SECONDS_PER_MINUTE))}:${pad(whole % SECONDS_PER_MINUTE)}.${fraction}`;
}

function target({ pin }: Comment): string {
  if (pin.kind === 'word') return `word “${pin.word}”`;
  return pin.element ?? `position ${Math.round(pin.x * PERCENT)}% ${Math.round(pin.y * PERCENT)}%`;
}

function pasteableText(title: string, version: number, file: string, comments: Comment[], notes: string[], issues: string[]): string {
  const lines = [`Kinotta comments: ${title}, v${version}`, `Saved as ${file}`, ''];
  for (const c of comments) lines.push(`${c.number}. Shot ${c.pin.shot}, ${timecode(c.pin.time)}s, ${target(c)}: ${c.text}`);
  lines.push('');
  if (notes.length > 0) lines.push('Notes', ...notes.map((n) => `- ${n}`), '');
  if (issues.length > 0) lines.push('Contract issues', ...issues.map((i) => `- ${i}`), '');
  return lines.join('\n');
}

/** The version's own contract issues followed by the browser's, each message once. Empty unless the batch asks for them. */
function issueMessages(version: Version, options: BatchOptions): string[] {
  if (options.includeIssues !== true) return [];
  const runtime = (options.runtimeIssues ?? []).filter((m) => typeof m === 'string' && m.trim() !== '');
  return [...new Set([...version.issues.map((i) => i.message), ...runtime])];
}

/**
 * Writes a version's comment batch into its folder (the only place the editor writes there) and returns the
 * pasteable text. `section` is null for the whole reel; per-section batches extend this later.
 */
export async function copyBatch(projectDir: string, slug: string, number: number, options: BatchOptions = {}): Promise<CopiedBatch> {
  const version = await assertTakesComments(projectDir, slug, number);
  const state = await readState(stateFilePath(projectDir, slug, number), number);
  const comments = numbered(state.comments);
  const note = state.note.trim();
  const notes = note === '' ? [] : [note];
  if (comments.length === 0 && notes.length === 0) {
    throw new KinottaError('invalid', 'There are no comments or notes to copy yet.');
  }

  const issues = issueMessages(version, options);
  const title = (await readTitle(join(projectDir, REELS_DIR, slug))) ?? slug;
  const file = `${REELS_DIR}/${slug}/v${number}/${BATCH_FILE}`;
  const path = join(projectDir, REELS_DIR, slug, `v${number}`, BATCH_FILE);
  const batch = {
    reel: slug,
    title,
    version: number,
    section: null,
    copiedAt: new Date().toISOString(),
    comments: comments.map((c) => ({
      number: c.number,
      shot: c.pin.shot,
      time: c.pin.time,
      ...(c.pin.kind === 'word' ? { word: c.pin.word, element: null } : { element: c.pin.element, x: c.pin.x, y: c.pin.y }),
      text: c.text,
    })),
    notes,
    ...(issues.length > 0 ? { issues } : {}),
  };
  await serialized(path, async () => {
    const temp = `${path}.${randomUUID()}.tmp`;
    await writeFile(temp, `${JSON.stringify(batch, null, 2)}\n`);
    await rename(temp, path);
  });
  return { text: pasteableText(title, number, file, comments, notes, issues), file, count: comments.length };
}
