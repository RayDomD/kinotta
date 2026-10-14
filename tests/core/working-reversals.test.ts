import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { applyOperations } from '../../server/core/model.ts';
import type { NewOperation, Operation, Sources } from '../../server/core/model.ts';
import { copyFixture, emptyProject } from '../helpers/project.ts';
import { alternatesFixture } from '../helpers/parts.ts';

const legacy: Sources = { plan: { duration: 12, pieces: [{ in: 0, out: 6 }, { in: 6, out: 12 }], clips: [{ id: 'graphic', in: 1, out: 4 }], captions: true }, words: [{ text: 'hello', start: 1, end: 1.4 }, { text: 'world', start: 1.5, end: 2 }] };
const native: Sources = { plan: { duration: 12, clips: [{ id: 'graphic', in: 1, out: 3, placement: 'main' }], captions: true, media: { schema: 1,
  sources: [{ id: 'video', kind: 'video', path: 'video.mp4', duration: 12, audio: true }, { id: 'music', kind: 'audio', path: 'music.wav', duration: 12 }],
  placements: [{ id: 'main', role: 'main', track: 'music', source: 'video', in: 0, out: 6 }, { id: 'second', role: 'main', track: 'music', source: 'video', in: 6, out: 12 }, { id: 'insert', role: 'insert', source: 'video', in: 0, out: 3, at: 1 }, { id: 'sound', role: 'audio', source: 'music', track: 'music', in: 0, out: 6, at: 0 }],
  sequence: ['main', 'second'], tracks: [{ id: 'music', name: 'Music', order: 0, gain: 1, mute: false }, { id: 'empty', name: 'Empty', order: 1, gain: 1, mute: false }] } }, words: [] };
const cases: Array<{ sources: Sources; edit: NewOperation }> = [
  ...([
    { kind: 'snip', from: 3, to: 4 }, { kind: 'cut', at: 3 }, { kind: 'move-piece', from: 0, to: 1 },
    { kind: 'word-text', at: 1, text: 'hi' }, { kind: 'word-timing', at: 1, start: 0.9, end: 1.3 }, { kind: 'phrase-text', from: 1, to: 2, text: 'good morning everyone' },
    { kind: 'caption-position', x: 10, y: 20 }, { kind: 'caption-phrase-position', at: 1, x: 10, y: 20 },
    { kind: 'clip-trim', clip: 'graphic', in: 1.5, out: 3 }, { kind: 'clip-slide', clip: 'graphic', delta: 1 }, { kind: 'element-offset', clip: 'graphic', element: 'label', x: 10, y: 20, scale: 1 },
  ] satisfies NewOperation[]).map((edit) => ({ sources: legacy, edit })),
  ...([
    { kind: 'source-beats', source: 'music', beats: { tempo: 120, beats: [0, 0.5, 1], downbeats: [0] } },
    { kind: 'track-add', track: { id: 'new', name: 'New', order: 2, gain: 1, mute: false } }, { kind: 'track-change', track: 'music', changes: { gain: 0.5 } },
    { kind: 'track-move', track: 'empty', index: 0 }, { kind: 'track-remove', track: 'empty' }, { kind: 'placement-detach', placement: 'insert', track: 'music' },
    { kind: 'placement-add', placement: { id: 'added', role: 'audio', source: 'music', track: 'music', in: 0, out: 2, at: 2 } },
    { kind: 'placement-change', placement: 'sound', changes: { gain: 0.5 } }, { kind: 'placement-duck', placement: 'sound', spans: [{ start: 1, end: 2 }], amount: 6, attack: 0.1, release: 0.1 },
    { kind: 'placement-remove', placement: 'sound' }, { kind: 'placement-move', placement: 'second', index: 0 }, { kind: 'placement-layer', placement: 'insert', direction: 'front' },
    { kind: 'placement-replace', target: 'sound', placement: { id: 'replacement', role: 'audio', source: 'music', track: 'music', in: 1, out: 3, at: 0 } },
    { kind: 'placement-split', placement: 'sound', at: 2 }, { kind: 'placement-snip', from: 4, to: 5 },
    { kind: 'clip-attachment', clip: 'graphic', placement: 'main', in: 2, out: 4 },
  ] satisfies NewOperation[]).map((edit) => ({ sources: native, edit })),
  { sources: { ...native, plan: { ...native.plan, media: { ...native.plan.media!, placements: native.plan.media!.placements.map((placement) => placement.id === 'main' ? { ...placement, out: 2 } : placement.id === 'second' ? { ...placement, origin: 'main', in: 2.5, out: 6 } : placement), sequence: ['main', 'second'] } } }, edit: { kind: 'clip-split', clip: 'graphic' } },
];

