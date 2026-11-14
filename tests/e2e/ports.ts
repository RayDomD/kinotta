// Fixture server ports and the temp files their specs read the project path from.
// KINOTTA_E2E_PORT_BASE shifts every port (and file name) so two checkouts can run the suite side by side.
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_BASE = 4399;
const BASE = Number(process.env.KINOTTA_E2E_PORT_BASE ?? DEFAULT_BASE);

/** Each server's distance below the base port; the defaults are the original fixed ports 4399 to 4379. */
const OFFSETS = {
  shared: 0, pins: 1, batch: 2, footage: 3, versions: 4, editing: 5, contract: 6, sectionBatches: 7, engine: 8,
  broll: 9, newReel: 10, dropVideo: 11, briefReel: 12, review: 13, snipSave: 14, clips: 15, codeOnly: 16,
  handoff: 17, transcription: 18, picker: 19, renders: 20, staleEdit: 21,
} as const;

export type ServerName = keyof typeof OFFSETS;

export const port = (name: ServerName) => BASE - OFFSETS[name];
export const serverUrl = (name: ServerName) => `http://localhost:${port(name)}`;

/** The default base keeps the original names, e.g. kinotta-e2e-batch-project.txt. */
export const projectFile = (topic: string) =>
  join(tmpdir(), `kinotta-e2e-${topic}-project${BASE === DEFAULT_BASE ? '' : `-${BASE}`}.txt`);
