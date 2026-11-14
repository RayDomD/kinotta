import { mediaTimeline, mediaWithTracks, trackGain } from './media-model.ts';
import type { MediaPlan, SourcePlacement } from './media-model.ts';

export interface MixSample {
  placement: string;
  source: string;
  /** Source seconds, including a loop's phase. */
  time: number;
  gain: number;
}

export function audioFades(p: SourcePlacement, duration: number): [number, number] {
  let fadeIn = p.fadeIn ?? 0;
  let fadeOut = p.fadeOut ?? 0;
  const total = fadeIn + fadeOut;
  if (total > duration) {
    const scale = duration / total;
    fadeIn *= scale;
    fadeOut *= scale;
  }
  return [fadeIn, fadeOut];
}

/** Sample-time FFmpeg expression for exactly the envelope used by preview. */
export function audioExpression(p: SourcePlacement, duration: number): string {
  if (p.mute) return '0';
  const [fadeIn, fadeOut] = audioFades(p, duration);
  let previous = { at: 0, gain: p.gain ?? 1 };
  const ranges: Array<{ at: number; expression: string }> = [];
  for (const point of p.volume ?? []) {
    if (point.at > previous.at) ranges.push({ at: point.at, expression: `${previous.gain}+(${point.gain - previous.gain})*(t-${previous.at})/${point.at - previous.at}` });
    previous = point;
  }
  let expression = String(previous.gain);
  for (const range of ranges.reverse()) expression = `if(lt(t,${range.at}),${range.expression},${expression})`;
  if (fadeIn > 0) expression = `(${expression})*min(1,t/${fadeIn})`;
  if (fadeOut > 0) expression = `(${expression})*min(1,(${duration}-t)/${fadeOut})`;
  return expression;
}

/** Combined fades fit the audible duration proportionally, including a reel-end trim. */
export function audioGain(p: SourcePlacement, duration: number, localTime: number): number {
  if (p.mute || localTime < 0 || localTime >= duration) return 0;
  const [fadeIn, fadeOut] = audioFades(p, duration);
  const start = fadeIn > 0 ? Math.min(1, localTime / fadeIn) : 1;
  const end = fadeOut > 0 ? Math.min(1, (duration - localTime) / fadeOut) : 1;
  let gain = p.gain ?? 1;
  let previous = { at: 0, gain };
  for (const point of p.volume ?? []) {
    if (localTime < point.at) {
      gain = previous.gain + (point.gain - previous.gain) * (localTime - previous.at) / (point.at - previous.at);
      return gain * start * end;
    }
    previous = point;
    gain = point.gain;
  }
  return gain * start * end;
}

/** The same mix state after a seek as after continuous playback. Solo is supplied only by preview. */
export function mixAt(media: MediaPlan, time: number, authoredDuration = 0, solo: readonly string[] = [], soloTracks: readonly string[] = []): MixSample[] {
  if (soloTracks.length) media = mediaWithTracks(media);
  const timeline = mediaTimeline(media, authoredDuration);
  if (time < 0 || time >= timeline.duration) return [];
  const mix: MixSample[] = [];
  for (const p of timeline.placements) {
    if (p.role === 'gap' || p.attachmentBroken || (solo.length && !solo.includes(p.id)) || (soloTracks.length && !soloTracks.includes(p.track ?? ''))) continue;
    const source = media.sources.find((s) => s.id === p.source)!;
    if (source.kind === 'image' || source.audio === false || (p.role === 'insert' && p.mute !== false)) continue;
    const local = time - p.at;
    if (local < 0 || local >= p.duration || p.mute || trackGain(media, p) === 0) continue;
    const phase = p.loop ? local % (p.out - p.in) : local;
    mix.push({ placement: p.id, source: p.source, time: p.in + phase, gain: audioGain(p, p.duration, local) * trackGain(media, p) });
  }
  return mix;
}

/** `1.20–1.50s (peak +1.6 dB)`: where a mix passes full scale, as the editor and a refused render name it (AM29, AM38). */
export function describeOverload({ spans }: { spans: ReadonlyArray<{ start: number; end: number; peak: number }> }): string {
  const db = (peak: number): string => `+${(20 * Math.log10(peak)).toFixed(1)} dB`;
  return spans.map((span) => `${span.start.toFixed(2)}–${span.end.toFixed(2)}s (peak ${db(span.peak)})`).join(', ');
}
