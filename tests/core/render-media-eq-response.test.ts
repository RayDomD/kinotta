import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { expect, it } from 'vitest';
import { EQ_TYPES, MEDIA_AUDIO_RATE, trackEqFilters, webAudioEqQ } from '../../server/core/model.ts';
import type { TrackFilter } from '../../server/core/model.ts';

const FREQUENCIES = [20, 100, 500, 2500, 10000, 20000];
const SECONDS_PER_TONE = 6;
const LEVEL = 0.1;
/** Settled sine sweep, including validation boundaries. Compare above the −80 dB numerical floor. */
it('matches every rendered EQ type to Web Audio within 0.1 dB across a sweep and extreme allowed parameters', { timeout: 120_000 }, async () => {
  const input = new Float64Array(FREQUENCIES.length * SECONDS_PER_TONE * MEDIA_AUDIO_RATE);
  FREQUENCIES.forEach((frequency, tone) => {
    const start = tone * SECONDS_PER_TONE * MEDIA_AUDIO_RATE;
    for (let n = 0; n < SECONDS_PER_TONE * MEDIA_AUDIO_RATE; n++) input[start + n] = LEVEL * Math.sin(2 * Math.PI * frequency * n / MEDIA_AUDIO_RATE);
  });
  const filters: TrackFilter[] = EQ_TYPES.flatMap((type) => [
    { type, frequency: 2500, gain: -6, q: 0.8 },
    { type, frequency: 20, gain: 24, q: 10 },
    { type, frequency: 20000, gain: -24, q: 0.1 },
  ]);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const filter of filters) {
      const graph = trackEqFilters({ id: 'track', name: 'Track', order: 0, gain: 1, mute: false, eq: [filter] });
      const run = spawnSync('ffmpeg', ['-v', 'error', '-f', 'f64le', '-ar', String(MEDIA_AUDIO_RATE), '-ac', '1', '-i', '-', '-af', graph, '-f', 'f64le', '-'], { input: Buffer.from(input.buffer), maxBuffer: 16 * 1024 * 1024 });
      expect(run.status, run.stderr.toString()).toBe(0);
      const samples = new Float64Array(run.stdout.buffer, run.stdout.byteOffset, run.stdout.length / 8);
      const expected = await page.evaluate(({ filter, q, frequencies, rate }) => {
        const context = new OfflineAudioContext(1, 1, rate);
        const node = context.createBiquadFilter(); node.type = filter.type;
        node.frequency.value = filter.frequency; node.gain.value = filter.gain ?? 0; node.Q.value = q;
        const response = new Float32Array(frequencies.length);
        node.getFrequencyResponse(new Float32Array(frequencies), response, new Float32Array(frequencies.length));
        return Array.from(response);
      }, { filter, q: webAudioEqQ(filter), frequencies: FREQUENCIES, rate: MEDIA_AUDIO_RATE });
      FREQUENCIES.forEach((frequency, tone) => {
        const start = (tone * SECONDS_PER_TONE + SECONDS_PER_TONE - 1) * MEDIA_AUDIO_RATE;
        let sine = 0; let cosine = 0;
        for (let n = 0; n < MEDIA_AUDIO_RATE; n++) {
          const angle = 2 * Math.PI * frequency * n / MEDIA_AUDIO_RATE;
          sine += samples[start + n] * Math.sin(angle); cosine += samples[start + n] * Math.cos(angle);
        }
        const actual = Math.hypot(sine, cosine) * 2 / MEDIA_AUDIO_RATE / LEVEL;
        if (expected[tone] < 1e-4) expect(actual).toBeLessThan(1e-4);
        else expect(Math.abs(20 * Math.log10(actual / expected[tone])), `${JSON.stringify(filter)} at ${frequency} Hz`).toBeLessThan(0.1);
      });
    }
  } finally { await browser.close(); }
});
