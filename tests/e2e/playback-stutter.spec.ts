import { expect, test } from '../helpers/editor-test.ts';
import type { Page } from '../helpers/editor-test.ts';
import { rmSync } from 'node:fs';
import { createStutterProject } from './realtime-project.ts';
import { startServer } from '../../server/main.ts';

const MAX_ALLOWED_WAIT_MS = 0;
const MAX_ALLOWED_CURRENT_TIME_WRITES = 4;
const TARGET_CLOCK = 4.7;

interface PlaybackEvent {
  t: number;
  type: string;
  clock?: number;
  waiting?: string;
  target?: number;
  currentTime?: number;
  paused?: boolean;
  value?: string;
  old?: string;
}

interface WaitEpisode {
  from: number;
  to: number;
  durationMs: number;
  clock: number;
}

interface PlaybackMeasurement {
  slug: string;
  finalClock: number;
  waitEpisodes: WaitEpisode[];
  maxWaitMs: number;
  totalWaitMs: number;
  currentTimeWritesDuringPlay: PlaybackEvent[];
}


async function attachInstrumentation(page: Page) {
  await page.addInitScript(() => {
    (window as any).__playbackLog = [] as PlaybackEvent[];
    const state = () => {
      const editor = document.querySelector('[data-verify-unit="MediaEditor"]');
      return {
        clock: Number(editor?.getAttribute('data-verify-clock') ?? 0),
        waiting: editor?.getAttribute('data-verify-waiting') ?? '',
      };
    };
    const rec = (type: string, extra: Record<string, unknown> = {}) => {
      (window as any).__playbackLog.push({
        t: performance.now(),
        type,
        ...state(),
        ...extra,
      });
    };

    const d = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
    if (d && d.set) {
      Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
        ...d,
        set(val: number) {
          if (this instanceof HTMLVideoElement) {
            rec('set-currentTime', { target: val, paused: this.paused, currentTime: this.currentTime });
          }
          d.set!.call(this, val);
        },
      });
    }

    for (const type of ['playing', 'pause', 'waiting', 'seeking', 'seeked', 'stalled']) {
      document.addEventListener(
        type,
        (e) => {
          if (e.target instanceof HTMLVideoElement) {
            rec(type, { currentTime: e.target.currentTime, paused: e.target.paused });
          }
        },
        true
      );
    }

    new MutationObserver((ms) => {
      for (const m of ms) {
        if (m.attributeName === 'data-verify-waiting' && m.target instanceof Element) {
          rec('gate', {
            value: m.target.getAttribute('data-verify-waiting') ?? '',
            old: m.oldValue ?? '',
          });
        }
      }
    }).observe(document, {
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ['data-verify-waiting'],
    });
  });
}

