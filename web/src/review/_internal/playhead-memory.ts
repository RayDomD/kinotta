const playheads = new Map<string, number>();

export const editPlayhead = (reel: string): number => playheads.get(reel) ?? 0;

export function rememberEditPlayhead(reel: string, time: number): void {
  if (Number.isFinite(time)) playheads.set(reel, Math.max(0, time));
}
