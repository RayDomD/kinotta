import { readFileSync, unlinkSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * The port file (R12): a running server names itself here so `kinotta render` can join its queue. It sits at the project
 * root rather than in `reels/`, which a project may not have yet.
 */
export const PORT_FILE = '.kinotta-server.json';

export interface PortFile {
  port: number;
  pid: number;
}

const portFilePath = (projectDir: string): string => join(projectDir, PORT_FILE);

export async function writePortFile(projectDir: string, entry: PortFile): Promise<void> {
  await writeFile(portFilePath(projectDir), JSON.stringify(entry));
}

/** The port file's entry, or null when there is none or it can't be read. */
export async function readPortFile(projectDir: string): Promise<PortFile | null> {
  try {
    const { port, pid } = JSON.parse(await readFile(portFilePath(projectDir), 'utf8')) as Partial<PortFile>;
    return Number.isInteger(port) && Number.isInteger(pid) ? { port: port!, pid: pid! } : null;
  } catch {
    return null;
  }
}

/**
 * Removes the port file while it still names this entry; a server started later may have replaced it. Synchronous, so it
 * can run as the process exits.
 */
export function removePortFile(projectDir: string, entry: PortFile): void {
  try {
    const current = JSON.parse(readFileSync(portFilePath(projectDir), 'utf8')) as Partial<PortFile>;
    if (current.port === entry.port && current.pid === entry.pid) unlinkSync(portFilePath(projectDir));
  } catch {
    // Already gone or unreadable: nothing of ours to remove.
  }
}
