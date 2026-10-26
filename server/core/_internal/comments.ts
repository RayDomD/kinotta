import { addOperationNow, removeInstantPinNow, readEditListNow, workingSources, workingInputs, workingState, withReelLock } from './edit-list.ts';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { readCapturedVersion, requireReelDir } from './version.ts';
import { randomUUID } from 'node:crypto';
import { isSent, readVersion, settleNewest } from './carry.ts';
import { KinottaError } from './errors.ts';
import { readState, serialized, stateFilePath, writeState } from './state.ts';
import type { StateFile, StoredComment } from './state.ts';
import type { AddedComment, Comment, CommentList, FramePin, NewComment, NewWordPin, NoteSaved, Shot, Version, WordPin } from './types.ts';
import { assertTakesComments } from './version.ts';
import { applyOperations, mediaEditingPlan, mediaPlanTimeline } from './edit-model.ts';
import { withSpeech } from './media-speech.ts';
import { stillTime } from './code-edits.ts';
import { mediaWords, mediaTimeline } from './media-model.ts';
import { checkPartsManifest } from './parts.ts';
import { effectsCatalogue } from './effects-catalogue.ts';
import { makeInstantEffect } from './instant-effect.ts';
import { newestVersionNumber } from './version.ts';

/** The shot a word pin carries on a version with no shots: it belongs to the transcript. */
export const NO_SHOT = '';
const POSITION_DECIMALS = 1000;
const NOTE_MAX_LENGTH = 4000;
/** How far a word pin's time may be from the transcript word's start, in seconds. */
const WORD_TIME_TOLERANCE = 0.01;

/** What became of a comment: whether it went to an agent in a batch, and which newer version it moved on to. */
function statusOf(id: string, state: StateFile): Pick<Comment, 'sent' | 'carried'> {
  const { carriedTo } = state;
  return {
    ...(isSent(state.handedOff, id) ? { sent: true as const } : {}),
    ...(carriedTo?.carried.includes(id) ? { carried: { to: carriedTo.version } } : {}),
  };
}

/**
 * Ordered by pin time (a shot's start, or a word's), then creation time (file order breaks exact ties), then numbered
 * from 1. With the version's `state`, each comment also says whether it was sent and whether it moved on.
 */
export function numbered(stored: StoredComment[], state?: StateFile): Comment[] {
  return stored
    .map((comment, index) => ({ comment, index }))
    .sort(
      (a, b) =>
        a.comment.pin.time - b.comment.pin.time ||
        Date.parse(a.comment.createdAt) - Date.parse(b.comment.createdAt) ||
        a.index - b.index,
    )
    .map(({ comment: { effectHtml: _html, ...comment } }, i) => ({ ...comment, number: i + 1, ...(state ? statusOf(comment.id, state) : {}) }));
}

function fraction(value: unknown, axis: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new KinottaError('invalid', `The pin's ${axis} position must be a fraction of the frame between 0 and 1.`);
  }
  return Math.round(value * POSITION_DECIMALS) / POSITION_DECIMALS;
}

function buildWordPin(raw: NewWordPin, version: number, shot: Shot): WordPin {
  const found = shot.words?.find((w) => Math.abs(w.start - raw.time) <= WORD_TIME_TOLERANCE && w.text === raw.word && (!raw.placement || raw.placement === w.placement));
  if (!found) {
    throw new KinottaError('invalid', `Shot ${shot.number} has no spoken word "${String(raw.word)}" at ${String(raw.time)}s.`);
  }
  return { kind: 'word', version, section: shot.section ?? null, shot: shot.number, time: found.start, word: found.text };
}

/** A word of the transcript of a version with no shots, which is where that version's word pins go. */
function buildTranscriptWordPin(raw: NewWordPin, version: Version): WordPin {
  const found = version.transcript?.find((w) => Math.abs(w.start - raw.time) <= WORD_TIME_TOLERANCE && w.text === raw.word && (!raw.placement || raw.placement === w.placement));
  if (!found) {
    throw new KinottaError('invalid', `The transcript has no word "${String(raw.word)}" at ${String(raw.time)}s.`);
  }
  const section = version.media ? version.sections.find((s) => s.start <= found.start && s.end > found.start)?.id ?? null : null;
  return { kind: 'word', version: version.number, section, shot: NO_SHOT, time: found.start, word: found.text };
}

