import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { follow, pieceIndexAt, sourceAt, stepTime } from './timeline.ts';
import type { Piece } from './timeline.ts';

/** While a jump is landing, the video's clock is not trusted until it is within this many seconds of the target. */
const LANDED = 0.3;
/** A video this close to where a seek wants it is left alone. */
const SAME_SPOT = 0.05;
const MS_PER_SECOND = 1000;

export interface Playback {
  /** Timeline seconds. */
  time: number;
  playing: boolean;
  play(): void;
  pause(): void;
  toggle(): void;
  /** Jumps to a timeline time; playback carries on from there if it was playing. */
  seek(time: number): void;
  /** Moves by whole frames, pausing first. */
  step(frames: number): void;
}

/**
 * Plays a reel. With a footage `video` the video's clock drives the timeline: the pieces are followed in order and
 * snipped stretches are jumped over. Without one (a code-only reel, or footage that will not load) a clock does.
 * `time` is updated on every animation frame while playing. `skip`, a stretch of the timeline, is jumped over too:
 * a snip before it is made.
 */
export function usePlayback(video: RefObject<HTMLVideoElement | null>, pieces: readonly Piece[], length: number, hasVideo: boolean, skip: { start: number; end: number } | null = null): Playback {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const piece = useRef(0);
  const frame = useRef(0);
  /** The source second a started jump is heading for, until the video has landed there. */
  const landing = useRef<number | null>(null);
  const latest = useRef({ time, pieces, length, hasVideo, skip });
  latest.current = { time, pieces, length, hasVideo, skip };

  const stopLoop = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
  }, []);

  const jump = useCallback((to: number) => {
    const { pieces: list, hasVideo: withVideo } = latest.current;
    const el = video.current;
    piece.current = pieceIndexAt(list, to);
    if (!withVideo || !el) return;
    const source = sourceAt(list, to);
    if (Math.abs(el.currentTime - source) < SAME_SPOT) return;
    landing.current = source;
    el.currentTime = source;
  }, [video]);

  const pause = useCallback(() => {
    stopLoop();
    video.current?.pause();
    setPlaying(false);
  }, [stopLoop, video]);

  const run = useCallback(() => {
    stopLoop();
    let last = performance.now();
    const tick = (now: number): void => {
      const { time: current, pieces: list, length: total, hasVideo: withVideo, skip: skipped } = latest.current;
      const el = video.current;
      let ended = false;
      // Reaching a stretch to skip goes straight to its end, as reaching a snip does.
      if (skipped && current >= skipped.start && current < skipped.end) {
        latest.current.time = skipped.end;
        setTime(skipped.end);
        jump(skipped.end);
        last = now;
        frame.current = requestAnimationFrame(tick);
        return;
      }
      if (withVideo && el) {
        if (landing.current !== null && (el.seeking || Math.abs(el.currentTime - landing.current) > LANDED)) {
          // The jump has not landed: keep the time the jump set rather than the old clock.
        } else {
          landing.current = null;
          const step = follow(list, piece.current, el.ended ? Number.POSITIVE_INFINITY : el.currentTime);
          piece.current = step.index;
          if (step.seekTo !== null) {
            landing.current = step.seekTo;
            el.currentTime = step.seekTo;
            if (el.paused) void el.play().catch(() => undefined);
          }
          ended = step.ended;
          latest.current.time = step.time;
          setTime(step.time);
        }
      } else {
        const next = Math.min(total, current + (now - last) / MS_PER_SECOND);
        piece.current = pieceIndexAt(list, next);
        ended = next >= total;
        latest.current.time = next;
        setTime(next);
      }
      last = now;
      if (ended) {
        el?.pause();
        setPlaying(false);
        frame.current = 0;
      } else {
        frame.current = requestAnimationFrame(tick);
      }
    };
    frame.current = requestAnimationFrame(tick);
  }, [stopLoop, video, jump]);

  const play = useCallback(() => {
    const { time: current, length: total, hasVideo: withVideo } = latest.current;
    const from = current >= total ? 0 : current;
    if (from !== current) setTime(from);
    jump(from);
    const el = video.current;
    if (withVideo && el) void el.play().catch(() => undefined);
    setPlaying(true);
    run();
  }, [jump, run, video]);

  const seek = useCallback(
    (to: number) => {
      const target = Math.min(Math.max(to, 0), latest.current.length);
      latest.current.time = target;
      setTime(target);
      jump(target);
    },
    [jump],
  );

  const step = useCallback(
    (frames: number) => {
      pause();
      seek(stepTime(latest.current.time, frames, latest.current.length));
    },
    [pause, seek],
  );

  const toggle = useCallback(() => (frame.current === 0 ? play() : pause()), [play, pause]);

  // The video reaching its real end between two frames of the loop is handled by the loop (`el.ended`); a reel that is
  // replaced under the player stops it.
  useEffect(() => stopLoop, [stopLoop]);

  return { time, playing, play, pause, toggle, seek, step };
}
