import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { validateAgentOutput } from '../../server/core/_internal/agent-output.ts';

const cut = (from: number, to: number, reason = 'Pause') => ({ from, to, reason });
function output(cuts: unknown, pieces?: { in: number; out: number }[]) {
  const dir = mkdtempSync(join(tmpdir(), 'kinotta-agent-output-'));
  writeFileSync(join(dir, 'plan.json'), JSON.stringify({ duration: 10, pieces, clips: [{ id: '01', clip: '01.html', in: 0, out: 3 }] }));
  writeFileSync(join(dir, '01.html'), '<div>clip</div>');
  writeFileSync(join(dir, 'transcript.json'), JSON.stringify({ words: [{ text: 'Hello', start: 1, end: 2 }] }));
  writeFileSync(join(dir, 'cuts.json'), JSON.stringify({ cuts }));
  writeFileSync(join(dir, 'shots.json'), JSON.stringify({ duration: 10, shots: [{ number: '01', start: 0, duration: 10, title: 'Shot 01' }] }));
  writeFileSync(join(dir, 'index.html'), '<html><head><script>window.DURATION=10;window.seek=()=>Promise.resolve();</script></head><body><section data-scene="01" data-start="0" data-duration="10"><div data-el="el">hello</div></section></body></html>');
  return dir;
}
it.each([
  ['whole reel', [cut(0, 10)], 'whole reel'],
  ['collectively whole reel', [cut(0, 5), cut(5, 10)], 'whole reel'],
  ['whitespace reason', [cut(3, 4, ' \t ')], 'non-empty'],
  ['oversized reason', [cut(3, 4, 'a'.repeat(121))], '120 characters'],
  ['tiny range', [cut(3, 3.001)], 'stretch of footage'],
  ['empty range', [cut(3, 3)], 'cut times'],
  ['negative range', [cut(-1, 0)], 'cut times'],
  ['past duration', [cut(9, 11)], 'cut times'],
  ['overlap', [cut(3, 5), cut(4, 6)], 'not overlap'],
  ['unsorted', [cut(5, 6), cut(3, 4)], 'sorted'],
  ['inside a word', [cut(1.5, 3)], 'inside a transcript word'],
])('rejects %s before publishing', async (_, cuts, reason) => {
  await expect(validateAgentOutput(output(cuts), new AbortController().signal)).rejects.toThrow(reason);
});
it('rejects a cut of footage already absent from the authored pieces', async () => {
  await expect(validateAgentOutput(output([cut(4, 5)], [{ in: 0, out: 3 }, { in: 6, out: 10 }]), new AbortController().signal)).rejects.toThrow('already cut out');
});
it('rejects a batch that removes all surviving authored pieces', async () => {
  await expect(validateAgentOutput(output([cut(0, 3), cut(6, 10)], [{ in: 0, out: 3 }, { in: 6, out: 10 }]), new AbortController().signal)).rejects.toThrow('whole reel');
});
it('accepts the documented object shape with a reason at word boundaries', async () => {
  await expect(validateAgentOutput(output([cut(2, 3, 'Long pause before the answer')]), new AbortController().signal)).resolves.toBeUndefined();
});

