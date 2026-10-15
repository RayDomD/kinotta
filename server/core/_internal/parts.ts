import type { ContractIssue, PartsAlternate, PartsManifest, Shot } from './types.ts';
import { KinottaError } from './errors.ts';

const ALTERNATE_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const NAME = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/i;
const REVISION = /^r[1-9]\d*$/;
export const DURATION_TOLERANCE = 1e-6;
const RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const revision = (value: unknown): value is string => typeof value === 'string' && REVISION.test(value);

/** Contract 2 keeps positions separate from identities. Broken manifests still provide readable issues. */
export function checkPartsManifest(file: Record<string, unknown>): { manifest: PartsManifest | null; shots: Shot[]; issues: ContractIssue[] } {
  const issues: ContractIssue[] = [];
  if (file.alpha !== undefined && typeof file.alpha !== 'boolean') issues.push({ code: 'parts-alpha', message: 'shots.json: alpha must be boolean' });
  if (!positive(file.duration)) issues.push({ code: 'parts-duration', message: 'shots.json: parts duration must be a positive finite number' });
  if (!revision(file.shared)) issues.push({ code: 'parts-shared', message: 'shots.json: shared must name a revision such as r1' });
  if (!Array.isArray(file.shots) || file.shots.length === 0) return { manifest: null, shots: [], issues: [...issues, { code: 'no-shot-list', message: 'shots.json: parts needs a non-empty shot list' }] };
  const names = new Set<string>();
  const shots: Shot[] = [];
  let start = 0;
  for (const [index, value] of file.shots.entries()) {
    const raw = record(value);
    const number = String(index + 1).padStart(2, '0');
    const name = typeof raw.name === 'string' ? raw.name : '';
    const at = { shot: number, scene: name };
    if (!NAME.test(name) || RESERVED_NAME.test(name)) issues.push({ ...at, code: 'parts-name', message: `shot ${number}: name must be a fixed folder name made of letters, numbers, hyphens or underscores` });
    if (names.has(name.toLowerCase())) issues.push({ ...at, code: 'duplicate-shot', message: `shot ${number}: name "${name}" is used twice` });
    names.add(name.toLowerCase());
    if (!revision(raw.revision)) issues.push({ ...at, code: 'parts-revision', message: `shot ${number}: revision must name a folder such as r1` });
    if (!positive(raw.duration)) issues.push({ ...at, code: 'parts-duration', message: `shot ${number}: duration must be a positive finite number` });
    if (raw.start !== undefined) issues.push({ ...at, code: 'parts-start', message: `shot ${number}: remove start; parts starts are computed from play order` });
    if (typeof raw.title !== 'string' || !raw.title.trim()) issues.push({ ...at, code: 'shot-field', message: `shot ${number}: title is missing` });
    if (typeof raw.description !== 'string') issues.push({ ...at, code: 'shot-field', message: `shot ${number}: description must be text` });
    let alternates: PartsAlternate[] | undefined;
    if (raw.alternates !== undefined) {
      const issue = (message: string) => issues.push({ ...at, code: 'parts-alternates', message: `shot ${number}: ${message}` });
      if (!Array.isArray(raw.alternates) || raw.alternates.length < 2 || raw.alternates.length > 4) issue('alternates must contain two to four entries');
      else {
        const labels = new Set<string>();
        const revisions = new Set<string>();
        alternates = [];
        for (const value of raw.alternates) {
          const alternate = record(value);
          if (!revision(alternate.revision) || !positive(alternate.duration) || typeof alternate.label !== 'string' || !alternate.label.trim() || typeof alternate.title !== 'string' || !alternate.title.trim() || typeof alternate.note !== 'string') {
            issue('each alternate needs a revision, label, title, note and positive duration');
            continue;
          }
          if (labels.has(alternate.label.trim().toLowerCase())) issue(`alternate label "${alternate.label}" is repeated`);
          if (revisions.has(alternate.revision)) issue(`alternate revision ${alternate.revision} is repeated`);
          labels.add(alternate.label.trim().toLowerCase());
          revisions.add(alternate.revision);
          const dismissed = alternate.dismissed === undefined ? undefined : record(alternate.dismissed);
          if (dismissed && (typeof dismissed.reason !== 'string' || alternate.revision === raw.revision)) issue('the alternate in the reel cannot be dismissed, and a dismissal needs a text reason');
          alternates.push({ revision: alternate.revision, label: alternate.label, title: alternate.title, note: alternate.note, duration: alternate.duration, ...(dismissed && typeof dismissed.reason === 'string' ? { dismissed: { reason: dismissed.reason } } : {}) });
        }
        const chosen = alternates.find((alternate) => alternate.revision === raw.revision);
        if (!chosen) issue('the shot revision must be among its alternates');
        else if (chosen.duration !== raw.duration) issue('the shot duration must match its alternate in the reel');
      }
    }
    if (raw.choiceMade !== undefined && typeof raw.choiceMade !== 'boolean') issues.push({ ...at, code: 'parts-alternates', message: `shot ${number}: choiceMade must be boolean` });
    const duration = positive(raw.duration) ? raw.duration : 0;
    shots.push({ number, name, scene: name, revision: typeof raw.revision === 'string' ? raw.revision : '', start,
      duration, title: typeof raw.title === 'string' && raw.title.trim() ? raw.title : 'Untitled shot', description: typeof raw.description === 'string' ? raw.description : '',
      ...(alternates ? { alternates: alternates.map((alternate) => ({ ...alternate, inReel: alternate.revision === raw.revision })) } : {}),
      ...(typeof raw.choiceMade === 'boolean' ? { choiceMade: raw.choiceMade } : {}),
      ...(typeof raw.section === 'string' ? { section: raw.section } : {}) });
    start += duration;
  }
  if (positive(file.duration) && Math.abs(file.duration - start) > DURATION_TOLERANCE) issues.push({ code: 'parts-duration', message: `shots.json: duration ${file.duration}s does not match the shots' total ${start}s` });
  return { manifest: issues.length ? null : file as unknown as PartsManifest, shots, issues };
}

