import { parse } from 'node-html-parser';
import type { Section, Shot, Version } from './types.ts';

interface Scene {
  start: number;
  end: number;
  html: string;
}

/** The `data-scene` elements of a version page, each with the span it plays over and its serialized markup. */
function scenesOf(html: string): Scene[] {
  return parse(html)
    .querySelectorAll('[data-scene]')
    .map((el) => {
      const start = Number(el.getAttribute('data-start'));
      const duration = Number(el.getAttribute('data-duration'));
      return { start: Number.isFinite(start) ? start : 0, end: (Number.isFinite(start) ? start : 0) + (Number.isFinite(duration) ? duration : 0), html: el.outerHTML };
    });
}

/** The markup of every scene that plays inside the section's span. */
function markupOver(scenes: Scene[], section: Section): string {
  return scenes
    .filter((scene) => scene.start < section.end && scene.end > section.start)
    .map((scene) => scene.html)
    .join('\n');
}

function shotFields({ start, title, description, type, line }: Shot): unknown {
  return { start, title, description, type, line };
}

/** Everything about a section that a reviewer could see change: its own fields, its shots' fields, the pages behind it. */
function fingerprint(version: Version, scenes: Scene[], section: Section): string {
  const shots = version.shots.filter((shot) => (shot.section ?? version.sections[0]!.id) === section.id);
  return JSON.stringify({
    name: section.name,
    start: section.start,
    end: section.end,
    shots: shots.map(shotFields),
    markup: markupOver(scenes, section),
  });
}

/**
 * The sections of `next` that differ from `previous`, judged by content (F4). A section is changed when its contents
 * differ, when it is new, or when `next` claims it changed. A claim of "unchanged" is never believed: it is only reported
 * in `claimMismatch` when the contents say otherwise (and the reverse, a claim of "changed" on identical contents).
 */
export function detectChanges(
  previous: { version: Version; html: string },
  next: { version: Version; html: string },
): { changed: string[]; claimMismatch: string[] } {
  const before = new Map(previous.version.sections.map((s) => [s.id, s]));
  const beforeScenes = scenesOf(previous.html);
  const afterScenes = scenesOf(next.html);
  const claimed = next.version.changedSections;

  const changed: string[] = [];
  const claimMismatch: string[] = [];
  for (const section of next.version.sections) {
    const old = before.get(section.id);
    const differs = old === undefined || fingerprint(previous.version, beforeScenes, old) !== fingerprint(next.version, afterScenes, section);
    const claim = claimed?.includes(section.id) ?? false;
    if (differs || claim) changed.push(section.id);
    // Only a version that makes a claim can be caught contradicting the contents.
    if (claimed !== undefined && differs !== claim) claimMismatch.push(section.id);
  }
  return { changed, claimMismatch };
}