function buildPinWithoutAnchor(input: NewComment, version: Version): FramePin | WordPin {
  const raw = input?.pin;
  if (raw === null || typeof raw !== 'object') throw new KinottaError('invalid', 'A comment needs a pin.');
  const shots = version.shots;
  if (raw.kind === 'frame' && (version.media || version.footage || version.code) && raw.time !== undefined) {
    if (!Number.isFinite(raw.time) || raw.time < 0 || raw.time >= version.duration) throw new KinottaError('invalid', 'Choose a pin moment inside the reel.');
    const timeline = version.media ? mediaTimeline(version.media, version.duration) : null;
    if (raw.placement && !timeline?.placements.some((p) => p.id === raw.placement && p.at <= raw.time! && p.at + p.duration > raw.time!)) throw new KinottaError('invalid', 'That placement is not playing at the pin moment.');
    const shot = shots.find((s) => s.number === raw.shot) ?? (version.code ? shots.find((s) => s.start <= raw.time! && s.start + s.duration > raw.time!) : undefined);
    if (raw.element != null && (typeof raw.element !== 'string' || raw.element === '')) throw new KinottaError('invalid', 'The pin’s element must be a name or null.');
    return { kind: 'frame', version: version.number, section: shot?.section ?? version.sections.find((s) => s.start <= raw.time! && s.end > raw.time!)?.id ?? null, shot: shot?.number ?? NO_SHOT, ...(shot?.name ? { shotName: shot.name } : {}), time: raw.time, x: fraction(raw.x, 'x'), y: fraction(raw.y, 'y'), element: raw.element ?? null };
  }
  if (raw.kind === 'word' && (version.media || version.footage || shots.length === 0) && raw.shot === NO_SHOT) return buildTranscriptWordPin(raw, version);
  const shot = shots.find((s) => s.number === raw.shot);
  if (!shot) throw new KinottaError('invalid', `Version ${version.number} has no shot "${String(raw.shot)}".`);
  if (raw.kind === 'word') return buildWordPin(raw, version.number, shot);
  const element = raw.element ?? null;
  if (element !== null && (typeof element !== 'string' || element === '')) {
    throw new KinottaError('invalid', "The pin's element must be a name or null.");
  }
  return {
    kind: 'frame',
    version: version.number,
    section: shot.section ?? null,
    shot: shot.number,
    ...(shot.name ? { shotName: shot.name } : {}),
    time: shot.start,
    x: fraction(raw.x, 'x'),
    y: fraction(raw.y, 'y'),
    element,
  };
}

function buildPin(input: NewComment, version: Version): FramePin | WordPin {
  let pin = buildPinWithoutAnchor(input, version);
  const revision = input.pin.kind !== 'word' ? input.pin.alternate : undefined;
  if (pin.kind === 'frame' && revision !== undefined) {
    const shot = version.shots.find((shot) => shot.number === pin.shot);
    const alternate = shot?.alternates?.find((alternate) => alternate.revision === revision);
    if (!alternate || alternate.dismissed) throw new KinottaError('invalid', 'That alternate is not offered on this shot.');
    pin = { ...pin, alternate: alternate.revision };
  }
  if (!version.media) return pin;
  const timeline = mediaTimeline(version.media, version.duration);
  const word = pin.kind === 'word' ? version.transcript?.find((w) => w.start === pin.time && w.text === pin.word && (!input.pin.placement || w.placement === input.pin.placement)) : undefined;
  const identity = word?.placement ?? input.pin.placement;
  const placement = identity ? timeline.placements.find((p) => p.id === identity) : timeline.placements.find((p) => (p.role === 'main' || p.role === 'gap') && p.at <= pin.time && p.at + p.duration > pin.time);
  if (!placement) return pin;
  return { ...pin, placement: placement.id, offset: pin.time - placement.at, ...(placement.role === 'gap' ? {} : { sourceTime: word?.sourceStart ?? (placement.in + pin.time - placement.at) }) };
}

/** Only instant output lives in Working; agent requests retain the ordinary comment lifecycle. */
export async function commentsForVersion(projectDir: string, slug: string, number: number, ordinary: StoredComment[]): Promise<StoredComment[]> {
  const reelDir = await requireReelDir(projectDir, slug);
  let pinComments: Record<string, StoredComment | null>;
  const managed = new Set<string>();
  if (number === await newestVersionNumber(reelDir)) {
    const list = await readEditListNow(projectDir, slug);
    const history = await workingState(reelDir);
    for (const op of [...history.operations, ...history.undo.flat(), ...history.redo.flat()]) if (op.kind === 'pin-comment') managed.add(op.commentId);
    const captured = JSON.parse(await readFile(join(reelDir, `v${list.base}`, 'pin-comments.json'), 'utf8').catch(() => '{}'));
    if (!managed.size && !Object.keys(captured).length && !history.anchor?.sources.plan.pinComments) return ordinary.filter((comment) => !comment.instant);
    pinComments = applyOperations(await workingSources(projectDir, reelDir), list.operations.filter((op) => !list.flagged?.[op.id])).plan.pinComments ?? {};
  } else {
    const captured = await readFile(join(reelDir, `v${number}`, 'pin-comments.json'), 'utf8').catch(() => '{}');
    pinComments = JSON.parse(captured);
  }
  for (const id of Object.keys(pinComments)) managed.add(id);
  const pins = Object.values(pinComments).filter((pin): pin is StoredComment => pin?.instant === true).map((comment) => ({ ...comment, pin: { ...comment.pin, version: number } }));
  const instantIds = new Set(pins.map((comment) => comment.id));
  return [...ordinary.filter((comment) => !comment.instant && !instantIds.has(comment.id)), ...pins];
}