async function runPlaybackTest(
  page: Page,
  serverUrl: string,
  slug: 'uncut' | 'blade' | 'jump' | 'reorder'
): Promise<PlaybackMeasurement> {
  page.on('pageerror', (e) => console.log(`[${slug}] PAGE ERROR:`, e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.text().includes('fail') || msg.text().includes('error')) {
      console.log(`[${slug}] CONSOLE ${msg.type()}:`, msg.text());
    }
  });
  await attachInstrumentation(page);
  await page.goto(serverUrl);
  await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: `Playback ${slug}`, exact: true }).click();
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await page.locator('[data-verify-unit="MediaEditor"]').waitFor();
  await page.waitForFunction(
    () => document.querySelector('[data-verify-unit="MediaEditor"]')?.getAttribute('data-verify-loading') === 'false'
  );

  await expect(page.locator('[data-verify-unit="MediaEditor"]')).toHaveAttribute('data-verify-editable', 'true');

  const allWaitEpisodes: WaitEpisode[] = [];
  const allCurrentTimeWrites: PlaybackEvent[] = [];
  let finalClock = 0;

  for (let repeat = 1; repeat <= 2; repeat++) {
    // Seek playhead to 0 and settle
    await page.getByLabel('Playhead', { exact: true }).fill('0');
    await page.getByLabel('Playhead', { exact: true }).press('Tab');
    await page.waitForTimeout(400);

    const startMark = await page.evaluate(() => performance.now());
    await page.getByRole('button', { name: 'Play', exact: true }).click();

    if (slug === 'reorder') {
      await page.waitForFunction(() => Number(document.querySelector('[data-verify-unit="MediaEditor"]')?.getAttribute('data-verify-clock')) > 0.5);
      const clips = page.locator('.native-lane[data-role="main"] .native-clip');
      await clips.first().scrollIntoViewIfNeeded();
      const first = await clips.first().boundingBox(); const second = await clips.nth(1).boundingBox();
      await page.mouse.move(first!.x + first!.width / 2, first!.y + first!.height / 2);
      await page.mouse.down();
      await page.mouse.move(second!.x + second!.width * 0.85, second!.y + second!.height / 2, { steps: 12 });
      await page.mouse.up();
      await expect.poll(async () => (await page.request.get(`${serverUrl}/api/reels/reorder/edits`).then((r) => r.json())).operations.some((op: any) => op.kind === 'placement-move')).toBe(true);
    }
    let reached = true;
    try {
      await page.waitForFunction(
        (target) => Number(document.querySelector('[data-verify-unit="MediaEditor"]')?.getAttribute('data-verify-clock') ?? 0) >= target,
        TARGET_CLOCK,
        { timeout: 45_000 }
      );
    } catch (err: any) {
      reached = false;
      console.log(`[${slug} repeat ${repeat}] waitForFunction failed:`, err?.message);
    }

    finalClock = await page.evaluate(
      () => Number(document.querySelector('[data-verify-unit="MediaEditor"]')?.getAttribute('data-verify-clock') ?? 0)
    );

    const pauseBtn = page.getByRole('button', { name: 'Pause', exact: true });
    if (await pauseBtn.count()) await pauseBtn.click();

    const logs = await page.evaluate(
      (from) => ((window as any).__playbackLog as PlaybackEvent[]).filter((e) => e.t >= from),
      startMark
    );

    // Find first playing event for this repeat
    const firstPlaying = logs.find((e) => e.type === 'playing');
    const firstPlayingTime = firstPlaying ? firstPlaying.t : startMark;

    // Calculate completed wait episodes after first playing in this repeat
    let pendingGate: PlaybackEvent | null = null;
    for (const e of logs.filter((e) => e.type === 'gate')) {
      if (e.value === 'true' && !pendingGate) {
        pendingGate = e;
      } else if (e.value === 'false' && pendingGate) {
        allWaitEpisodes.push({
          from: pendingGate.t,
          to: e.t,
          durationMs: e.t - pendingGate.t,
          clock: pendingGate.clock ?? 0,
        });
        pendingGate = null;
      }
    }

    if (pendingGate) allWaitEpisodes.push({ from: pendingGate.t, to: performance.now(), durationMs: 1, clock: pendingGate.clock ?? 0 });
    // Count currentTime writes during active playback (!paused) after first playing
    const writesThisRepeat = logs.filter(
      (e) => e.type === 'set-currentTime' && !e.paused && e.t >= firstPlayingTime
    );
    allCurrentTimeWrites.push(...writesThisRepeat);

    console.log(`[${slug} repeat ${repeat}] clock: ${finalClock.toFixed(2)}s, waits: ${allWaitEpisodes.length}, writes: ${writesThisRepeat.length}`);
    if (writesThisRepeat.length > MAX_ALLOWED_CURRENT_TIME_WRITES) break;
  }

  const maxWaitMs = allWaitEpisodes.length > 0 ? Math.max(...allWaitEpisodes.map((w) => w.durationMs)) : 0;
  const totalWaitMs = allWaitEpisodes.reduce((acc, w) => acc + w.durationMs, 0);

  console.log(`\n--- Playback measurement: ${slug} ---`);
  console.log(`  Clock reached >= 4.7s: (final: ${finalClock.toFixed(2)}s)`);
  console.log(`  Wait episodes after first playing: ${allWaitEpisodes.length}`);
  for (const w of allWaitEpisodes) {
    console.log(`    Wait episode at clock ${w.clock.toFixed(2)}s: ${w.durationMs.toFixed(1)}ms`);
  }
  console.log(`  Max wait: ${maxWaitMs.toFixed(1)}ms (threshold: <= ${MAX_ALLOWED_WAIT_MS}ms)`);
  console.log(`  Total wait: ${totalWaitMs.toFixed(1)}ms`);
  console.log(`  CurrentTime writes during play: ${allCurrentTimeWrites.length} (threshold: <= ${MAX_ALLOWED_CURRENT_TIME_WRITES})`);
  for (const w of allCurrentTimeWrites) {
    console.log(`    currentTime write at clock=${w.clock?.toFixed(2)}s, target=${w.target?.toFixed(3)}s`);
  }

  return {
    slug,
    finalClock,
    waitEpisodes: allWaitEpisodes,
    maxWaitMs,
    totalWaitMs,
    currentTimeWritesDuringPlay: allCurrentTimeWrites,
  };
}

test.describe.configure({ mode: 'serial' });

