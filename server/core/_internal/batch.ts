import { join } from 'node:path';
import { sectionOfComment, settleNewest } from './carry.ts';
import { NO_SHOT, numbered } from './comments.ts';
import { KinottaError } from './errors.ts';
import { readTitle } from './reels.ts';
import { readState, serialized, stateFilePath, writeFileAtomic, writeState } from './state.ts';
import type { BatchOptions, Comment, CopiedBatch, Section, Version } from './types.ts';
import { assertTakesComments } from './version.ts';

const REELS_DIR = 'reels';
const WHOLE_REEL_FILE = 'comments.json';
const SECONDS_PER_MINUTE = 60;
const PLAIN_LIMIT = 100;
const PERCENT = 100;
const UNSAFE_FILE_CHARS = /[^A-Za-z0-9._-]/g;

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

function pasteableText(heading: string, file: string, comments: Comment[], notes: string[], issues: string[]): string {
  const lines = [`Kinotta comments: ${heading}`, `Saved as ${file}`, ''];
  for (const c of comments) {
    const where = c.pin.shot === NO_SHOT ? '' : `Shot ${c.pin.shot}, `;
    lines.push(`${c.number}. ${where}${timecode(c.pin.time)}s, ${target(c)}: ${c.text}`);
  }
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

/** The section a copy is for: the only one on a one-section reel, else the one asked for. */
function sectionToCopy(sections: Section[], sectionId: string | undefined): { section: Section; index: number } {
  if (sections.length === 1) return { section: sections[0]!, index: 0 };
  const index = sections.findIndex((s) => s.id === sectionId);
  if (index < 0) {
    throw new KinottaError('invalid', sectionId === undefined ? 'Choose which section to copy.' : `This version has no section "${sectionId}".`);
  }
  return { section: sections[index]!, index };
}

/**
 * Writes a version's comment batch into its folder (the only place the editor writes there) and returns the pasteable
 * text. A reel with one section gets `comments.json` for the whole reel. A reel with several gets
 * `comments-<sectionId>.json` for the one section asked for. The reel note goes into every batch, and the contract
 * issues when asked for. The copy is recorded in the version's editor state as that section's latest hand-off, which is
 * what makes its comments "sent" and the section "waiting".
 */
export async function copyBatch(projectDir: string, slug: string, number: number, options: BatchOptions = {}): Promise<CopiedBatch> {
  await settleNewest(projectDir, slug);
  const version = await assertTakesComments(projectDir, slug, number);
  const { section, index } = sectionToCopy(version.sections, options.section);
  const whole = version.sections.length === 1;
  const issues = issueMessages(version, options);
  const stateFile = stateFilePath(projectDir, slug, number);
  const title = (await readTitle(join(projectDir, REELS_DIR, slug))) ?? slug;
  const fileName = whole ? WHOLE_REEL_FILE : `comments-${section.id.replace(UNSAFE_FILE_CHARS, '_')}.json`;
  const file = `${REELS_DIR}/${slug}/v${number}/${fileName}`;
  const path = join(projectDir, REELS_DIR, slug, `v${number}`, fileName);
  const heading = whole ? `${title}, v${number}` : `${title}, v${number}, section ${pad(index + 1)} ${section.name}`;

  return serialized(stateFile, async () => {
    const state = await readState(stateFile, number);
    const comments = numbered(state.comments).filter((c) => whole || sectionOfComment(version, c) === section.id);
    const note = state.note.trim();
    const notes = note === '' ? [] : [note];
    if (comments.length === 0 && notes.length === 0) {
      throw new KinottaError('invalid', 'There are no comments or notes to copy yet.');
    }

    const copiedAt = new Date().toISOString();
    const batch = {
      reel: slug,
      title,
      version: number,
      section: whole ? null : section.id,
      copiedAt,
      comments: comments.map((c) => ({
        number: c.number,
        shot: c.pin.shot === NO_SHOT ? null : c.pin.shot,
        time: c.pin.time,
        ...(c.pin.kind === 'word' ? { word: c.pin.word, element: null } : { element: c.pin.element, x: c.pin.x, y: c.pin.y }),
        text: c.text,
      })),
      notes,
      ...(issues.length > 0 ? { issues } : {}),
    };
    await writeFileAtomic(path, `${JSON.stringify(batch, null, 2)}\n`);
    await writeState(stateFile, {
      ...state,
      handedOff: { ...state.handedOff, [section.id]: { copiedAt, commentIds: comments.map((c) => c.id) } },
    });
    return { text: pasteableText(heading, file, comments, notes, issues), file, count: comments.length };
  });
}
