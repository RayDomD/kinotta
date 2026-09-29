import type { Shot } from './api/index.ts';

const KIND_LABEL = { cutaway: 'Cutaway', panel: 'Panel' } as const;

/** The type tag after a footage shot's title. Nothing for a shot without a type (code-only reels). */
export function ShotKind({ type }: { type: Shot['type'] }) {
  return type ? <span className="kind">{KIND_LABEL[type]}</span> : null;
}

/** The spoken line a footage shot covers, in quotes. Nothing when there is no transcript line. */
export function ShotLine({ text }: { text: string | undefined }) {
  return text ? <div className="line">{`\u201C${text}\u201D`}</div> : null;
}
