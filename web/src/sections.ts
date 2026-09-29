import type { Comment, Section, Shot } from './api/index.ts';
import { formatClock } from './timecode.ts';

/** A reel with one section (declared or implicit) shows no section list, bands or section heading. */
export function hasSections(sections: Section[]): boolean {
  return sections.length > 1;
}

/** The two-digit, 1-based number of the section at `index`. */
export function sectionNumber(index: number): string {
  return String(index + 1).padStart(2, '0');
}

/** `00:06–00:12`. */
export function sectionSpan(section: Section): string {
  return `${formatClock(section.start)}–${formatClock(section.end)}`;
}

export function shotCount(count: number): string {
  return `${count} ${count === 1 ? 'shot' : 'shots'}`;
}

/** Pins per section, counted in one place: a pin belongs to the section of its shot. */
export function pinCounts(comments: Comment[], shots: Shot[]): Map<string, number> {
  const sectionOfShot = new Map(shots.map((shot) => [shot.number, shot.section]));
  const counts = new Map<string, number>();
  for (const comment of comments) {
    const id = sectionOfShot.get(comment.pin.shot) ?? comment.pin.section;
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}
