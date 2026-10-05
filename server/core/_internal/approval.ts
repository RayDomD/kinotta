import { readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { writeJsonAtomic, withReelLock } from './edit-list.ts';
import { KinottaError } from './errors.ts';
import type { Approval, Withdrawal } from './types.ts';
import { APPROVAL_FILE, readVersion, requireReelDir } from './version.ts';

/** Only the owner approves for now (R4); `approvedBy` can later name an agent without changing the format. */
const APPROVED_BY_YOU = 'you';

async function requireVersionDir(projectDir: string, slug: string, number: number): Promise<{ reelDir: string; versionDir: string }> {
  const reelDir = await requireReelDir(projectDir, slug);
  const versionDir = join(reelDir, `v${number}`);
  const found = Number.isInteger(number) && number >= 1 && (await stat(versionDir).then((s) => s.isDirectory(), () => false));
  if (!found) throw new KinottaError('not-found', `Version ${number} of reel "${slug}" not found.`);
  return { reelDir, versionDir };
}

/** The approval time of a version, or null when it is not approved. A file that can't be read still counts as an approval. */
async function readApprovedAt(versionDir: string): Promise<string | null> {
  let text: string;
  try {
    text = await readFile(join(versionDir, APPROVAL_FILE), 'utf8');
  } catch {
    return null;
  }
  try {
    const at = (JSON.parse(text) as { at?: unknown }).at;
    return typeof at === 'string' ? at : '';
  } catch {
    return '';
  }
}

/**
 * Marks a version final by writing its `approval.json`; nothing else in the version changes. Approving again keeps the first
 * time. A version with contract issues is approved all the same, with a warning naming them (R10).
 */
export async function approveVersion(projectDir: string, slug: string, number: number): Promise<Approval> {
  const { reelDir, versionDir } = await requireVersionDir(projectDir, slug, number);
  const { issues } = await readVersion(projectDir, slug, number);
  const at = await withReelLock(reelDir, async () => {
    const existing = await readApprovedAt(versionDir);
    if (existing !== null) return existing;
    const now = new Date().toISOString();
    await writeJsonAtomic(join(versionDir, APPROVAL_FILE), { approvedBy: APPROVED_BY_YOU, at: now });
    return now;
  });
  if (issues.length === 0) return { approved: true, at };
  const count = `${issues.length} contract ${issues.length === 1 ? 'issue' : 'issues'}`;
  return { approved: true, at, warning: `v${number} is approved but has ${count}, so it can't be rendered for delivery yet: ${issues.map((i) => i.message).join('; ')}.` };
}

/** Takes a version's approval back. Renders already made stay. */
export async function withdrawApproval(projectDir: string, slug: string, number: number): Promise<Withdrawal> {
  const { reelDir, versionDir } = await requireVersionDir(projectDir, slug, number);
  await withReelLock(reelDir, () => rm(join(versionDir, APPROVAL_FILE), { force: true }));
  return { approved: false };
}
