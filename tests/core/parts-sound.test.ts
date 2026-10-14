import { describe, expect, it } from 'vitest';
import { applyOperations } from '../../server/core/model.ts';
import { mediaTimeline } from '../../server/core/model.ts';
import type { Sources } from '../../server/core/model.ts';

describe('parts timing and sound attachments', () => {
  it('moves later shots and only their attached sound when a shot changes length', () => {
    const sources: Sources = { words: [], plan: { codeTiming: true, duration: 3,
      parts: { contract: 2, duration: 3, shared: 'r1', shots: ['hook', 'proof', 'close'].map((name) => ({ name, revision: 'r1', duration: 1, title: name, description: name })) },
      clips: ['hook', 'proof', 'close'].map((id, index) => ({ id, in: index, out: index + 1 })),
      media: { schema: 1, sequence: [], sources: [{ id: 'tone', kind: 'audio', path: 'tone.wav', duration: 0.2 }], placements: [
        { id: 'attached', role: 'audio', source: 'tone', at: 1.1, in: 0, out: 0.2, attachment: { placement: 'proof', time: 0.1 } },
        { id: 'fixed', role: 'audio', source: 'tone', at: 1.1, in: 0, out: 0.2 },
      ] },
    } };
    const applied = applyOperations(sources, [{ id: 'trim', by: 'you', kind: 'clip-trim', clip: 'hook', in: 0, out: 0.5 }]);
    expect(applied.plan.clips?.map((clip) => [clip.in, clip.out])).toEqual([[0, 0.5], [0.5, 1.5], [1.5, 2.5]]);
    const sound = mediaTimeline(applied.plan.media!, applied.plan.duration);
    expect(sound.placements[0]).toMatchObject({ at: 0.6 });
    expect(sound.placements[0].attachmentBroken).toBeUndefined();
    expect(sound.placements[1].at).toBe(1.1);
  });
});
