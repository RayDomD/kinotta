import { EQ_DEFAULT_Q } from './media-model.ts';
import type { MediaTrack, TrackFilter } from './media-model.ts';

export const MEDIA_AUDIO_RATE = 48000;
const DB_AMPLITUDE = 20;
export const EQ_PRESETS: Record<string, { name: string; filters: TrackFilter[] }> = {
  flat: { name: 'Flat', filters: [] },
  speech: { name: 'Make room for speech', filters: [{ type: 'highpass', frequency: 80 }, { type: 'peaking', frequency: 2500, gain: -3, q: 0.8 }] },
  rumble: { name: 'Reduce rumble', filters: [{ type: 'highpass', frequency: 80 }] },
  soft: { name: 'Soften highs', filters: [{ type: 'highshelf', frequency: 6000, gain: -3 }] },
};

export function activeTrackEq(track: MediaTrack | undefined): TrackFilter[] {
  return track?.eqBypass ? [] : (track?.eq ?? []).filter((filter) => filter.enabled !== false);
}

/** Model Q is linear. Web Audio's cut filters take resonance in dB; shelves ignore Q. */
export function webAudioEqQ(filter: TrackFilter): number {
  const q = filter.q ?? EQ_DEFAULT_Q;
  return filter.type === 'highpass' || filter.type === 'lowpass' ? DB_AMPLITUDE * Math.log10(q) : q;
}

/** Named FFmpeg biquads, double precision, fixed shelf slope matching BiquadFilterNode. */
export function trackEqFilters(track: MediaTrack | undefined): string {
  return activeTrackEq(track).map((filter) => {
    const q = filter.q ?? EQ_DEFAULT_Q;
    const gain = filter.gain ?? 0;
    if (filter.type === 'highpass' || filter.type === 'lowpass') return `${filter.type}=f=${filter.frequency}:t=q:w=${q}:p=2:r=f64`;
    if (filter.type === 'peaking') return `equalizer=f=${filter.frequency}:t=q:w=${q}:g=${gain}:r=f64`;
    return `${filter.type}=f=${filter.frequency}:t=s:w=1:g=${gain}:r=f64`;
  }).join(',');
}
