import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse } from 'node-html-parser';
import { describe, expect, it } from 'vitest';
import { captionPhrases, mediaWords } from '../../server/core/model.ts';
import type { MediaPlan } from '../../server/core/model.ts';
import { malformedMediaCases, malformedPlanCases } from '../helpers/media-validation.ts';

const ENGINE = resolve(import.meta.dirname, '../../skill/kinotta/engine');
const PYTHON = process.platform === 'win32' ? 'python' : 'python3';

describe('engine media placement mapping', () => {
  it('refuses malformed legacy plan roots and source-range lists with readable errors', () => {
    const cases = [null, [], 1, 'plan', ...[{}, 'ranges', [null]].map((pieces) => ({ video: 'a.mp4', duration: 3, clips: [], pieces }))];
    const run = spawnSync(PYTHON, ['-c', `import json, sys
sys.path.insert(0, sys.argv[1])
from pieces import timeline_plan
results = []
for plan in json.load(sys.stdin):
    try:
        timeline_plan(plan)
        results.append('accepted')
    except SystemExit as error:
        results.append(str(error))
    except Exception as error:
        results.append(type(error).__name__)
print(json.dumps(results))`, ENGINE], { input: JSON.stringify(cases), encoding: 'utf8' });
    expect(run.status, run.stderr).toBe(0);
    const messages: string[] = JSON.parse(run.stdout);
    messages.forEach((message, i) => expect(message).toContain(i < 4 ? 'plan' : 'pieces'));
  });
  it('rejects malformed persisted models with the same readable contract as the editor', () => {
    const cases = malformedMediaCases();
    const run = spawnSync(PYTHON, ['-c', `import json, sys
sys.path.insert(0, sys.argv[1])
from pieces import media_timeline
results = []
for case in json.load(sys.stdin):
    try:
        media_timeline(case['value'])
        results.append('accepted')
    except SystemExit as error:
        results.append(str(error))
    except Exception as error:
        results.append(type(error).__name__)
print(json.dumps(results))`, ENGINE], { input: JSON.stringify(cases), encoding: 'utf8' });
    expect(run.status, run.stderr).toBe(0);
    const messages: string[] = JSON.parse(run.stdout);
    cases.forEach((test, i) => expect(messages[i], test.name).toContain(test.error));
  });
  it('rejects malformed clips, sections and caption settings with the same readable contract as the editor', () => {
    const cases = malformedPlanCases();
    const run = spawnSync(PYTHON, ['-c', `import json, sys
sys.path.insert(0, sys.argv[1])
from pieces import timeline_plan
results = []
for case in json.load(sys.stdin):
    try:
        timeline_plan(case['value'])
        results.append('accepted')
    except SystemExit as error:
        results.append(str(error))
    except Exception as error:
        results.append(type(error).__name__)
print(json.dumps(results))`, ENGINE], { input: JSON.stringify(cases), encoding: 'utf8' });
    expect(run.status, run.stderr).toBe(0);
    const messages: string[] = JSON.parse(run.stdout);
    cases.forEach((test, i) => expect(messages[i], test.name).toContain(test.error));
  });
  it('maps looping speech attachments to their named cycle exactly like the editor', () => {
    const plan = {
      duration: 6,
      media: {
        schema: 1,
        sources: [{ id: 'a', kind: 'video', path: 'a.mp4', duration: 6 }, { id: 'v', kind: 'audio', path: 'v.wav', duration: 2 }],
        placements: [{ id: 'take', role: 'main', source: 'a', in: 0, out: 6 }, { id: 'voice', role: 'audio', source: 'v', at: 1, in: 0, out: 2, duration: 5, loop: true, speech: true }],
        sequence: ['take'],
      },
      sections: [{ id: 'chorus', name: 'Chorus', placement: 'voice', start: 0, end: 2, cycle: 1 }],
      clips: [{ id: 'second', placement: 'voice', in: 0.5, out: 1.5, cycle: 1 }, { id: 'unnamed', placement: 'voice', in: 0.5, out: 1.5 }, { id: 'cut-off', placement: 'voice', in: 0.5, out: 1.5, cycle: 2 }],
    };
    const run = spawnSync(PYTHON, ['-c', `import json, sys
sys.path.insert(0, sys.argv[1])
from pieces import timeline_plan
print(json.dumps(timeline_plan(json.load(sys.stdin))))`, ENGINE], { input: JSON.stringify(plan), encoding: 'utf8' });
    expect(run.status, run.stderr).toBe(0);
    const mapped = JSON.parse(run.stdout);
    expect(mapped.clips.map((c: { id: string; in: number; out: number; attachmentBroken: boolean }) => [c.id, c.attachmentBroken ? 'broken' : [c.in, c.out]])).toEqual([['second', [3.5, 4.5]], ['unnamed', 'broken'], ['cut-off', 'broken']]);
    expect(mapped.sections.map((s: { id: string; start: number; end: number }) => [s.id, s.start, s.end])).toEqual([['chorus', 3, 5]]);
  });
  it('groups pending captions exactly like the saved engine across repeats, pauses and selected speech', () => {
    const media: MediaPlan = { schema: 1, sources: [{ id: 'a', kind: 'video', path: 'a.mp4', duration: 5, words: ['one', 'two', 'three.', 'four', 'five', 'six', 'seven', 'eight', 'nine!', 'ten', 'eleven'].map((text, i) => ({ text, start: i * 0.2, end: i * 0.2 + 0.1 })) }, { id: 'v', kind: 'audio', path: 'v.wav', duration: 2, words: [{ text: 'voice', start: 0, end: 0.2 }, { text: 'pause', start: 1, end: 1.2 }] }], placements: [{ id: 'first', role: 'main', source: 'a', in: 0, out: 3 }, { id: 'gap', role: 'gap', duration: 1 }, { id: 'repeat', role: 'main', source: 'a', in: 0, out: 3 }, { id: 'voice', role: 'audio', source: 'v', in: 0, out: 2, at: 4, speech: true }], sequence: ['first', 'gap', 'repeat'] };
    const run = spawnSync(PYTHON, ['-c', `import json, sys
sys.path.insert(0, sys.argv[1])
from pieces import media_words
from build import phrases
print(json.dumps([{'start': p['start'], 'end': p['end'], 'words': [[w['text'], w['start'], w['end'], w['placement'], w['sourceStart']] for w in p['words']]} for p in phrases(media_words(json.load(sys.stdin)))]))`, ENGINE], { input: JSON.stringify(media), encoding: 'utf8' });
    expect(run.status, run.stderr).toBe(0);
    expect(captionPhrases(mediaWords(media)).map((p) => ({ start: p.start, end: p.end, words: p.words.map((w) => [w.text, w.start, w.end, w.placement, w.sourceStart]) }))).toEqual(JSON.parse(run.stdout));
  });
  it('maps selected voiceover attachments and clips their ranges to the sound duration', () => {
    const plan = { duration: 8, media: { schema: 1, sources: [{ id: 'v', kind: 'audio', path: 'voice.wav', duration: 12 }], placements: [{ id: 'voice', role: 'audio', source: 'v', in: 5, out: 9, at: 1, duration: 2, speech: true }], sequence: [] }, sections: [{ id: 'topic', name: 'Topic', placement: 'voice', start: 5, end: 9 }], clips: [{ id: 'whole', placement: 'voice', in: 6, out: 8 }, { id: 'kept', placement: 'voice', in: 5.5, out: 6.5 }] };
    const run = spawnSync(PYTHON, ['-c', `import json, sys
sys.path.insert(0, sys.argv[1])
from pieces import timeline_plan
p = timeline_plan(json.load(sys.stdin))
print(json.dumps({'sections': [[s['start'], s['end']] for s in p['sections']], 'broken': p['clips'][0].get('attachmentBroken', False), 'kept': [p['clips'][1]['in'], p['clips'][1]['out']]}))`, ENGINE], { input: JSON.stringify(plan), encoding: 'utf8' });
    expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(run.stdout)).toEqual({ sections: [[1, 3]], broken: true, kept: [1.5, 2.5] });
  });
  it('retains continuous section parts and flags graphics whose attached words are interrupted', () => {
    const plan = { duration: 6, media: { schema: 1, sources: [{ id: 'a', kind: 'video', path: 'a.mp4', duration: 4 }], placements: [
      { id: 'take', role: 'main', source: 'a', in: 0, out: 2 }, { id: 'gap', role: 'gap', duration: 2 }, { id: 'later', origin: 'take', role: 'main', source: 'a', in: 2, out: 4 },
    ], sequence: ['take', 'gap', 'later'] }, sections: [{ id: 'topic', name: 'Topic', placement: 'take', start: 0, end: 4 }], clips: [
      { id: 'graphic', placement: 'take', in: 1, out: 3, section: 'topic' }, { id: 'late', placement: 'take', in: 3, out: 4, section: 'topic' },
    ] };
    const run = spawnSync(PYTHON, ['-c', `import json, sys
sys.path.insert(0, sys.argv[1])
from pieces import timeline_plan
p = timeline_plan(json.load(sys.stdin))
print(json.dumps({'sections': [[s['start'], s['end'], s.get('partOf')] for s in p['sections']], 'graphic': p['clips'][0].get('attachmentBroken', False), 'late': [p['clips'][1]['in'], p['clips'][1]['out'], p['clips'][1]['section']]}))`, ENGINE], { input: JSON.stringify(plan), encoding: 'utf8' });
    expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(run.stdout)).toEqual({ sections: [[0, 2, 'topic'], [4, 6, 'topic']], graphic: true, late: [5, 6, 'topic~part-2'] });
  });
  it('preserves valid picture framing and refuses malformed positions', () => {
    const media = { schema: 1, sources: [{ id: 'a', kind: 'video', path: 'a.mp4', duration: 2 }], placements: [{ id: 'take', role: 'main', source: 'a', in: 0, out: 2, framing: { mode: 'fit', x: 0, y: 1 } }], sequence: ['take'] };
    const run = spawnSync(PYTHON, ['-c', `import json, sys
sys.path.insert(0, sys.argv[1])
from pieces import media_timeline
m = json.load(sys.stdin)
valid = media_timeline(m)['placements'][0]['framing']
refused = []
for framing in [{'mode': 'stretch'}, {'mode': 'crop', 'x': -0.1}, {'mode': 'fit', 'y': 1.1}, {'mode': 'crop', 'x': float('nan')}]:
    m['placements'][0]['framing'] = framing
    try:
        media_timeline(m)
        refused.append(False)
    except SystemExit:
        refused.append(True)
print(json.dumps({'valid': valid, 'refused': refused}))`, ENGINE], { input: JSON.stringify(media), encoding: 'utf8' });
    expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(run.stdout)).toEqual({ valid: { mode: 'fit', x: 0, y: 1 }, refused: [true, true, true, true] });
  });
  it('maps followed sound after a split and flags a removed anchor instead of choosing a repeated take', () => {
    const media = { schema: 1, sources: [{ id: 'a', kind: 'video', path: 'a.mp4', duration: 6 }], placements: [
      { id: 'repeat', role: 'main', source: 'a', in: 0, out: 2 },
      { id: 'first', role: 'main', source: 'a', in: 0, out: 2 },
      { id: 'later', origin: 'first', role: 'main', source: 'a', in: 2, out: 4 },
      { id: 'effect', role: 'audio', source: 'a', in: 0, out: 1, at: 3, attachment: { placement: 'first', time: 3 } },
    ], sequence: ['repeat', 'first', 'later'] };
    const run = spawnSync(PYTHON, ['-c', `import json, sys
sys.path.insert(0, sys.argv[1])
from pieces import media_timeline
m = json.load(sys.stdin)
a = media_timeline(m)['placements'][-1]
m['placements'] = [p for p in m['placements'] if p['id'] != 'later']
m['sequence'].remove('later')
b = media_timeline(m)['placements'][-1]
print(json.dumps({'at': a['at'], 'broken': b.get('attachmentBroken', False)}))`, ENGINE], { input: JSON.stringify(media), encoding: 'utf8' });
    expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(run.stdout)).toEqual({ at: 5, broken: true });
  });
  it('resolves repeated takes and explicit gaps by the same placement identities as the editor', () => {
    const media = {
      schema: 1,
      sources: [
        { id: 'a', kind: 'video', path: 'a.mp4', duration: 20 },
        { id: 'b', kind: 'video', path: 'b.mp4', duration: 20 },
        { id: 'music', kind: 'audio', path: 'music.wav', duration: 2 },
      ],
      placements: [
        { id: 'a-first', role: 'main', source: 'a', in: 10, out: 13 },
        { id: 'b-first', role: 'main', source: 'b', in: 10, out: 13 },
        { id: 'blank', role: 'gap', duration: 2 },
        { id: 'a-second', role: 'main', source: 'a', in: 10, out: 13 },
        { id: 'song', role: 'audio', source: 'music', in: 0, out: 2, at: 1, duration: 20, loop: true },
      ],
      sequence: ['a-first', 'b-first', 'blank', 'a-second'],
    };
    const run = spawnSync(PYTHON, ['-c', `import json, sys
sys.path.insert(0, sys.argv[1])
from pieces import media_timeline, placement_time, timeline_moment
t = media_timeline(json.load(sys.stdin))
print(json.dumps({'duration': t['duration'], 'first': placement_time(t, 'a-first', 11), 'other': placement_time(t, 'b-first', 11), 'repeat': placement_time(t, 'a-second', 11), 'gap': timeline_moment(t, 7), 'moment': timeline_moment(t, 9), 'music': next(({'at': p['at'], 'duration': p['duration']} for p in t['placements'] if p['id'] == 'song'), None)}))`, ENGINE], { input: JSON.stringify(media), encoding: 'utf8' });

    expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(run.stdout)).toEqual({ duration: 11, first: 1, other: 4, repeat: 9, gap: null, moment: { placement: 'a-second', source: 'a', time: 11 }, music: { at: 1, duration: 10 } });
  });

  it('builds separate caption occurrences with placement corrections and no captions during a silent photo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kinotta-media-engine-'));
    const planFile = join(dir, 'plan.json');
    const pageFile = join(dir, 'index.html');
    writeFileSync(planFile, JSON.stringify({
      title: 'Repeated speech', duration: 12, clips: [], captions: { phrases: [{ placement: 'second', at: 1, x: 12, y: -20 }] },
      media: {
        schema: 1,
        sources: [
          { id: 'a', kind: 'video', path: 'a.mp4', duration: 12, words: [{ text: 'hello', start: 1, end: 1.5 }] },
          { id: 'photo', kind: 'image', path: 'photo.png', duration: 0 },
        ],
        placements: [
          { id: 'first', role: 'main', source: 'a', in: 0, out: 3 },
          { id: 'blank', role: 'main', source: 'photo', in: 0, out: 0, duration: 2 },
          { id: 'second', role: 'main', source: 'a', in: 0, out: 3, words: [{ text: 'world', start: 1, end: 1.5 }] },
        ],
        sequence: ['first', 'blank', 'second'],
      },
    }));
    const run = spawnSync(PYTHON, [join(ENGINE, 'build.py'), '--plan', planFile, pageFile], { encoding: 'utf8' });

    expect(run.status, run.stderr).toBe(0);
    const page = parse(readFileSync(pageFile, 'utf8'));
    expect(page.toString()).toContain('M.page(8');
    expect(page.querySelectorAll('[data-caption]').map((p) => [p.getAttribute('data-start'), p.getAttribute('data-duration'), p.getAttribute('data-placement'), p.text.trim()])).toEqual([
      ['1.0', '0.5', 'first', 'hello'], ['6.0', '0.5', 'second', 'world'],
    ]);
    expect(page.querySelectorAll('[data-caption]').map((p) => p.getAttribute('data-source-start'))).toEqual(['1', '1']);
    expect(page.querySelector('[data-placement="first"] .caption')!.getAttribute('style')).not.toContain('translate');
    expect(page.querySelector('[data-placement="second"] .caption')!.getAttribute('style')).toContain('translate:12px -20px');
  });
});
