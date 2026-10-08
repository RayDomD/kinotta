import { useCallback, useEffect, useRef, useState } from 'react';
import { audioFades, audioGain, mediaTimeline, mediaWithTracks, trackGain } from '../../../../server/core/model.ts';
import type { MediaPlan } from '../../../../server/core/model.ts';
import { mediaBytes } from '../../api/index.ts';

/**
 * A shared AudioContext clock with all audible sources stopped together on pause or seek. `hold` stops the sound and the
 * clock while staying in play, for a picture that cannot keep up (AM36); releasing it resumes from the same moment.
 */
const NO_TRACK_SOLOS: readonly string[] = [];

export function useMediaPlayback(media: MediaPlan, duration: number, sourceUrl: (id: string) => string, solo: readonly string[] = NO_TRACK_SOLOS, soloTracks: readonly string[] = NO_TRACK_SOLOS, skip?: { from: number; to: number } | null) {
  const context = useRef<AudioContext | null>(null);
  const buffers = useRef(new Map<string, AudioBuffer>());
  const nodes = useRef<AudioBufferSourceNode[]>([]);
  const position = useRef(0);
  const anchor = useRef({ time: 0, clock: 0 });
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState(0);
  const [held, setHeld] = useState(false);
  const [jump, setJump] = useState(0);
  const stop = useCallback(() => {
    for (const node of nodes.current) { try { node.stop(); } catch { /* Already ended. */ } node.disconnect(); }
    nodes.current = [];
  }, []);

  useEffect(() => {
    context.current = new AudioContext();
    return () => { stop(); void context.current?.close(); context.current = null; };
  }, [stop]);

  useEffect(() => {
    let current = true;
    stop(); setReady(false); setError(null); setFailures({});
    const ctx = context.current!;
    const sources = media.sources.filter((s) => s.kind !== 'image' && s.audio !== false && media.placements.some((p) => p.role !== 'gap' && p.source === s.id && !p.mute && trackGain(media, p) > 0 && (p.role !== 'insert' || p.mute === false)));
    void Promise.all(sources.map(async (source) => {
      try {
        const url = sourceUrl(source.id);
        if (!buffers.current.has(url)) buffers.current.set(url, await ctx.decodeAudioData(await mediaBytes(url)));
        return null;
      } catch (failure: unknown) {
        return { id: source.id, message: failure instanceof Error ? failure.message : 'The sound could not be prepared.' };
      }
    })).then((results) => {
      if (!current) return;
      const failed = results.filter((result) => result !== null);
      setFailures(Object.fromEntries(failed.map((failure) => [failure.id, failure.message])));
      setReady(failed.length === 0);
      if (failed.length) { setPlaying(false); setError(failed[0]!.message); }
    });
    return () => { current = false; };
  }, [media, sourceUrl, stop, attempt]);

  useEffect(() => {
    stop();
    if (!playing || !ready || held) return;
    const ctx = context.current!;
    const requested = Math.min(position.current, duration);
    const from = skip && requested >= skip.from && requested < skip.to ? Math.min(skip.to, duration) : requested;
    position.current = from;
    setTime(from);
    anchor.current = { time: from, clock: ctx.currentTime };
    const tracked = soloTracks.length ? mediaWithTracks(media) : media;
    const timeline = mediaTimeline(tracked, duration);
    for (const p of timeline.placements) {
      if (p.role === 'gap' || p.attachmentBroken || p.mute || trackGain(tracked, p) === 0 || (solo.length && !solo.includes(p.id)) || (soloTracks.length && !soloTracks.includes(p.track ?? '')) || (p.role === 'insert' && p.mute !== false) || p.at + p.duration <= from) continue;
      const buffer = buffers.current.get(sourceUrl(p.source));
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
      source.connect(volume).connect(fadeStart).connect(fadeEnd).connect(track).connect(ctx.destination);
      source.start(start, p.in + (p.loop ? local % (p.out - p.in) : local), remaining);
      nodes.current.push(source);
    }
    let frame = 0;
    const tick = () => {
      position.current = Math.min(duration, from + ctx.currentTime - anchor.current.clock);
      if (skip && from < skip.from && position.current >= skip.from) {
        position.current = skip.to; setTime(skip.to); stop(); setJump((before) => before + 1); return;
      }
      setTime(position.current);
      if (position.current >= duration) { setPlaying(false); stop(); }
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); stop(); };
  }, [playing, ready, held, media, duration, solo, soloTracks, sourceUrl, stop, skip, jump]);

  const seek = useCallback((at: number) => {
    stop(); position.current = Math.max(0, Math.min(duration, at)); setTime(position.current); setPlaying(false);
  }, [duration, stop]);
  const toggle = useCallback(async () => {
    if (playing) { stop(); setPlaying(false); await context.current?.suspend(); }
    else if (ready) {
      if (position.current >= duration) { position.current = 0; setTime(0); }
      await context.current?.resume(); setPlaying(true);
    }
  }, [playing, ready, duration, stop]);
  const hold = useCallback((on: boolean) => setHeld(on), []);
  const retry = useCallback((id: string) => { buffers.current.delete(sourceUrl(id)); setAttempt((before) => before + 1); }, [sourceUrl]);
  return { time, playing, ready, error, failures, held, seek, toggle, hold, retry };
}