async function pinComment(projectDir: string, slug: string, number: number, id: string): Promise<StoredComment | undefined> {
  const state = await readState(stateFilePath(projectDir, slug, number), number);
  return (await commentsForVersion(projectDir, slug, number, state.comments)).find((comment) => comment.id === id && (comment.effect || comment.insertShot));
}

async function savePinComment(projectDir: string, slug: string, number: number, comment: StoredComment): Promise<AddedComment> {
  await addOperationNow(projectDir, slug, { kind: 'pin-comment', commentId: comment.id, comment });
  const file = stateFilePath(projectDir, slug, number);
  await serialized(file, async () => {
    const state = await readState(file, number);
    if (state.comments.some((saved) => saved.id === comment.id)) await writeState(file, { ...state, comments: state.comments.filter((saved) => saved.id !== comment.id) });
  });
  const comments = await listComments(projectDir, slug, number);
  return { comment: comments.find((item) => item.id === comment.id)!, comments };
}

async function saveAgentPinComment(projectDir: string, slug: string, number: number, comment: StoredComment): Promise<AddedComment> {
  const file = stateFilePath(projectDir, slug, number);
  await serialized(file, async () => {
    const state = await readState(file, number);
    const index = state.comments.findIndex((saved) => saved.id === comment.id);
    const comments = index < 0 ? [...state.comments, comment] : state.comments.map((saved) => saved.id === comment.id ? comment : saved);
    await writeState(file, { ...state, comments });
  });
  const comments = await listComments(projectDir, slug, number);
  return { comment: comments.find((saved) => saved.id === comment.id)!, comments };
}

export async function listComments(projectDir: string, slug: string, number: number): Promise<Comment[]> {
  await readVersion(projectDir, slug, number);
  const state = await readState(stateFilePath(projectDir, slug, number), number);
  return numbered(await commentsForVersion(projectDir, slug, number, state.comments), state);
}

/** The one guard every change goes through, after the newest version has taken over what its predecessor left. */
async function takesComments(projectDir: string, slug: string, number: number) {
  await settleNewest(projectDir, slug);
  return assertTakesComments(projectDir, slug, number);
}

async function addCommentNow(projectDir: string, slug: string, number: number, input: NewComment): Promise<AddedComment> {
  const version = await commentVersion(projectDir, slug, number);
  const pin = buildPin(input, version);
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  if (input.effect !== undefined || input.insertShot !== undefined) {
    if (pin.kind !== 'frame' || input.options !== undefined || input.effect && input.insertShot) throw new KinottaError('invalid', 'Effects and inserted shots need a frame pin without an options request.');
    if (input.insertShot !== undefined && input.insertShot !== true) throw new KinottaError('invalid', 'Invalid inserted shot.');
    if (input.insertShot && !text) throw new KinottaError('invalid', 'Describe the new shot.');
    const effect = input.effect === undefined ? undefined : (await effectsCatalogue()).find((entry) => entry.id === input.effect);
    if (input.effect !== undefined && !effect) throw new KinottaError('invalid', 'Unknown effect.');
    const instant = effect?.instant && !text;
    const effectHtml = instant ? await makeInstantEffect(projectDir, slug, effect.id, pin, version) : undefined;
    const saved: StoredComment = { id: randomUUID(), pin, text, createdAt: new Date().toISOString(), ...(effect ? { effect: effect.id, effectName: effect.name } : {}), ...(input.insertShot ? { insertShot: true } : {}), ...(instant ? { instant: true, effectHtml } : {}) };
    return instant ? savePinComment(projectDir, slug, number, saved) : saveAgentPinComment(projectDir, slug, number, saved);
  }
  if (text === '') throw new KinottaError('invalid', 'A comment needs some text.');
  // A code-built single-page reel may ask too: the agent converts it to parts in its next version to answer.
  if (input.options !== undefined && (!(version.parts || version.code) || pin.shot === NO_SHOT || ![2, 3, 4].includes(input.options))) throw new KinottaError('invalid', 'Options requests need a code-built shot and a count of 2, 3 or 4.');

  const file = stateFilePath(projectDir, slug, number);
  return serialized(file, async () => {
    const state = await readState(file, number);
    const asking = input.options === undefined ? undefined : state.comments.find((comment) => comment.options !== undefined && comment.pin.shot !== pin.shot);
    if (asking) throw new KinottaError('invalid', `Shot ${asking.pin.shot} already asks for options. Only one shot per version can ask.`);
    const saved: StoredComment = { id: randomUUID(), pin, text, createdAt: new Date().toISOString(), ...(input.options === undefined ? {} : { options: input.options }) };
    const next = { ...state, comments: [...state.comments, saved] };
    await writeState(file, next);
    const comments = numbered(await commentsForVersion(projectDir, slug, number, next.comments), next);
    return { comment: comments.find((c) => c.id === saved.id)!, comments };
  });
}

