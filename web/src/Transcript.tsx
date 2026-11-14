import { useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import type { Comment, Shot, TranscriptWord, WordPin } from './api/index.ts';
import { formatTimecode } from './timecode.ts';

const KIND_LABEL = { cutaway: 'Cutaway', panel: 'Panel' } as const;
/** Muted words shown from the neighbouring shots, so a line reads on from the one before it. */
const CONTEXT_WORDS = 3;
/** A word pin is 20px wide; a second pin on the same word sits this far right of the last. */
const WORD_PIN_STEP = 22;
/** Transcript times are stored to the hundredth; two times this close are the same word. */
const SAME_WORD_TOLERANCE = 0.01;

/** The type tag after a footage shot's title. Nothing for a shot without a type (code-only reels). */
export function ShotKind({ type }: { type: Shot['type'] }) {
  return type ? <span className="kind">{KIND_LABEL[type]}</span> : null;
}

/** The spoken line a footage shot covers, in quotes. Nothing when there is no transcript line. */
export function ShotLine({ text }: { text: string | undefined }) {
  return text ? <div className="line">{`“${text}”`}</div> : null;
}

export type WordComment = Comment & { pin: WordPin };

export const isWordComment = (comment: Comment): comment is WordComment => comment.pin.kind === 'word';

/** The way a word pin is named in the tag, the panel and the batch: `word “lose”`. */
export const wordLabel = (word: string): string => `word “${word}”`;

const isSameWord = (word: TranscriptWord, pin: WordPin): boolean => pin.word === word.text && Math.abs(pin.time - word.start) <= SAME_WORD_TOLERANCE;

function HexGlyph({ marked }: { marked: boolean }) {
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true">
      {marked && <path className="ring" d="M14 3l9.5 5.5v11L14 25 4.5 19.5v-11z" transform="translate(14 14) scale(1.55) translate(-14 -14)" fill="none" stroke="var(--ink)" strokeWidth="1.4" strokeLinejoin="round" />}
      <path d="M14 3l9.5 5.5v11L14 25 4.5 19.5v-11z" fill="var(--light)" stroke="var(--ground)" strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  );
}

function ContextWords({ words, before }: { words: TranscriptWord[] | undefined; before: boolean }) {
  if (!words || words.length === 0) return null;
  const text = words.map((w) => w.text).join(' ');
  return <span className="w ctx">{before ? `…${text}` : `${text}…`}</span>;
}

export interface WordRowProps {
  shots: Shot[];
  /** Index into `shots` of the enlarged shot. */
  index: number;
  /** Every shot of the reel, for the context words either side (the sheet may step through one section only). */
  reelShots?: Shot[];
  /** The shot's word pins, numbered as the panel numbers them. */
  pins: WordComment[];
  /** The comment whose pin is highlighted, if any. */
  markedId: string | null;
  /** Words are then shown but cannot be pinned. */
  readOnly: boolean;
  /** The word whose comment is being written, if any. */
  draftWord: TranscriptWord | null;
  onPick(word: TranscriptWord): void;
}

/**
 * The shot's spoken line as a row of words under the frame: the shot's own words can be pinned, the muted words around
 * them are context. One tab stop; Left and Right move between words, Enter or Space pins the focused one.
 */
export function WordRow({ shots, index, reelShots = shots, pins, markedId, readOnly, draftWord, onPick }: WordRowProps) {
  const shot = shots[index]!;
  const words = shot.words ?? [];
  const [focused, setFocused] = useState(0);
  if (words.length === 0) return null;
  const last = words[words.length - 1]!;
  const inReel = reelShots.indexOf(shot);
  const previous = reelShots[inReel - 1]?.words;
  const next = reelShots[inReel + 1]?.words;

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const at = focused;
    const target =
      e.key === 'ArrowRight' ? Math.min(words.length - 1, at + 1) : e.key === 'ArrowLeft' ? Math.max(0, at - 1) : e.key === 'Home' ? 0 : e.key === 'End' ? words.length - 1 : null;
    if (target === null) return;
    e.preventDefault();
    setFocused(target);
    e.currentTarget.querySelector<HTMLElement>(`[data-word="${target}"]`)?.focus();
  }

  return (
    <div className="tr-a" data-word-row>
      <span className="who">{`Spoken · ${formatTimecode(words[0]!.start)}–${formatTimecode(last.end)}`}</span>
      <ContextWords words={previous?.slice(-CONTEXT_WORDS)} before />{' '}
      <span role={readOnly ? undefined : 'group'} aria-label={readOnly ? undefined : `Spoken words of shot ${shot.number}`} onKeyDown={readOnly ? undefined : onKeyDown} className="words">
        {words.map((word, i) => {
          const pinned = pins.filter((p) => isSameWord(word, p.pin));
          const pinNumbers = pinned.map((p) => p.number).join(', ');
          const label = `Word “${word.text}”, ${formatTimecode(word.start)}${pinned.length > 0 ? `, comment ${pinNumbers}` : ''}`;
          const pinMarks = pinned.map((p, k) => {
            const style: CSSProperties | undefined = k > 0 ? { left: `calc(50% + ${k * WORD_PIN_STEP}px)` } : undefined;
            return (
              <span key={p.id} className={p.id === markedId ? 'wpin marked' : 'wpin'} style={style} aria-hidden="true">
                <HexGlyph marked={p.id === markedId} />
                <b>{p.number}</b>
              </span>
            );
          });
          const hot = draftWord !== null && draftWord.start === word.start;
          return (
            <span key={word.start}>
              {i > 0 && ' '}
              {readOnly ? (
                <span className="w" data-start={word.start}>
                  {pinMarks}
                  {word.text}
                </span>
              ) : (
                <button
                  type="button"
                  className={hot ? 'w pick hot' : 'w pick'}
                  data-word={i}
                  data-start={word.start}
                  tabIndex={i === focused ? 0 : -1}
                  aria-label={label}
                  onFocus={() => setFocused(i)}
                  onClick={() => onPick(word)}
                >
                  {pinMarks}
                  {word.text}
                  <span className="wtag" aria-hidden="true">{`${wordLabel(word.text)} · ${formatTimecode(word.start)}`}</span>
                </button>
              )}
            </span>
          );
        })}
      </span>{' '}
      <ContextWords words={next?.slice(0, CONTEXT_WORDS)} before={false} />
    </div>
  );
}