it.each(cases)('replays Undo of frozen $edit.kind on the next authored version', async ({ sources, edit }) => {
  // A persisted freeze checkpoint, then an agent response, exercises the same durable replay seam as offsets.
  const dir = emptyProject();
  const reelDir = join(dir, 'reels', 'undo');
  const operation: Operation = { ...edit, by: 'you', id: 'frozen-edit' };
  const frozen = applyOperations(sources, [operation]);
  mkdirSync(join(reelDir, 'v2'), { recursive: true });
  writeFileSync(join(reelDir, 'reel.json'), JSON.stringify({ title: 'Undo' }));
  writeFileSync(join(reelDir, 'plan.json'), JSON.stringify(sources.plan));
  writeFileSync(join(reelDir, 'v2', 'plan.json'), JSON.stringify({ ...frozen.plan, title: 'Agent changed this title' }));
  writeFileSync(join(reelDir, 'v2', 'transcript.json'), JSON.stringify({ words: frozen.words }));
  writeFileSync(join(reelDir, 'edit-list.json'), JSON.stringify({ base: 0, frozen: 1, frozenOperations: [operation.id], anchor: { sources, planDir: reelDir, transcript: { words: sources.words } }, operations: [], undo: [], redo: [[operation]], flagged: {} }));
  const project = openProject(dir);
  const list = await project.readEditList('undo');
  expect(list.flagged).toBeUndefined();
  const result = applyOperations({ ...frozen, plan: { ...frozen.plan, title: 'Agent changed this title' } }, list.operations);
  expect(result).toEqual({ ...applyOperations(sources, []), plan: { ...applyOperations(sources, []).plan, title: 'Agent changed this title' } });
});

it.each(['shot-alternate', 'shot-alternate-dismiss'] as const)('replays Undo of frozen %s through build and freeze', async (kind) => {
  const { dir } = alternatesFixture();
  const project = openProject(dir);
  await project.buildParts('parts');
  await project.addOperation('parts', { kind, shot: 'proof', revision: kind === 'shot-alternate' ? 'r2' : 'r3' });
  await project.freezeEdits('parts');
  await project.undoEdit('parts');
  await project.buildParts('parts');
  expect((await project.readEditList('parts')).flagged).toBeUndefined();
  const { version } = await project.freezeEdits('parts');
  const shot = (await project.readVersion('parts', version)).shots[1];
  expect(shot.revision).toBe('r1');
  expect(shot.choiceMade).not.toBe(true);
  expect(shot.alternates?.find((alternate) => alternate.revision === 'r3')?.dismissed).toBeUndefined();
  expect(shot.alternates).toHaveLength(3);
});


it('flags an undo when the agent changed the same target, using owner-facing words', async () => {
  const { dir, reelDir, manifest } = alternatesFixture();
  const project = openProject(dir);
  await project.buildParts('parts');
  await project.addOperation('parts', { kind: 'shot-alternate', shot: 'proof', revision: 'r2' });
  await project.freezeEdits('parts');
  await project.undoEdit('parts');
  manifest.shots[1].revision = 'r3';
  manifest.shots[1].duration = 3;
  manifest.duration = 5;
  writeFileSync(join(reelDir, 'shots.json'), JSON.stringify(manifest));
  await project.buildParts('parts');
  const list = await project.readEditList('parts');
  const reason = Object.values(list.flagged ?? {})[0];
  expect(reason).toContain('alternate');
  expect(reason).toContain('Review this undo');
  expect(reason).not.toContain('shot-alternate');
  await expect(project.freezeEdits('parts')).rejects.toThrow('One edit no longer applies');
});

it('preserves a later edit while reversing multiple edits consumed by a freeze', async () => {
  const { dir, reelDir } = alternatesFixture();
  const project = openProject(dir);
  await project.buildParts('parts');
  await project.addOperation('parts', { kind: 'shot-alternate', shot: 'proof', revision: 'r2' });
  await project.addOperation('parts', { kind: 'shot-alternate-dismiss', shot: 'proof', revision: 'r3' });
  await project.freezeEdits('parts');
  await project.undoEdit('parts');
  await project.undoEdit('parts');
  await project.addOperation('parts', { kind: 'element-offset', clip: 'hook', element: 'label', x: 42, y: 0, scale: 1 });
  await project.buildParts('parts');
  expect((await project.readEditList('parts')).flagged).toBeUndefined();
  const { version } = await project.freezeEdits('parts');
  const frozen = await project.readVersion('parts', version);
  expect(frozen.shots[1].revision).toBe('r1');
  expect(frozen.shots[1].alternates).toHaveLength(3);
  expect(frozen.code?.offsets.hook?.label?.x).toBe(42);
});

it('reverses a newly added source after a real freeze rebases and preserves its media path', { timeout: 120_000 }, async () => {
  const dir = copyFixture('footage-project');
  const reelDir = join(dir, 'reels', 'founder-talk');
  writeFileSync(join(reelDir, 'plan.json'), JSON.stringify({ duration: 12, clips: [], media: { schema: 1, sources: [{ id: 'video', kind: 'video', path: '../../media/talk.mp4', duration: 12, audio: false }], placements: [{ id: 'main', role: 'main', source: 'video', in: 0, out: 12 }], sequence: ['main'] } }));
  const project = openProject(dir);
  await project.addOperation('founder-talk', { kind: 'placement-add', source: { id: 'added', kind: 'audio', path: '../../media/talk.mp4', duration: 12 }, placement: { id: 'music', role: 'audio', source: 'added', in: 0, out: 2, at: 0 } });
  const frozen = await project.freezeEdits('founder-talk');
  await project.undoEdit('founder-talk');
  cpSync(join(reelDir, `v${frozen.version}`), join(reelDir, `v${frozen.version + 1}`), { recursive: true });
  expect((await project.readEditList('founder-talk')).flagged).toBeUndefined();
  const saved = await project.freezeEdits('founder-talk');
  const version = await project.readVersion('founder-talk', saved.version);
  expect(version.media?.sources.map((source) => source.id)).toEqual(['video']);
  expect(version.media?.placements.map((placement) => placement.id)).toEqual(['main']);
});
