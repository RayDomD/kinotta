import { useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from 'react';
import type { MediaCaptionPhrase, PlanClip, mediaWords } from '../../../../server/core/model.ts';
import type { TimeWindow } from './timeline.ts';
import { TIMELINE_ROW_HEIGHT, stackRows } from './timeline.ts';
import { PageStill } from '../../stage/index.ts';
import { magnetDelta } from './placement-edits.ts';
import { CaptionLane, type WordEmphasis } from './CaptionLane.tsx';

type Word = ReturnType<typeof mediaWords>[number];

interface Props {
  snap?: boolean;
  snapPoints?: readonly number[];
  shotPage?: { url: string; time(clip: string): number };
  picture?: boolean;
  children?: ReactNode;
  win: TimeWindow;
  words: readonly Word[];
  phrases: readonly MediaCaptionPhrase[];
  graphics: readonly PlanClip[];
  editable: boolean;
  graphicEditable: boolean;
  nudge: number;
  canPin: boolean;
  selectedGraphic: string | null;
  isWordChanged?: (word: Word) => boolean;
  emphasis?: WordEmphasis;
  onGraphic: (id: string, inspect: boolean) => void;
  onGraphicKey: (event: KeyboardEvent<HTMLButtonElement>, id: string) => void;
  onGraphicDrag: (id: string, edge: 'start' | 'end' | 'move', seconds: number) => void;
  onGraphicPreview: (draft: { id: string; edge: 'start' | 'end' | 'move'; delta: number } | null) => void;
  onWord: (word: Word, text: string) => void;
  onRetime: (word: Word, start: number, end: number) => void;
  onPin: (word: Word) => void;
  onPhrase: (index: number, text: string) => void;
}

function verifyAttrs(words: number, graphics: number, broken: number, win: TimeWindow, opened: number | null, visibleWords: number) {
  return {
    'data-verify-unit': 'EditorialLanes',
    'data-verify-words': words,
    'data-verify-visible-words': visibleWords,
    'data-verify-caption': opened ?? '',
    'data-verify-graphics': graphics,
    'data-verify-broken': broken,
    'data-verify-window-start': win.start,
    'data-verify-window-length': win.length,
  };
}

/** Native source identities stay on words and graphics while their bars show reel time. */
export function EditorialLanes({
  children,
  win,
  words,
  phrases,
  graphics,
  picture = false,
  shotPage,
  snap,
  snapPoints = [],
  editable,
  graphicEditable,
  nudge,
  canPin,
  selectedGraphic,
  isWordChanged,
  emphasis,
  onGraphic,
  onGraphicKey,
  onGraphicDrag,
  onGraphicPreview,
  onWord,
  onRetime,
  onPin,
  onPhrase,
}: Props) {
  const length = win.length;
  const [opened, setOpened] = useState<number | null>(null);
  const [visibleWords, setVisibleWords] = useState<number>(0);
  const root = useRef<HTMLElement>(null);

  const graphicRows = stackRows(graphics, (clip) => ({ start: clip.in, end: clip.out }));
  const gesture = useRef<{
    x: number;
    width: number;
    length: number;
    edge: 'start' | 'end' | 'move';
    graphic?: string;
    edges?: number[];
    points?: number[];
  } | null>(null);
  const [snappedTime, setSnappedTime] = useState<number | null>(null);

  const graphicDelta = (drag: NonNullable<typeof gesture.current>, x: number) => {
    const raw = ((x - drag.x) / drag.width) * drag.length;
    return snap && drag.edges && drag.points ? magnetDelta(drag.edges, raw, drag.points, 0.05) : raw;
  };

  const place = (start: number, end: number, row = 0): CSSProperties => ({
    top: row * TIMELINE_ROW_HEIGHT + 5,
    bottom: 'auto',
    height: TIMELINE_ROW_HEIGHT - 10,
    left: `${(start - win.start) / length * 100}%`,
    width: `${Math.max(0.02, end - start) / length * 100}%`,
  });

  const begin = (event: PointerEvent<HTMLElement>, edge: 'start' | 'end' | 'move', id: string) => {
    if (!editable || !graphicEditable || event.button !== 0) return;
    if (graphics.find((clip) => clip.id === id)?.attachmentBroken) return;
    event.preventDefault();
    event.stopPropagation();
    const width = event.currentTarget.closest('.native-lane-bars')!.getBoundingClientRect().width;
    const clip = graphics.find((c) => c.id === id);
    gesture.current = {
      x: event.clientX,
      width,
      length,
      edge,
      graphic: id,
      ...(clip
        ? {
            edges: edge === 'start' ? [clip.in] : edge === 'end' ? [clip.out] : [clip.in, clip.out],
            points: [...snapPoints, ...graphics.filter((other) => other.id !== clip.id).flatMap((other) => [other.in, other.out])],
          }
        : {}),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const end = (event: PointerEvent<HTMLElement>) => {
    const drag = gesture.current;
    if (!drag) return;
    gesture.current = null;
    setSnappedTime(null);
    const delta = graphicDelta(drag, event.clientX);
    if (Math.abs(delta) < 0.01) {
      onGraphicPreview(null);
      return;
    }
    if (drag.graphic) {
      onGraphicDrag(drag.graphic, drag.edge, delta);
    }
  };

  return (
    <section
      ref={root}
      className="editorial-lanes"
      aria-label="Graphics and captions"
      {...verifyAttrs(
        words.length,
        graphics.length,
        graphics.filter((clip) => clip.attachmentBroken).length,
        win,
        opened,
        visibleWords,
      )}
      onPointerMove={(event) => {
        const drag = gesture.current;
        if (drag?.graphic) {
          const delta = graphicDelta(drag, event.clientX);
          setSnappedTime(
            snap
              ? drag.points?.find((point) => drag.edges?.some((edge) => Math.abs(edge + delta - point) <= 0.005001)) ?? null
              : null,
          );
          onGraphicPreview({ id: drag.graphic, edge: drag.edge, delta });
        }
      }}
      onPointerCancel={() => {
        gesture.current = null;
        setSnappedTime(null);
        onGraphicPreview(null);
      }}
    >
      {graphics.length > 0 && (
        <div className="native-lane" data-row="graphics">
          <strong>{picture ? 'Picture' : 'Graphics'}</strong>
          <div className="native-lane-bars" style={{ minHeight: graphicRows.count * TIMELINE_ROW_HEIGHT }}>
            {snappedTime !== null && (
              <span
                className="native-snap-line"
                aria-label={`Snap at ${snappedTime.toFixed(2)} seconds`}
                style={{ left: `${(snappedTime - win.start) / length * 100}%` }}
              />
            )}
            {graphics.map((clip) => (
              <button
                key={clip.id}
                type="button"
                className={`native-clip editorial-graphic${clip.attachmentBroken ? ' editorial-broken' : ''}`}
                data-graphic={clip.id}
                title={clip.title ?? clip.id}
                data-verify-broken-graphic={String(!!clip.attachmentBroken)}
                aria-pressed={selectedGraphic === clip.id}
                style={place(clip.in, clip.out, graphicRows.rows.get(clip))}
                onClick={() => onGraphic(clip.id, false)}
                onDoubleClick={() => onGraphic(clip.id, true)}
                onKeyDown={(event) => onGraphicKey(event, clip.id)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  onGraphic(clip.id, true);
                }}
                onPointerDown={(event) => begin(event, 'move', clip.id)}
                onPointerUp={end}
              >
                {picture && shotPage && clip.out > win.start && clip.in < win.start + win.length && (
                  <span className="native-shot-still">
                    <PageStill pageUrl={shotPage.url} time={shotPage.time(clip.id)} title={`${clip.title ?? clip.id} still`} />
                  </span>
                )}
                <span className="native-clip-name">
                  {clip.title ?? clip.id}
                  {clip.attachmentBroken ? ' · Reattach' : ''}
                </span>
                {clip.slid && <span className="rv-off">off its words</span>}
                {graphicEditable &&
                  !clip.attachmentBroken &&
                  (['start', 'end'] as const).map((edge) => (
                    <span
                      key={edge}
                      className={`native-trim native-trim-${edge}`}
                      aria-label={`Trim graphic ${edge} ${clip.id}`}
                      onPointerDown={(event) => begin(event, edge, clip.id)}
                      onPointerUp={end}
                    />
                  ))}
              </button>
            ))}
          </div>
        </div>
      )}
      {children}
      {phrases.length > 0 && (
        <CaptionLane
          win={win}
          words={words}
          phrases={phrases}
          editable={editable}
          canPin={canPin}
          nudge={nudge}
          snap={false}
          snapPoints={snapPoints}
          isWordChanged={isWordChanged}
          emphasis={emphasis}
          onWord={onWord}
          onRetime={onRetime}
          onPhrase={onPhrase}
          onPin={onPin}
          onOpenedChange={(newOpened, count) => {
            setOpened(newOpened);
            setVisibleWords(count);
          }}
        />
      )}
    </section>
  );
}