function unknownComment(id: string): KinottaError {
  return new KinottaError('not-found', `Comment "${id}" not found.`);
}

async function editCommentNow(projectDir: string, slug: string, number: number, id: string, input: string): Promise<AddedComment> {
  await takesComments(projectDir, slug, number);
  const text = typeof input === 'string' ? input.trim() : '';
  const pinned = await pinComment(projectDir, slug, number, id);
  if (pinned) {
    if (pinned.insertShot && !text) throw new KinottaError('invalid', 'Describe the new shot.');
    const effect = pinned.effect ? (await effectsCatalogue()).find((entry) => entry.id === pinned.effect) : undefined;
    const { instant: _instant, effectHtml: oldHtml, ...base } = pinned;
    const instant = effect?.instant && !text;
    if (instant) {
      if (pinned.instant) { const comments = await listComments(projectDir, slug, number); return { comment: comments.find((comment) => comment.id === id)!, comments }; }
      const effectHtml = oldHtml ?? await makeInstantEffect(projectDir, slug, effect.id, pinned.pin as FramePin, await commentVersion(projectDir, slug, number));
      return savePinComment(projectDir, slug, number, { ...base, text, effectHtml, instant: true });
    }
    const ordinary = { ...base, text };
    // Persist the request first. The reel lock keeps readers from seeing a half-completed transition.
    await saveAgentPinComment(projectDir, slug, number, ordinary);
    if (pinned.instant) await removeInstantPinNow(projectDir, slug, id);
    const comments = await listComments(projectDir, slug, number);
    return { comment: comments.find((comment) => comment.id === id)!, comments };
  }
  if (text === '') throw new KinottaError('invalid', 'A comment needs some text.');

  const file = stateFilePath(projectDir, slug, number);
  return serialized(file, async () => {
    const state = await readState(file, number);
    if (!state.comments.some((c) => c.id === id)) throw unknownComment(id);
    const next = { ...state, comments: state.comments.map((c) => (c.id === id ? { ...c, text } : c)) };
    await writeState(file, next);
    const comments = numbered(await commentsForVersion(projectDir, slug, number, next.comments), next);
    return { comment: comments.find((c) => c.id === id)!, comments };
  });
}

async function deleteCommentNow(projectDir: string, slug: string, number: number, id: string): Promise<CommentList> {
  await takesComments(projectDir, slug, number);
  if ((await pinComment(projectDir, slug, number, id))?.instant) {
    await removeInstantPinNow(projectDir, slug, id);
    return { comments: await listComments(projectDir, slug, number) };
  }
  const file = stateFilePath(projectDir, slug, number);
  return serialized(file, async () => {
    const state = await readState(file, number);
    if (!state.comments.some((c) => c.id === id)) throw unknownComment(id);
    const next = { ...state, comments: state.comments.filter((c) => c.id !== id) };
    await writeState(file, next);
    return { comments: numbered(await commentsForVersion(projectDir, slug, number, next.comments), next) };
  });
}

export async function readNote(projectDir: string, slug: string, number: number): Promise<string> {
  await readVersion(projectDir, slug, number);
  return (await readState(stateFilePath(projectDir, slug, number), number)).note;
}

async function setNoteNow(projectDir: string, slug: string, number: number, input: string): Promise<NoteSaved> {
  await takesComments(projectDir, slug, number);
  if (typeof input !== 'string') throw new KinottaError('invalid', 'A note must be text.');
  const note = input.trim();
  if (note.length > NOTE_MAX_LENGTH) {
    throw new KinottaError('invalid', `A note can be at most ${NOTE_MAX_LENGTH} characters.`);
  }

  const file = stateFilePath(projectDir, slug, number);
  return serialized(file, async () => {
    const state = await readState(file, number);
    await writeState(file, { ...state, note });
    return { note, comments: numbered(state.comments, state) };
  });
}

