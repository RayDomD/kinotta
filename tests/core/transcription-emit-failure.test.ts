import { expect, it, vi } from 'vitest';
import { createTranscriptions } from '../../server/core/_internal/transcription.ts';

it('finishes a transcription job even when a progress listener throws', async () => {
  const unhandled = vi.fn();
  process.on('unhandledRejection', unhandled);
  try {
    const transcriptions = createTranscriptions(() => { throw new Error('listener failed'); });
    transcriptions.start('reel', 10, async () => undefined);
    await transcriptions.whenDone('reel');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(unhandled).not.toHaveBeenCalled();
    expect(transcriptions.progress('reel')?.state).toBe('done');
  } finally { process.off('unhandledRejection', unhandled); }
});
