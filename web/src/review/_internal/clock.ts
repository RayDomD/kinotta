const SECONDS_PER_MINUTE = 60;
const HUNDREDTHS = 100;

const pad = (n: number): string => String(n).padStart(2, '0');

/** The transport's timecode, `mm:ss.ff` (hundredths): `00:38.90`. */
export function formatTransport(seconds: number): string {
  const hundredths = Math.round(Math.max(0, seconds) * HUNDREDTHS);
  const whole = Math.floor(hundredths / HUNDREDTHS);
  return `${pad(Math.floor(whole / SECONDS_PER_MINUTE))}:${pad(whole % SECONDS_PER_MINUTE)}.${pad(hundredths % HUNDREDTHS)}`;
}
