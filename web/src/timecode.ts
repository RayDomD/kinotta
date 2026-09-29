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

/** Reel length next to the reel name: `15.0s`. */
export function formatDuration(seconds: number): string {
  return `${seconds.toFixed(1)}s`;
}