export async function addComment(projectDir: string, slug: string, number: number, input: NewComment): Promise<AddedComment> {
  const reelDir = await requireReelDir(projectDir, slug);
  return withReelLock(reelDir, () => addCommentNow(projectDir, slug, number, input));
}

export async function editComment(projectDir: string, slug: string, number: number, id: string, input: string): Promise<AddedComment> {
  const reelDir = await requireReelDir(projectDir, slug);
  return withReelLock(reelDir, () => editCommentNow(projectDir, slug, number, id, input));
}

export async function deleteComment(projectDir: string, slug: string, number: number, id: string): Promise<CommentList> {
  const reelDir = await requireReelDir(projectDir, slug);
  return withReelLock(reelDir, () => deleteCommentNow(projectDir, slug, number, id));
}

export async function setNote(projectDir: string, slug: string, number: number, input: string): Promise<NoteSaved> {
  const reelDir = await requireReelDir(projectDir, slug);
  return withReelLock(reelDir, () => setNoteNow(projectDir, slug, number, input));
}

/** Pins use the picture and words on Working, including undo beyond a frozen duration. */
async function commentVersion(projectDir: string, slug: string, number: number): Promise<Version> {
  await takesComments(projectDir, slug, number);
  const list = await readEditListNow(projectDir, slug);
  const reelDir = await requireReelDir(projectDir, slug);
  const base = await readCapturedVersion(projectDir, slug, number, join(reelDir, `v${list.base}`));
  const sources = await workingSources(projectDir, reelDir);
  const applied = applyOperations(sources, list.operations.filter((operation) => !list.flagged?.[operation.id]));
  if (applied.plan.parts) {
    const manifest = applied.plan.parts;
    const media = applied.plan.media ? await withSpeech(projectDir, join(reelDir, `v${list.base}`), applied.plan.media, false) : undefined;
    const words = media ? mediaWords(media, manifest.duration) : [];
    const shots = checkPartsManifest(manifest as unknown as Record<string, unknown>).shots.map((shot) => {
      const spoken = words.filter((word) => word.start >= shot.start && word.start < shot.start + shot.duration);
      return { ...shot, section: base.shots.find((original) => original.name === shot.name)?.section, ...(spoken.length ? { words: spoken, spoken: spoken.map((word) => word.text).join(' ') } : {}) };
    });
    return { ...base, parts: manifest, shots, duration: manifest.duration, ...(media ? { media, transcript: words } : {}) };
  }
  if (!base.footage && !applied.plan.media) {
    const shots = base.shots.map((shot) => {
      const before = sources.plan.clips?.find((clip) => clip.in <= shot.start && clip.out > shot.start);
      const after = applied.plan.clips?.find((clip) => clip.id === before?.id);
      return before && after ? { ...shot, start: stillTime(shot.start, { start: before.in, duration: before.out - before.in }, after) } : shot;
    });
    return { ...base, shots, duration: applied.plan.duration ?? base.duration };
  }
  const plan = mediaPlanTimeline(mediaEditingPlan(applied));
  const inputs = base.code ? { planDir: join(reelDir, `v${list.base}`) } : await workingInputs(projectDir, reelDir);
  plan.media = await withSpeech(projectDir, inputs.planDir, plan.media!, false);
  const words = mediaWords(plan.media, plan.duration);
  const beforeTimeline = mediaTimeline(mediaEditingPlan(sources).media!, sources.plan.duration);
  const afterTimeline = mediaTimeline(plan.media!, plan.duration);
  const shots = base.shots.map((shot) => {
    const spoken = words.filter((word) => {
      const after = afterTimeline.placements.find((placement) => placement.id === word.placement);
      const before = beforeTimeline.placements.find((placement) => placement.id === word.placement || after && (placement.origin ?? placement.id) === (after.origin ?? after.id));
      const at = before && before.role !== 'gap' && word.sourceStart !== undefined ? before.at + word.sourceStart - before.in : word.start;
      const range = shot.line ?? { start: shot.start, end: shot.start + shot.duration };
      return at >= range.start && at < range.end;
    });
    return { ...shot, words: spoken, spoken: spoken.map((word) => word.text).join(' ') };
  });
  return { ...base, duration: plan.duration ?? base.duration, media: plan.media, transcript: words, shots };
}
