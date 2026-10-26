import { dismissBuiltPinNotes } from './pin-notes.ts';
import { join } from 'node:path';
import { carriedComment, isSent, sectionOfComment, settleNewest } from './carry.ts';
import { commentsForVersion, NO_SHOT, numbered } from './comments.ts';
import { KinottaError } from './errors.ts';
import { recordHandoff } from './handoff.ts';
import { readTitle } from './reels.ts';
import { readState, serialized, stateFilePath, writeFileAtomic, writeState } from './state.ts';
import type { BatchOptions, Comment, CopiedBatch, Section, Version } from './types.ts';
import { readVersion, assertTakesComments, requireReelDir } from './version.ts';

import { withReelLock } from './edit-list.ts';
import { freezeEditsNow } from './save.ts';

const REELS_DIR = 'reels';
const WHOLE_REEL_FILE = 'comments.json';
const SECONDS_PER_MINUTE = 60;
const PLAIN_LIMIT = 100;
const PERCENT = 100;
const UNSAFE_FILE_CHARS = /[^A-Za-z0-9._-]/g;
/** A single-page reel has no shot revisions to offer, so the answer to an options request is its conversion. */
const CONVERT_TO_PARTS = 'Convert to parts: this reel is single-page. Build its next version as parts, then offer the alternates on that shot.';

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

function pasteableText(heading: string, file: string, comments: Comment[], notes: string[], issues: string[], version: Version): string {
  const onShot = (comment: Comment, shot: Version['shots'][number]): boolean => comment.pin.kind === 'frame' && comment.pin.shotName ? comment.pin.shotName === shot.name : comment.pin.shot === shot.number;
  const partsShots = version.parts ? version.shots.filter((shot) => comments.some((comment) => onShot(comment, shot))) : [];
  const lines = [...(version.parts ? [`Rebuild: ${partsShots.map((shot) => shot.name).join(', ')}`] : []), `Kinotta comments: ${heading}`, `Saved as ${file}`, ''];
  const alternateLines = (shot: Version['shots'][number]) => {
    if (!shot.alternates) return;
    const chosen = shot.alternates.find((alternate) => alternate.inReel);
    lines.push(`In the reel: ${chosen?.label ?? shot.revision}`);
    for (const alternate of shot.alternates) if (alternate.dismissed) lines.push(`Not this: ${alternate.label}${alternate.dismissed.reason ? ` · ${alternate.dismissed.reason}` : ''}`);
  };
  const asking = version.parts ? undefined : comments.find((comment) => comment.options !== undefined);
  if (asking) lines.push(`Shot ${asking.pin.shot} · ${asking.options} alternates`, CONVERT_TO_PARTS, '');
  let group = '';
  for (const c of version.parts ? partsShots.flatMap((shot) => comments.filter((comment) => onShot(comment, shot))) : comments) {
    if (version.parts && group !== c.pin.shot) {
      group = c.pin.shot;
      const options = comments.filter((comment) => comment.pin.shot === group).find((comment) => comment.options !== undefined)?.options;
      lines.push(`Shot ${group} · ${options ? `${options} alternates` : version.shots.find((shot) => shot.number === group)?.name ?? group}`);
      const shot = version.shots.find((shot) => shot.number === group);
      if (shot) alternateLines(shot);
    }
    const where = c.pin.shot === NO_SHOT ? '' : `Shot ${c.pin.shot}, `;
    const revision = c.pin.kind === 'frame' ? c.pin.alternate : undefined;
    const label = revision ? version.shots.find((shot) => shot.number === c.pin.shot)?.alternates?.find((alternate) => alternate.revision === revision)?.label ?? revision : undefined;
    lines.push(`${c.number}. ${where}${label ? `alternate ${label}, ` : ''}${timecode(c.pin.time)}s, ${target(c)}: ${c.effect ? `Effect: ${c.effect}. ` : c.insertShot ? `Insert shot after ${c.pin.shot}: ` : ''}${c.text}`);
  }
  for (const shot of version.shots) if (shot.alternates && !partsShots.includes(shot)) {
    lines.push(`Shot ${shot.number} · ${shot.name}`);
    alternateLines(shot);
  }
  if (version.parts) for (const comment of comments) if (!partsShots.some((shot) => onShot(comment, shot))) {
    const name = comment.pin.kind === 'frame' ? comment.pin.shotName : undefined;
    lines.push(`Removed shot ${name ?? comment.pin.shot}`, `${comment.number}. ${timecode(comment.pin.time)}s, ${target(comment)}: ${comment.text}`, comment.stateReason ?? 'The pinned shot is no longer in this version.');
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
async function copyBatchNow(projectDir: string, slug: string, number: number, options: BatchOptions = {}): Promise<CopiedBatch> {
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
    const comments = numbered(await commentsForVersion(projectDir, slug, number, state.comments)).filter((c) => !c.instant && (whole || sectionOfComment(version, c) === section.id));
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
        ...(c.pin.kind === 'word' ? { word: c.pin.word, element: null } : { element: c.pin.element, x: c.pin.x, y: c.pin.y, ...(c.pin.shotName ? { shotName: c.pin.shotName } : {}), ...(c.pin.alternate ? { alternate: c.pin.alternate } : {}) }),
        text: c.text,
        ...(c.options === undefined ? {} : { options: c.options }),
        ...(c.effect ? { effect: c.effect } : {}),
        ...(c.insertShot ? { insertShot: true } : {}),
      })),
      notes,
      ...(version.parts ? { shots: version.shots.filter((shot) => shot.alternates).map((shot) => ({ name: shot.name, number: shot.number, inReel: shot.revision, alternates: shot.alternates })) } : {}),
      ...(issues.length > 0 ? { issues } : {}),
    };
    await writeFileAtomic(path, `${JSON.stringify(batch, null, 2)}\n`);
    await writeState(stateFile, {
      ...state,
      comments: state.comments.filter((comment) => !comment.instant),
      handedOff: { ...state.handedOff, [section.id]: { copiedAt, commentIds: comments.map((c) => c.id) } },
    });
    await recordHandoff(join(projectDir, REELS_DIR, slug), number, copiedAt);
    return { text: pasteableText(heading, file, comments, notes, issues, version), file, count: comments.length };
  });
}

