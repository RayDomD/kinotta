// Links the Kinotta skill into the skills folders (K8): ~/.agents/skills/kinotta -> skill/kinotta, and
// ~/.claude/skills/kinotta -> ~/.agents/skills/kinotta, where Claude Code finds it. Junctions on Windows, so no admin
// rights are needed. An existing link to the same place is left alone; anything else at a link's path stops the script.
import { lstatSync, mkdirSync, readlinkSync, symlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const SKILL_DIR = resolve(import.meta.dirname, '../skill/kinotta');
const AGENTS_LINK = join(homedir(), '.agents', 'skills', 'kinotta');
const CLAUDE_LINK = join(homedir(), '.claude', 'skills', 'kinotta');

/** The path a link points at, or null when nothing is there. Throws when something other than a link is there. */
function existingTarget(path) {
  let stat;
  try {
    stat = lstatSync(path);
  } catch {
    return null;
  }
  if (!stat.isSymbolicLink()) throw new Error(`${path} already exists and is not a link. Move it away and run this again.`);
  return resolve(readlinkSync(path));
}

function link(path, target) {
  const current = existingTarget(path);
  if (current === resolve(target)) {
    console.log(`Already linked: ${path} -> ${target}`);
    return;
  }
  if (current !== null) throw new Error(`${path} already links to ${current}. Remove the link and run this again.`);
  mkdirSync(dirname(path), { recursive: true });
  symlinkSync(target, path, 'junction');
  console.log(`Linked: ${path} -> ${target}`);
}

try {
  link(AGENTS_LINK, SKILL_DIR);
  link(CLAUDE_LINK, AGENTS_LINK);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