/** Compare authored revision identities, independently of Working's choices. */
export function carryPartsAlternates(manifest: PartsManifest, previous: PartsManifest | undefined, authored?: PartsManifest): PartsManifest {
  if (!previous) return manifest;
  const shots = manifest.shots.map((shot) => {
    const old = previous.shots.find((previous) => previous.name === shot.name);
    if (!old) return shot;
    const before = authored?.shots.find((previous) => previous.name === shot.name);
    const unchanged = before && shot.revision === before.revision && (shot.alternates === undefined || JSON.stringify(shot.alternates.map((alternate) => alternate.revision)) === JSON.stringify(before.alternates?.map((alternate) => alternate.revision)));
    const dismissed = { ...old.dismissedRevisions, ...Object.fromEntries((old.alternates ?? []).filter((alternate) => alternate.dismissed).map((alternate) => [alternate.revision, alternate.dismissed!])) };
    const answer = unchanged ? { ...shot, revision: old.revision, duration: old.duration, title: old.title, choiceMade: old.choiceMade, alternates: old.alternates } : shot;
    const alternates = (answer.alternates ?? old.alternates ?? []).filter((alternate) => !dismissed[alternate.revision]);
    if (dismissed[answer.revision]) throw new KinottaError('invalid', 'The agent selected a dismissed alternate. Build a new revision for this shot.');
    if (alternates.length && !alternates.some((alternate) => alternate.revision === answer.revision)) {
      const labels = new Set(alternates.map((alternate) => alternate.label.toLowerCase()));
      const label = [...ALTERNATE_LABELS].find((label) => !labels.has(label.toLowerCase()))!;
      alternates.unshift({ revision: answer.revision, label, title: answer.title, note: answer.description, duration: answer.duration });
    }
    const { alternates: _offered, ...content } = answer;
    return { ...content, ...(alternates.length >= 2 ? { alternates } : {}), ...(Object.keys(dismissed).length ? { dismissedRevisions: dismissed } : {}) };
  });
  const next = { ...manifest, duration: shots.reduce((total, shot) => total + shot.duration, 0), shots };
  const checked = checkPartsManifest(next as unknown as Record<string, unknown>);
  if (!checked.manifest) throw new KinottaError('invalid', checked.issues.map((issue) => `${issue.message} [${issue.code}]`).join('\n'));
  return next;
}