for (const extension of ['css', 'html', 'js', 'mjs']) {
  it(`accepts an interpolated runtime data URL in ${extension}`, async () => {
    const dir = output([]);
    const code = 'el("grain").style.backgroundImage = `url(${c.toDataURL()})`;';
    writeFileSync(join(dir, `grain.${extension}`), extension === 'html' ? `<script>${code}</script>` : code);
    await expect(validateAgentOutput(dir, new AbortController().signal)).resolves.toBeUndefined();
  });
  it.each([
    '../secret.png?x=${y}', 'assets/../${name}', '%2e%2e/${name}',
    '/abs/${a}', '//host/${a}', 'C:\\abs\\${a}', 'https://host/${a}', 'custom+asset:/${a}',
    'missing/${name}', '01.html/${name}',
  ])(`rejects unsafe interpolated url(%s) in ${extension}`, async (reference) => {
    const dir = output([]);
    const code = `background-image: url('${reference}')`;
    writeFileSync(join(dir, `grain.${extension}`), extension === 'html' ? `<style>${code}</style>` : code);
    await expect(validateAgentOutput(dir, new AbortController().signal)).rejects.toThrow(/Agent output references (an external|a missing or escaping) asset/);
  });
  it.each(['${name}', 'grain-${name}.png', 'assets/${name}.png', 'assets/grain-${name}.png', 'data:image/png,${data}', '#${id}'])(`accepts safe interpolated url(%s) in ${extension}`, async (reference) => {
    const dir = output([]);
    mkdirSync(join(dir, 'assets'));
    const code = `background-image: url('${reference}')`;
    writeFileSync(join(dir, `grain.${extension}`), extension === 'html' ? `<style>${code}</style>` : code);
    await expect(validateAgentOutput(dir, new AbortController().signal)).resolves.toBeUndefined();
  });
  it.each(['missing.png', '../escape.png'])(`rejects literal url(%s) in ${extension}`, async (reference) => {
    const dir = output([]);
    const code = `background-image: url(${reference})`;
    writeFileSync(join(dir, `grain.${extension}`), extension === 'html' ? `<style>${code}</style>` : code);
    await expect(validateAgentOutput(dir, new AbortController().signal)).rejects.toThrow('Agent output references a missing or escaping asset.');
  });
}

const frozenTranscript = { language: 'en', words: [{ text: 'Cloud,', start: 1, end: 2, confidence: 0.9 }] };
it('accepts transcript text corrections including punctuation and case', async () => {
  const dir = output([]);
  writeFileSync(join(dir, 'transcript.json'), JSON.stringify({ ...frozenTranscript, words: [{ ...frozenTranscript.words[0], text: 'CLAUDE!' }] }));
  const plan = JSON.parse(readFileSync(join(dir, 'plan.json'), 'utf8'));
  await expect(validateAgentOutput(dir, new AbortController().signal, plan, JSON.stringify(frozenTranscript))).resolves.toBeUndefined();
});
it.each([
  ['count', { ...frozenTranscript, words: [] }, 'word count'],
  ['start timing', { ...frozenTranscript, words: [{ ...frozenTranscript.words[0], start: 0.9 }] }, 'timings'],
  ['end timing', { ...frozenTranscript, words: [{ ...frozenTranscript.words[0], end: 2.1 }] }, 'timings'],
  ['extra word field', { ...frozenTranscript, words: [{ ...frozenTranscript.words[0], extra: true }] }, 'fields other than text'],
  ['changed word field', { ...frozenTranscript, words: [{ ...frozenTranscript.words[0], confidence: 1 }] }, 'fields other than text'],
  ['removed word field', { ...frozenTranscript, words: [{ text: 'Claude,', start: 1, end: 2 }] }, 'fields other than text'],
  ['extra top-level key', { ...frozenTranscript, extra: true }, 'fields outside words'],
  ['changed top-level field', { ...frozenTranscript, language: 'fr' }, 'fields outside words'],
  ['removed top-level field', { words: frozenTranscript.words }, 'fields outside words'],
  ['empty text', { ...frozenTranscript, words: [{ ...frozenTranscript.words[0], text: '  ' }] }, 'non-empty text'],
  ['invalid JSON', '{', 'valid JSON'],
])('rejects transcript %s changes', async (_, transcript, reason) => {
  const dir = output([]);
  writeFileSync(join(dir, 'transcript.json'), typeof transcript === 'string' ? transcript : JSON.stringify(transcript));
  const plan = JSON.parse(readFileSync(join(dir, 'plan.json'), 'utf8'));
  await expect(validateAgentOutput(dir, new AbortController().signal, plan, JSON.stringify(frozenTranscript))).rejects.toThrow(reason);
});
