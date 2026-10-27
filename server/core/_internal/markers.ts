import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { KinottaError } from './errors.ts';
import { requireReelDir } from './version.ts';
import { serialized, writeFileAtomic } from './state.ts';

export interface TimelineMarker { id: string; time: number; name: string }
const markersFile = (dir: string, slug: string): string => join(dir, 'reels', '.kinotta', slug, 'markers.json');
async function fileFor(dir: string, slug: string) {
  await requireReelDir(dir, slug);
  return markersFile(dir, slug);
}
/**
 * Runs a change to a reel's markers in the order it was called. The queue slot is taken before anything is awaited: checking
 * the reel first let two simultaneous calls reach the queue in either order, so the markers could be stored out of call order.
 */
function changing<T>(dir: string, slug: string, change: (file: string) => Promise<T>): Promise<T> {
  const file = markersFile(dir, slug);
  return serialized(file, async () => { await requireReelDir(dir, slug); return change(file); });
}
function valid(input: unknown): { time: number; name: string } {
  const value = input as Partial<TimelineMarker> | null;
  if (!value || typeof value !== 'object' || typeof value.time !== 'number' || !Number.isFinite(value.time) || value.time < 0 || typeof value.name !== 'string' || value.name.length > 200) throw new KinottaError('invalid', 'A marker needs a nonnegative time and a name of at most 200 characters.');
  return { time: value.time, name: value.name.trim() };
}
async function read(file: string): Promise<TimelineMarker[]> {
  const text = await readFile(file, 'utf8').catch((err: NodeJS.ErrnoException) => { if (err.code === 'ENOENT') return '[]'; throw err; });
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item?.id !== 'string')) throw new Error();
    return parsed.map((item) => ({ id: item.id, ...valid(item) }));
  } catch { throw new KinottaError('invalid', 'The saved markers could not be read.'); }
}
export async function listMarkers(dir: string, slug: string): Promise<TimelineMarker[]> { return read(await fileFor(dir, slug)); }
export async function addMarker(dir: string, slug: string, input: unknown): Promise<TimelineMarker> {
  const marker = { id: randomUUID(), ...valid(input) };
  return changing(dir, slug, async (file) => { const markers = await read(file); markers.push(marker); await writeFileAtomic(file, JSON.stringify(markers)); return marker; });
}
export async function changeMarker(dir: string, slug: string, id: string, changes: unknown): Promise<TimelineMarker> {
  return changing(dir, slug, async (file) => {
    const markers = await read(file); const index = markers.findIndex((marker) => marker.id === id);
    if (index < 0) throw new KinottaError('not-found', 'This marker no longer exists.');
    if (!changes || typeof changes !== 'object' || Array.isArray(changes) || Object.keys(changes).some((key) => !['name', 'time'].includes(key))) throw new KinottaError('invalid', 'Change only a marker’s name or time.');
    markers[index] = { id, ...valid({ ...markers[index], ...changes }) };
    await writeFileAtomic(file, JSON.stringify(markers)); return markers[index]!;
  });
}
export async function removeMarker(dir: string, slug: string, id: string): Promise<void> {
  return changing(dir, slug, async (file) => { const markers = await read(file); await writeFileAtomic(file, JSON.stringify(markers.filter((marker) => marker.id !== id))); });
}
