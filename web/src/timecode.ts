const SECONDS_PER_MINUTE = 60;
/** Below this many seconds a timecode is plain `ss.ff`, as in the mockup ("03.60"). */
const PLAIN_LIMIT = 100;

const pad = (n: number): string => String(n).padStart(2, '0');

/** Timecode shown on shots: `03.60`, or `mm:ss.ff` once a reel runs past 99s. */
export function formatTimecode(seconds: number): string {
  const hundredths = Math.round(Math.max(0, seconds) * 100);
  const whole = Math.floor(hundredths / 100);
  const fraction = pad(hundredths % 100);
  if (whole < PLAIN_LIMIT) return `${pad(whole)}.${fraction}`;
  return `${pad(Math.floor(whole / SECONDS_PER_MINUTE))}:${pad(whole % SECONDS_PER_MINUTE)}.${fraction}`;
}

/** A whole-second clock, `mm:ss`: section spans and the time axis of a reel past 99s. */
export function formatClock(seconds: number): string {
  const whole = Math.round(Math.max(0, seconds));
  return `${pad(Math.floor(whole / SECONDS_PER_MINUTE))}:${pad(whole % SECONDS_PER_MINUTE)}`;
}

/** A time axis label: the shot timecode on a short reel, `mm:ss` once the reel passes 99s. */
export function formatAxisTime(seconds: number, reelDuration: number): string {
  return reelDuration >= PLAIN_LIMIT ? formatClock(seconds) : formatTimecode(seconds);
}

/** Reel length next to the reel name: `15.0s`. */
export function formatDuration(seconds: number): string {
  return `${seconds.toFixed(1)}s`;
}

/** `8 s`, `2 min`: how long is left, as an estimate reads. */
export function formatRemaining(seconds: number): string {
  return seconds < SECONDS_PER_MINUTE ? `${Math.max(1, Math.round(seconds))} s` : `${Math.round(seconds / SECONDS_PER_MINUTE)} min`;
}
