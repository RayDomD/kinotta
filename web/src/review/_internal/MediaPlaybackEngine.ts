import { activeTrackEq, webAudioEqQ, audioFades, audioGain, mediaTimeline, mediaWithTracks, trackGain } from '../../../../server/core/model.ts';
import type { MediaPlan } from '../../../../server/core/model.ts';


export interface PlaybackSnapshot { time: number; playing: boolean; ready: boolean; error: string | null; failures: Record<string, string> }
export const INITIAL_PLAYBACK: PlaybackSnapshot = { time: 0, playing: false, ready: false, error: null, failures: {} };
const NONE: readonly string[] = [];

/** Owns the audio clock, decoded sources and scheduling independently of React renders. */
export class MediaPlaybackEngine {
  private state = INITIAL_PLAYBACK;
  private listeners = new Set<(state: PlaybackSnapshot) => void>();
  private buffers = new Map<string, AudioBuffer>();
  private preparing = new Map<string, Promise<void>>();
  private failures = new Map<string, string>();
  private nodes: AudioBufferSourceNode[] = [];
  private effects: AudioNode[] = [];
  private anchor = { time: 0, clock: 0 };
  private frame = 0;
  private disposed = false;
  private generation = 0;
  private media!: MediaPlan;
  private duration = 0;
  private sourceUrl!: (id: string) => string;
  private solo: readonly string[] = NONE;
  private soloTracks: readonly string[] = NONE;
  private skip?: { from: number; to: number } | null;