/** Freeze and map feedback while no live operation can change the captured reel. */
export async function copyBatch(projectDir: string, slug: string, number: number, options: BatchOptions = {}): Promise<CopiedBatch> {
  const reelDir = await requireReelDir(projectDir, slug);
  return withReelLock(reelDir, async () => {
    await settleNewest(projectDir, slug);
    const from = await assertTakesComments(projectDir, slug, number);
    const { section } = sectionToCopy(from.sections, options.section);
    const state = await readState(stateFilePath(projectDir, slug, number), number);
    const source = { ...state, comments: (await commentsForVersion(projectDir, slug, number, state.comments)).filter((comment) => !comment.instant) };
    if (!source.note.trim() && !source.comments.some((comment) => from.sections.length === 1 || sectionOfComment(from, comment) === section.id)) {
      throw new KinottaError('invalid', 'There are no comments or notes to copy yet.');
    }
    await dismissBuiltPinNotes(projectDir, slug);
    const frozen = await freezeEditsNow(projectDir, slug);
    if (frozen.version !== number) {
      const to = await readVersion(projectDir, slug, frozen.version);
      const file = stateFilePath(projectDir, slug, frozen.version);
      await serialized(file, async () => {
        const state = await readState(file, frozen.version);
        const comments = source.comments.map((comment) => { const carried = carriedComment(comment, from, to, null, true); return comment.effect || comment.insertShot ? { ...carried, id: comment.id } : carried; });
        const ids = comments.filter((_comment, index) => !isSent(source.handedOff, source.comments[index]!.id)).map((comment) => comment.id);
        await writeState(file, { ...state, note: source.note, comments, carriedFrom: { version: number, ids } });
      });
    }
    return copyBatchNow(projectDir, slug, frozen.version, options);
  });
}
