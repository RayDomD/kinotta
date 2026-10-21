import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from 'react';
import type { MediaCaptionPhrase, mediaWords } from '../../../../server/core/model.ts';
import type { TimeWindow } from './timeline.ts';
import { TIMELINE_ROW_HEIGHT, stackRows } from './timeline.ts';

export const MIN_WORD_DURATION = 0.02;
export const MIN_OPEN_WORD_WIDTH = 64;
export const SNAP_GRID_STEP = 0.25;
export const SNAP_CUT_THRESHOLD = 0.15;

export type Word = ReturnType<typeof mediaWords>[number];

export interface CaptionLaneProps {
  win: TimeWindow;
  words: readonly Word[];
  phrases: readonly MediaCaptionPhrase[];
  editable: boolean;
  canPin?: boolean;
  nudge?: number;
  snap?: boolean;
  snapPoints?: readonly number[];
  isWordChanged?: (word: Word) => boolean;
  onWord: (word: Word, text: string) => void;
  onRetime: (word: Word, start: number, end: number) => void;
  onPhrase: (index: number, text: string) => void;
  onPin?: (word: Word) => void;
  onOpenedChange?: (opened: number | null, visibleWordCount: number) => void;
  className?: string;
  header?: ReactNode;
}

export function CaptionLane({
  win,
  words,
  phrases,
  editable,
  canPin = false,
  nudge = 0.1,
  snap = false,
  snapPoints = [],
  isWordChanged,
  onWord,
  onRetime,
  onPhrase,
  onPin,
  onOpenedChange,
  className = '',
  header,
}: CaptionLaneProps) {
  const length = Math.max(0.001, win.length);
  const [editingWord, setEditingWord] = useState<string | null>(null);
  const [editingPhrase, setEditingPhrase] = useState<number | null>(null);
  const [opened, setOpened] = useState<number | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const openedRef = useRef<number | null>(null);
  const restoreFocus = useRef<number | null>(null);
  openedRef.current = opened;

  useEffect(() => {
    if (opened !== null) {
      root.current?.querySelector<HTMLButtonElement>(`[data-caption="${opened}"] [data-word] > button`)?.focus();
    } else if (restoreFocus.current !== null) {
      root.current?.querySelector<HTMLButtonElement>(`[data-caption="${restoreFocus.current}"] > button`)?.focus();
      restoreFocus.current = null;
    }
  }, [opened]);

  const openPhrase = opened === null ? undefined : phrases[opened];
  const [captionWidth, setCaptionWidth] = useState(0);

  useEffect(() => {
    const lane = root.current?.querySelector('.native-lane-bars');
    if (!lane) return;
    const measure = () => setCaptionWidth(lane.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(lane);
    return () => observer.disconnect();
  }, [phrases.length]);

  const captionRows = stackRows(phrases, (phrase) => ({
    start: phrase.start,
    end: phrase === openPhrase
      ? Math.max(phrase.end, captionWidth > 0 ? phrase.start + (phrase.words.length * MIN_OPEN_WORD_WIDTH + 2) / captionWidth * length : Infinity)
      : phrase.end,
  }));

  const visibleWords = openPhrase && editingPhrase === null
    ? words.filter((word) => openPhrase.words.some((item) => item.start === word.start && item.placement === word.placement))
    : [];

  useEffect(() => {
    onOpenedChange?.(opened, visibleWords.length);
  }, [opened, visibleWords.length, onOpenedChange]);

  useEffect(() => {
    const close = () => {
      setOpened(null);
      setEditingWord(null);
      setEditingPhrase(null);
    };
    const outside = (event: MouseEvent) => {
      if (!(event.target as Element).closest('[data-caption]')) close();
    };
    const key = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        restoreFocus.current = openedRef.current;
        close();
      }
    };
    document.addEventListener('click', outside, true);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('click', outside, true);
      document.removeEventListener('keydown', key);
    };
  }, []);

  const gesture = useRef<{
    x: number;
    width: number;
    length: number;
    edge: 'start' | 'end';
    word: Word;
  } | null>(null);

  const [snappedTime, setSnappedTime] = useState<number | null>(null);

  const place = (start: number, end: number, row = 0): CSSProperties => ({
    top: row * TIMELINE_ROW_HEIGHT + 5,
    bottom: 'auto',
    height: TIMELINE_ROW_HEIGHT - 10,
    left: `${(start - win.start) / length * 100}%`,
    width: `${Math.max(0.02, end - start) / length * 100}%`,
  });

  const getNeighbours = (word: Word) => {
    const placementWords = words
      .filter((w) => w.placement === word.placement && w.sourceStart !== undefined)
      .slice()
      .sort((a, b) => a.sourceStart! - b.sourceStart!);
    const idx = placementWords.findIndex((w) => w.sourceStart === word.sourceStart && w.start === word.start);
    const prevWord = idx > 0 ? placementWords[idx - 1] : undefined;
    const nextWord = idx >= 0 && idx < placementWords.length - 1 ? placementWords[idx + 1] : undefined;
    return { prevWord, nextWord };
  };

  const calculateTarget = (word: Word, edge: 'start' | 'end', rawDelta: number, isSnap: boolean) => {
    const start = word.sourceStart!;
    const finish = start + word.end - word.start;
    let delta = rawDelta;

    if (isSnap) {
      const rawReelTarget = (edge === 'start' ? word.start : word.end) + rawDelta;
      const cut = snapPoints.find((cutPoint) => Math.abs(rawReelTarget - cutPoint) <= SNAP_CUT_THRESHOLD);
      const snappedReel = cut !== undefined ? cut : Math.round(rawReelTarget / SNAP_GRID_STEP) * SNAP_GRID_STEP;
      delta = snappedReel - (edge === 'start' ? word.start : word.end);
    }

    const { prevWord, nextWord } = getNeighbours(word);
    const minStart = prevWord ? (prevWord.sourceStart! + prevWord.end - prevWord.start) : 0;
    const maxStart = finish - MIN_WORD_DURATION;
    const minEnd = start + MIN_WORD_DURATION;
    const maxEnd = nextWord ? nextWord.sourceStart! : Infinity;

    const finalStart = edge === 'start' ? Math.max(minStart, Math.min(maxStart, start + delta)) : start;
    const finalEnd = edge === 'end' ? Math.min(maxEnd, Math.max(minEnd, finish + delta)) : finish;

    return { finalStart, finalEnd, start, finish };
  };

  const begin = (event: PointerEvent<HTMLElement>, edge: 'start' | 'end', word: Word) => {
    if (!editable || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const caption = event.currentTarget.closest<HTMLElement>('[data-caption]');
    const laneBars = event.currentTarget.closest('.native-lane-bars');
    const width = caption && Number(caption.dataset.end) > Number(caption.dataset.start)
      ? (caption.getBoundingClientRect().width / (Number(caption.dataset.end) - Number(caption.dataset.start))) * length
      : (laneBars ? laneBars.getBoundingClientRect().width : 1);

    gesture.current = { x: event.clientX, width, length, edge, word };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const drag = gesture.current;
    if (!drag) return;
    const rawDelta = ((event.clientX - drag.x) / drag.width) * drag.length;
    if (snap) {
      const rawReelTarget = (drag.edge === 'start' ? drag.word.start : drag.word.end) + rawDelta;
      const cut = snapPoints.find((cutPoint) => Math.abs(rawReelTarget - cutPoint) <= SNAP_CUT_THRESHOLD);
      const targetTime = cut !== undefined ? cut : Math.round(rawReelTarget / SNAP_GRID_STEP) * SNAP_GRID_STEP;
      setSnappedTime(targetTime);
    } else {
      setSnappedTime(null);
    }
  };

  const end = (event: PointerEvent<HTMLElement>) => {
    const drag = gesture.current;
    if (!drag) return;
    gesture.current = null;
    setSnappedTime(null);
    const rawDelta = ((event.clientX - drag.x) / drag.width) * drag.length;
    const { finalStart, finalEnd, start, finish } = calculateTarget(drag.word, drag.edge, rawDelta, snap);

    if (Math.abs(finalStart - start) < 0.001 && Math.abs(finalEnd - finish) < 0.001) {
      return;
    }
    onRetime(drag.word, finalStart, finalEnd);
  };

  const onKeyRetime = (event: KeyboardEvent<HTMLElement>, edge: 'start' | 'end', word: Word) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const delta = ['ArrowLeft', 'ArrowDown'].includes(event.key) ? -nudge : nudge;
    const { finalStart, finalEnd, start, finish } = calculateTarget(word, edge, delta, false);

    if (Math.abs(finalStart - start) < 0.001 && Math.abs(finalEnd - finish) < 0.001) return;
    onRetime(word, finalStart, finalEnd);
  };

  if (phrases.length === 0) {
    return (
      <div ref={root} className={`native-lane ${className}`} data-row="captions">
        {header ?? <strong>Captions</strong>}
        <div className="native-lane-bars">
          <div className="sm-lane-empty" style={{ padding: '8px 12px', color: 'var(--muted)', fontSize: 12 }}>
            No captions
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={root}
      className={`native-lane ${className}`}
      data-row="captions"
      onPointerMove={onPointerMove}
      onPointerCancel={() => {
        gesture.current = null;
        setSnappedTime(null);
      }}
    >
      {header ?? <strong>Captions</strong>}
      <div className="native-lane-bars" style={{ minHeight: captionRows.count * TIMELINE_ROW_HEIGHT }}>
        {snappedTime !== null && (
          <span
            className="native-snap-line"
            aria-label={`Snap at ${snappedTime.toFixed(2)} seconds`}
            style={{ left: `${((snappedTime - win.start) / length) * 100}%` }}
          />
        )}
        {phrases.map((phrase, index) => (
          <div
            key={index}
            data-caption={index}
            data-start={phrase.start}
            data-end={phrase.end}
            className={`editorial-text-bar${opened === index ? ' editorial-caption-open' : ''}`}
            style={{
              ...place(phrase.start, phrase.end, captionRows.rows.get(phrase)),
              ...(opened === index ? { minWidth: `${phrase.words.length * MIN_OPEN_WORD_WIDTH + 2}px` } : {}),
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (editable) {
                setEditingWord(null);
                setEditingPhrase(index);
              }
            }}
          >
            {editingPhrase === index ? (
              <input
                aria-label={`Caption at ${phrase.start.toFixed(2)}`}
                defaultValue={phrase.words.map((word) => word.text).join(' ')}
                autoFocus
                onClick={(e) => e.stopPropagation()}
                onBlur={(event) => {
                  if (event.target.value !== phrase.words.map((word) => word.text).join(' ')) {
                    onPhrase(index, event.target.value);
                  }
                  setEditingPhrase(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setEditingPhrase(null);
                  }
                }}
              />
            ) : opened !== index ? (
              <button
                type="button"
                title="Open words. Double-click or press F2 to retype this caption."
                aria-expanded={false}
                aria-label={`Open caption at ${phrase.start.toFixed(2)}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingWord(null);
                  setOpened(index);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'F2' && editable) {
                    event.preventDefault();
                    setOpened(index);
                    setEditingPhrase(index);
                  }
                }}
              >
                {phrase.words.map((word) => word.text).join(' ')}
              </button>
            ) : (
              visibleWords.map((word) => {
                const id = `${word.placement}:${word.start}`;
                const changed = !!isWordChanged?.(word);
                return (
                  <div
                    key={id}
                    className={`editorial-text-bar editorial-word${changed ? ' fixed' : ''}`}
                    data-word={id}
                    data-fixed={String(changed)}
                    data-source-start={word.sourceStart}
                    data-source-end={word.sourceStart! + word.end - word.start}
                    style={{
                      position: 'relative',
                      top: 0,
                      bottom: 0,
                      flex: word.end - word.start,
                      minWidth: MIN_OPEN_WORD_WIDTH,
                    }}
                    onContextMenu={(event) => {
                      if (canPin && onPin) {
                        event.preventDefault();
                        event.stopPropagation();
                        onPin(word);
                      }
                    }}
                  >
                    {editingWord === id ? (
                      <input
                        aria-label={`Word at ${word.start.toFixed(2)} in ${word.placement}`}
                        defaultValue={word.text}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                        onBlur={(event) => {
                          if (event.target.value.trim() && event.target.value !== word.text) {
                            onWord(word, event.target.value);
                          }
                          setEditingWord(null);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') event.currentTarget.blur();
                          if (event.key === 'Escape') {
                            event.preventDefault();
                            setEditingWord(null);
                          }
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        aria-label={`Edit word ${word.text} at ${word.start.toFixed(2)} in ${word.placement}`}
                        disabled={!editable}
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingWord(id);
                        }}
                      >
                        {word.text}
                      </button>
                    )}
                    {canPin && onPin && (
                      <button
                        type="button"
                        className="editorial-word-pin"
                        aria-label={`Pin word at ${word.start.toFixed(2)} in ${word.placement}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onPin(word);
                        }}
                      >
                        P
                      </button>
                    )}
                    {editable &&
                      (['start', 'end'] as const).map((edge) => (
                        <span
                          key={edge}
                          className={`native-trim native-trim-${edge}`}
                          role="spinbutton"
                          tabIndex={0}
                          aria-label={`Word ${edge} at ${word.start.toFixed(2)} in ${word.placement}`}
                          aria-valuemin={edge === 'start' ? 0 : word.sourceStart! + MIN_WORD_DURATION}
                          aria-valuenow={edge === 'start' ? word.sourceStart : word.sourceStart! + word.end - word.start}
                          title="Arrow keys adjust timing."
                          onKeyDown={(event) => onKeyRetime(event, edge, word)}
                          onPointerDown={(event) => begin(event, edge, word)}
                          onPointerUp={end}
                        />
                      ))}
                  </div>
                );
              })
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