test.describe('Playback drift and cut stutter regressions', () => {
  test('uncut clip plays smoothly without mid-play stalls or drift-correction seeks', async ({ page }) => {
    const projectDir = createStutterProject('uncut');
    const server = await startServer({ projectDir, port: 0 });
    try {
      const result = await runPlaybackTest(page, server.url, 'uncut');
      expect(result.finalClock, `Uncut clip reached clock >= ${TARGET_CLOCK}s`).toBeGreaterThanOrEqual(TARGET_CLOCK);
      expect(
        result.maxWaitMs,
        `Uncut clip had a wait episode of ${result.maxWaitMs.toFixed(1)}ms exceeding the ${MAX_ALLOWED_WAIT_MS}ms grace threshold`
      ).toBeLessThanOrEqual(MAX_ALLOWED_WAIT_MS);
      expect(
        result.currentTimeWritesDuringPlay.length,
        `Uncut clip had ${result.currentTimeWritesDuringPlay.length} currentTime writes during play exceeding limit of ${MAX_ALLOWED_CURRENT_TIME_WRITES}`
      ).toBeLessThanOrEqual(MAX_ALLOWED_CURRENT_TIME_WRITES);
    } finally {
      await server.close();
      try { rmSync(projectDir, { recursive: true, force: true }); } catch { /* ignore Windows EPERM */ }
    }
  });

  test('blade split plays across cut without mid-play stalls or drift-correction seeks', async ({ page }) => {
    const projectDir = createStutterProject('blade');
    const server = await startServer({ projectDir, port: 0 });
    try {
      await server.project.addOperation('blade', { kind: 'placement-split', placement: 'take', at: 4 });
      const result = await runPlaybackTest(page, server.url, 'blade');
      expect(result.finalClock, `Blade split reached clock >= ${TARGET_CLOCK}s`).toBeGreaterThanOrEqual(TARGET_CLOCK);
      expect(
        result.maxWaitMs,
        `Blade split had a wait episode of ${result.maxWaitMs.toFixed(1)}ms exceeding the ${MAX_ALLOWED_WAIT_MS}ms grace threshold`
      ).toBeLessThanOrEqual(MAX_ALLOWED_WAIT_MS);
      expect(
        result.currentTimeWritesDuringPlay.length,
        `Blade split had ${result.currentTimeWritesDuringPlay.length} currentTime writes during play exceeding limit of ${MAX_ALLOWED_CURRENT_TIME_WRITES}`
      ).toBeLessThanOrEqual(MAX_ALLOWED_CURRENT_TIME_WRITES);
    } finally {
      await server.close();
      try { rmSync(projectDir, { recursive: true, force: true }); } catch { /* ignore Windows EPERM */ }
    }
  });

  test('jump snip plays across cut without mid-play stalls or drift-correction seeks', async ({ page }) => {
    const projectDir = createStutterProject('jump');
    const server = await startServer({ projectDir, port: 0 });
    try {
      await server.project.addOperation('jump', { kind: 'placement-snip', from: 4, to: 6 });
      const result = await runPlaybackTest(page, server.url, 'jump');
      expect(result.finalClock, `Jump snip reached clock >= ${TARGET_CLOCK}s`).toBeGreaterThanOrEqual(TARGET_CLOCK);
      expect(
        result.maxWaitMs,
        `Jump snip had a wait episode of ${result.maxWaitMs.toFixed(1)}ms exceeding the ${MAX_ALLOWED_WAIT_MS}ms grace threshold`
      ).toBeLessThanOrEqual(MAX_ALLOWED_WAIT_MS);
      expect(
        result.currentTimeWritesDuringPlay.length,
        `Jump snip had ${result.currentTimeWritesDuringPlay.length} currentTime writes during play exceeding limit of ${MAX_ALLOWED_CURRENT_TIME_WRITES}`
      ).toBeLessThanOrEqual(MAX_ALLOWED_CURRENT_TIME_WRITES);
    } finally {
      await server.close();
      try { rmSync(projectDir, { recursive: true, force: true }); } catch { /* ignore Windows EPERM */ }
    }
  });
  test('reorder while playing continues without mid-play stalls or drift-correction seeks', async ({ page }) => {
    const projectDir = createStutterProject('reorder');
    const server = await startServer({ projectDir, port: 0 });
    try {
      await server.project.addOperation('reorder', { kind: 'placement-split', placement: 'take', at: 4 });
      const result = await runPlaybackTest(page, server.url, 'reorder');
      expect(result.finalClock, `Reorder reached clock >= ${TARGET_CLOCK}s`).toBeGreaterThanOrEqual(TARGET_CLOCK);
      expect(
        result.maxWaitMs,
        `Reorder had a wait episode of ${result.maxWaitMs.toFixed(1)}ms exceeding the ${MAX_ALLOWED_WAIT_MS}ms grace threshold`
      ).toBeLessThanOrEqual(MAX_ALLOWED_WAIT_MS);
      expect(
        result.currentTimeWritesDuringPlay.length,
        `Reorder had ${result.currentTimeWritesDuringPlay.length} currentTime writes during play exceeding limit of ${MAX_ALLOWED_CURRENT_TIME_WRITES}`
      ).toBeLessThanOrEqual(MAX_ALLOWED_CURRENT_TIME_WRITES);
    } finally {
      await server.close();
      try { rmSync(projectDir, { recursive: true, force: true }); } catch { /* ignore Windows EPERM */ }
    }
  });


});
