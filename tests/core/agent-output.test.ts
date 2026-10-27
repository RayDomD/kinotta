import { mkdtempSync, writeFileSync } from 'node:fs';
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
