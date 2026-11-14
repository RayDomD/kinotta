import { mediaTimeline } from './media-model.ts';
import type { MediaPlan } from './media-model.ts';

/** Beat markers are reel moments, with the source's trim and each loop cycle respected. */
export function placementBeats(media: MediaPlan, placement: string, duration = 0): Array<{ at: number; downbeat: boolean }> {
  const p = mediaTimeline(media, duration).placements.find((p) => p.id === placement);
  if (!p || p.role === 'gap' || p.attachmentBroken) return [];
  const source = media.sources.find((source) => source.id === p.source)!;
  if (!source.beats || source.kind === 'image' || source.audio === false) return [];
  const length = p.out - p.in;
  if (length <= 0) return [];
  const result: Array<{ at: number; downbeat: boolean }> = [];
  for (let cycle = 0; cycle < (p.loop ? Math.ceil(p.duration / length) : 1); cycle++) {
    for (const beat of source.beats.beats) {
      const local = beat - p.in + cycle * length;
      if (beat >= p.in && beat < p.out && local < p.duration) result.push({ at: p.at + local, downbeat: source.beats.downbeats.includes(beat) });
    }
  }
  return result;
}
