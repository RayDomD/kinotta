import { applyOperations, mediaEditingPlan } from '../../../../server/core/model.ts';
import type { Sources } from '../../../../server/core/model.ts';
import type { Version } from '../../api/index.ts';
import type { EditsState } from './useEdits.ts';

export function workingMedia(version: Version, list: EditsState['list'], legacySources?: Sources) {
  const operations = version.isNewest ? list?.operations.filter((op) => !list.flagged?.[op.id]) ?? [] : [];
  const sources = applyOperations(legacySources ?? { plan: { media: version.media!, parts: version.parts, codeTiming: !!version.code, duration: version.duration, clips: version.clips, captions: version.captions, sections: version.mediaSections ?? version.sections }, words: version.transcript ?? [] }, operations);
  return legacySources ? mediaEditingPlan(sources) : sources.plan;
}
