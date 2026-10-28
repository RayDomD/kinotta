import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { DONE_MARKER, watchCopyOutput } from '../../server/core/_internal/copy-watch.ts';

it('does not leave a rejection unhandled when recording a settle failure itself fails', async () => {
  const jobDir = mkdtempSync(join(tmpdir(), 'kinotta-copy-watch-'));
  const outputDir = join(jobDir, 'output');
  mkdirSync(outputDir);
  const unhandled = vi.fn();
  process.on('unhandledRejection', unhandled);
  const reported = vi.spyOn(console, 'error').mockImplementation(() => {});
  const failed = new Promise<void>((resolve) => {
    watchCopyOutput(
      jobDir,
      outputDir,
      () => { throw new Error('accept failed'); },
      () => { resolve(); throw new Error('status could not be saved'); },
      { settleMs: 20 },
    );
    writeFileSync(join(outputDir, DONE_MARKER), '');
  });
  try {
    await failed;
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(unhandled).not.toHaveBeenCalled();
    expect(reported).toHaveBeenCalled();
  } finally {
    process.off('unhandledRejection', unhandled);
    reported.mockRestore();
    rmSync(jobDir, { recursive: true, force: true });
  }
});
