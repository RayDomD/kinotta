import type { Section, Shot } from './types.ts';

/** Id of the one section a reel gets when shots.json names none. */
export const IMPLICIT_SECTION_ID = 'reel';

type DeclaredSection = Omit<Section, 'shots' | 'implicit'>;

function isSection(raw: unknown): raw is DeclaredSection {
  const s = raw as Partial<Section> | null;
  return typeof s?.id === 'string' && typeof s.name === 'string' && Number.isFinite(s.start) && Number.isFinite(s.end);
}

/** The section a shot belongs to: the one it names, else the one whose span holds its start (the last one past the end). */
function resolveSection(shot: Shot, sections: DeclaredSection[]): string {
  if (shot.section !== undefined && sections.some((s) => s.id === shot.section)) return shot.section;
  const byTime = [...sections].reverse().find((s) => shot.start >= s.start);
  return (byTime ?? sections[0]!).id;
}

/**
 * Sections as the rest of the app sees them (F2). A reel whose shots.json names none gets one implicit section
 * spanning the reel, so callers never branch on "no sections". On a reel with sections every shot carries its
 * section id, and each section its shot count.
 */
export function readSections(raw: unknown, shots: Shot[], duration: number, title: string): { sections: Section[]; shots: Shot[] } {
  const declared = Array.isArray(raw) ? raw.filter(isSection) : [];
  if (declared.length === 0) {
    return { sections: [{ id: IMPLICIT_SECTION_ID, name: title, start: 0, end: duration, shots: shots.length, implicit: true }], shots };
  }
  const resolved = shots.map((shot) => ({ ...shot, section: resolveSection(shot, declared) }));
  const sections = declared.map((s) => ({
    id: s.id,
    name: s.name,
    start: s.start,
    end: s.end,
    shots: resolved.filter((shot) => shot.section === s.id).length,
  }));
  return { sections, shots: resolved };
}