  constructor(private ctx: AudioContext, private bytes: (url: string) => Promise<ArrayBuffer>) {}
  getSnapshot = () => this.state;
  subscribe = (listener: (state: PlaybackSnapshot) => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(change: Partial<PlaybackSnapshot>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) listener(this.state);
  }
  private moment() { return this.state.playing ? Math.min(this.duration, this.anchor.time + this.ctx.currentTime - this.anchor.clock) : this.state.time; }
  private stop() {
    cancelAnimationFrame(this.frame);
    for (const node of this.nodes) { try { node.stop(); } catch { /* Already ended. */ } node.disconnect(); }
    this.nodes = [];
    for (const node of this.effects) node.disconnect();
    this.effects = [];
  }
  async update(media: MediaPlan, duration: number, sourceUrl: (id: string) => string, solo = NONE, soloTracks = NONE, skip?: { from: number; to: number } | null) {
    const time = this.moment();
    this.media = media; this.duration = duration; this.sourceUrl = sourceUrl; this.solo = solo; this.soloTracks = soloTracks; this.skip = skip;
    const generation = ++this.generation;
    const sources = media.sources.filter((s) => s.kind !== 'image' && s.audio !== false && media.placements.some((p) => p.role !== 'gap' && p.source === s.id && !p.mute && trackGain(media, p) > 0 && (p.role !== 'insert' || p.mute === false)));
    const missing = sources.filter((source) => !this.buffers.has(sourceUrl(source.id)) && !this.failures.has(sourceUrl(source.id)));
    const failures = Object.fromEntries(sources.flatMap((source) => { const failure = this.failures.get(sourceUrl(source.id)); return failure ? [[source.id, failure]] : []; }));
    const error = Object.values(failures)[0] ?? null;
    this.publish({ time: Math.min(time, duration), ready: missing.length === 0 && !error, failures, error, ...(error ? { playing: false } : {}) });
    this.schedule();
    if (!missing.length) return;
    await Promise.all(missing.map((source) => {
      const url = sourceUrl(source.id);
      if (this.buffers.has(url) || this.failures.has(url)) return;
      let pending = this.preparing.get(url);
      if (!pending) {
        pending = this.bytes(url).then((bytes) => this.ctx.decodeAudioData(bytes)).then((buffer) => { if (!this.disposed) this.buffers.set(url, buffer); })
          .catch((error: unknown) => { this.failures.set(url, error instanceof Error ? error.message : 'The sound could not be prepared.'); })
          .finally(() => { this.preparing.delete(url); });
        this.preparing.set(url, pending);
      }
      return pending;
    }));
    if (this.disposed || generation !== this.generation) return;
    const nextFailures = Object.fromEntries(sources.flatMap((source) => { const failure = this.failures.get(sourceUrl(source.id)); return failure ? [[source.id, failure]] : []; }));
    const nextError = Object.values(nextFailures)[0] ?? null;
    this.publish({ time: this.moment(), ready: !nextError, failures: nextFailures, error: nextError });
    if (nextError) { this.publish({ playing: false }); this.stop(); }
    else this.schedule();
  }
  private schedule() {
    this.stop();
    if (!this.state.playing) return;
    const ctx = this.ctx;
    const { media, duration, sourceUrl, solo, soloTracks, skip } = this;
    const requested = Math.min(this.state.time, duration);
    const from = skip && requested >= skip.from && requested < skip.to ? Math.min(skip.to, duration) : requested;
    this.anchor = { time: from, clock: ctx.currentTime };
    this.publish({ time: from });
    const tracked = soloTracks.length ? mediaWithTracks(media) : media;
    const timeline = mediaTimeline(tracked, duration);
    for (const p of timeline.placements) {
      if (p.role === 'gap' || p.attachmentBroken || p.mute || trackGain(tracked, p) === 0 || (solo.length && !solo.includes(p.id)) || (soloTracks.length && !soloTracks.includes(p.track ?? '')) || (p.role === 'insert' && p.mute !== false) || p.at + p.duration <= from) continue;
      const buffer = this.buffers.get(sourceUrl(p.source));
      if (!buffer) continue;
      const local = Math.max(0, from - p.at);
      const start = ctx.currentTime + Math.max(0, p.at - from);
      const remaining = Math.min(p.duration - local, skip && from < skip.from ? Math.max(0, skip.from - Math.max(from, p.at)) : Infinity);
      if (remaining === 0) continue;
      const end = start + remaining;
      const source = ctx.createBufferSource(); source.buffer = buffer;
      source.loop = !!p.loop; source.loopStart = p.in; source.loopEnd = p.out;
      const volume = ctx.createGain();
      volume.gain.setValueAtTime(audioGain({ ...p, fadeIn: 0, fadeOut: 0 }, p.duration, local), start);
      for (const point of p.volume ?? []) {
        if (point.at > local && point.at < local + remaining) volume.gain.linearRampToValueAtTime(point.gain, start + point.at - local);
      }
      // If trimming ends inside a ramp, finish at the interpolated level rather than holding its first endpoint.
      volume.gain.linearRampToValueAtTime(audioGain({ ...p, fadeIn: 0, fadeOut: 0 }, p.duration + 1e-9, local + remaining), end);
      const fadeStart = ctx.createGain(); const fadeEnd = ctx.createGain();
      const [fadeIn, fadeOut] = audioFades(p, p.duration);
      fadeStart.gain.setValueAtTime(fadeIn > 0 ? Math.min(1, local / fadeIn) : 1, start);
      if (fadeIn > local) fadeStart.gain.linearRampToValueAtTime(1, start + fadeIn - local);
      fadeEnd.gain.setValueAtTime(fadeOut > 0 ? Math.min(1, (p.duration - local) / fadeOut) : 1, start);
      if (fadeOut > 0) {
        if (p.duration - fadeOut > local) fadeEnd.gain.setValueAtTime(1, start + p.duration - fadeOut - local);
        fadeEnd.gain.linearRampToValueAtTime(0, start + p.duration - local);
      }
      const track = ctx.createGain();
      track.gain.value = trackGain(tracked, p);
      this.effects.push(volume, fadeStart, fadeEnd, track);
      let output: AudioNode = source.connect(volume).connect(fadeStart).connect(fadeEnd).connect(track);
      for (const filter of activeTrackEq(tracked.tracks?.find((track) => track.id === p.track))) {
        const biquad = ctx.createBiquadFilter();
        biquad.type = filter.type; biquad.frequency.value = filter.frequency;
        biquad.gain.value = filter.gain ?? 0; biquad.Q.value = webAudioEqQ(filter);
        output.connect(biquad); output = biquad;
        this.effects.push(biquad);
      }
      output.connect(ctx.destination);
      source.start(start, p.in + (p.loop ? local % (p.out - p.in) : local), remaining);
      this.nodes.push(source);
    }

    this.frame = requestAnimationFrame(this.tick);
  }
  private tick = () => {
    const time = this.moment();
    if (this.skip && this.anchor.time < this.skip.from && time >= this.skip.from) {
      this.publish({ time: Math.min(this.duration, this.skip.to) }); this.schedule(); return;
    }
    this.publish({ time });
    if (time >= this.duration) { this.publish({ playing: false }); this.stop(); }
    else this.frame = requestAnimationFrame(this.tick);
  };
  /** Relocate an edit's clock without turning a running transport into a paused seek. */
  remap = (at: number, playing = this.state.playing) => {
    this.publish({ time: Math.max(0, Math.min(this.duration, at)), playing });
    this.schedule();
  };
  seek = (at: number) => { this.stop(); this.publish({ time: Math.max(0, Math.min(this.duration, at)), playing: false }); };
  toggle = async () => {
    if (this.state.playing) { this.publish({ time: this.moment(), playing: false }); this.stop(); await this.ctx.suspend(); }
    else if (this.state.ready) {
      await this.ctx.resume();
      if (this.disposed) return;
      this.publish({ time: this.state.time >= this.duration ? 0 : this.state.time, playing: true }); this.schedule();
    }
  };
  retry = async (id: string) => { const url = this.sourceUrl(id); this.buffers.delete(url); this.failures.delete(url); await this.update(this.media, this.duration, this.sourceUrl, this.solo, this.soloTracks, this.skip); };
  dispose() { this.disposed = true; this.generation++; this.stop(); this.listeners.clear(); this.buffers.clear(); void this.ctx.close(); }
}
