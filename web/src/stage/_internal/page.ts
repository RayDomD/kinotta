/** Pages are authored for, and rendered at, a fixed 1920x1080 viewport (ADR 0001). */
export const PAGE_WIDTH = 1920;
export const PAGE_HEIGHT = 1080;

/** A frame that has not drawn after two animation frames within this long is treated as drawn anyway. */
const DRAW_WAIT_MS = 500;
const DRAW_FRAMES = 2;

/** Why a page could not be seeked, in a form the UI can turn into a plain-word issue. */
export type SeekProblem = { kind: 'no-seek' } | { kind: 'seek-threw'; time: number; detail: string };

/** A seek that failed. `message` is the reason shown on the placeholder; `problem` is what the issue list reports. */
export class SeekError extends Error {
  constructor(
    message: string,
    readonly problem: SeekProblem,
  ) {
    super(message);
  }
}

type PageWindow = Window & { seek?: (seconds: number) => unknown };

/** motion-broll's engine only stops its preview loop when the page is loaded with `?render`. */
export function renderUrl(pageUrl: string): string {
  return `${pageUrl}${pageUrl.includes('?') ? '&' : '?'}render`;
}

function afterDraw(win: Window): Promise<void> {
  const frames = new Promise<void>((done) => {
    let left = DRAW_FRAMES;
    const tick = () => (--left === 0 ? done() : win.requestAnimationFrame(tick));
    win.requestAnimationFrame(tick);
  });
  const fallback = new Promise<void>((done) => setTimeout(done, DRAW_WAIT_MS));
  return Promise.race([frames, fallback]);
}

/**
 * Jumps a loaded version page to `seconds` with its global `seek`, then waits for the frame to draw.
 * Rejects with a readable reason when the page has no `seek` or it throws.
 */
export async function seekPage(win: Window | null, seconds: number): Promise<void> {
  const page = win as PageWindow | null;
  if (!page || typeof page.seek !== 'function') {
    throw new SeekError('The page has no global seek(seconds) function.', { kind: 'no-seek' });
  }
  try {
    await Promise.resolve(page.seek(seconds));
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new SeekError(`seek(${seconds}) threw: ${detail}`, { kind: 'seek-threw', time: seconds, detail });
  }
  await afterDraw(page);
}
