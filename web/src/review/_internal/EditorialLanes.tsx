import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from 'react';
import type { MediaCaptionPhrase, PlanClip, mediaWords } from '../../../../server/core/model.ts';
import type { TimeWindow } from './timeline.ts';

const MIN_WORD_DURATION = 0.02;
const MIN_OPEN_WORD_WIDTH = 64;
type Word = ReturnType<typeof mediaWords>[number];
interface Props {
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
  return { 'data-verify-unit': 'EditorialLanes', 'data-verify-words': words, 'data-verify-visible-words': visibleWords, 'data-verify-caption': opened ?? '', 'data-verify-graphics': graphics, 'data-verify-broken': broken, 'data-verify-window-start': win.start, 'data-verify-window-length': win.length };
}

/** Native source identities stay on words and graphics while their bars show reel time. */
export function EditorialLanes({ children, win, words, phrases, graphics, editable, graphicEditable, nudge, canPin, selectedGraphic, onGraphic, onGraphicKey, onGraphicDrag, onGraphicPreview, onWord, onRetime, onPin, onPhrase }: Props) {
  const length = win.length;
  const [editingWord, setEditingWord] = useState<string | null>(null);
  const [editingPhrase, setEditingPhrase] = useState<number | null>(null);
  const [opened, setOpened] = useState<number | null>(null);
  const root = useRef<HTMLElement>(null);
  const openedRef = useRef<number | null>(null);
  const restoreFocus = useRef<number | null>(null);
  openedRef.current = opened;
  useEffect(() => {
    if (opened !== null) root.current?.querySelector<HTMLButtonElement>(`[data-caption="${opened}"] [data-word] > button`)?.focus();
    else if (restoreFocus.current !== null) {
      root.current?.querySelector<HTMLButtonElement>(`[data-caption="${restoreFocus.current}"] > button`)?.focus();
      restoreFocus.current = null;
    }
  }, [opened]);
  const openPhrase = opened === null ? undefined : phrases[opened];
  const visibleWords = openPhrase && editingPhrase === null ? words.filter((word) => openPhrase.words.some((item) => item.start === word.start && item.placement === word.placement)) : [];
  useEffect(() => {
    const close = () => { setOpened(null); setEditingWord(null); setEditingPhrase(null); };
    const outside = (event: MouseEvent) => { if (!(event.target as Element).closest('[data-caption]')) close(); };
    const key = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') { restoreFocus.current = openedRef.current; close(); } };
    document.addEventListener('click', outside, true); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('click', outside, true); document.removeEventListener('keydown', key); };
  }, []);
  const gesture = useRef<{ x: number; width: number; edge: 'start' | 'end' | 'move'; word?: Word; graphic?: string } | null>(null);
  const place = (start: number, end: number): CSSProperties => ({ left: `${(start - win.start) / length * 100}%`, width: `${Math.max(0.02, end - start) / length * 100}%` });
  const begin = (event: PointerEvent<HTMLElement>, edge: 'start' | 'end' | 'move', item: { word?: Word; graphic?: string }) => {
    if (!editable || item.graphic && !graphicEditable || event.button !== 0) return;
    if (item.graphic && graphics.find((clip) => clip.id === item.graphic)?.attachmentBroken) return;
    event.preventDefault(); event.stopPropagation();
    const caption = event.currentTarget.closest<HTMLElement>('[data-caption]');
    const width = item.word && caption ? caption.getBoundingClientRect().width / (Number(caption.dataset.end) - Number(caption.dataset.start)) * length : event.currentTarget.closest('.native-lane-bars')!.getBoundingClientRect().width;
    gesture.current = { x: event.clientX, width, edge, ...item };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const end = (event: PointerEvent<HTMLElement>) => {
    const drag = gesture.current;
    if (!drag) return;
    gesture.current = null;
    const delta = (event.clientX - drag.x) / drag.width * length;
    if (Math.abs(delta) < 0.01) { onGraphicPreview(null); return; }
    if (drag.graphic) { onGraphicDrag(drag.graphic, drag.edge, delta); return; }
    if (!drag.word) return;
    const word = drag.word;
    const start = word.sourceStart!;
    const finish = start + word.end - word.start;
    onRetime(word, drag.edge === 'start' ? Math.max(0, Math.min(finish - MIN_WORD_DURATION, start + delta)) : start, drag.edge === 'end' ? Math.max(start + MIN_WORD_DURATION, finish + delta) : finish);
  };
  return <section ref={root} className="editorial-lanes" aria-label="Graphics and captions" {...verifyAttrs(words.length, graphics.length, graphics.filter((clip) => clip.attachmentBroken).length, win, opened, visibleWords.length)} onPointerMove={(event) => {
    const drag = gesture.current;
    if (drag?.graphic) onGraphicPreview({ id: drag.graphic, edge: drag.edge, delta: (event.clientX - drag.x) / drag.width * length });
  }} onPointerCancel={() => { gesture.current = null; onGraphicPreview(null); }}>
    {graphics.length > 0 && <div className="native-lane" data-row="graphics"><strong>Graphics</strong><div className="native-lane-bars">{graphics.map((clip) => <button key={clip.id} type="button" className={`native-clip editorial-graphic${clip.attachmentBroken ? ' editorial-broken' : ''}`} data-graphic={clip.id} data-verify-broken-graphic={String(!!clip.attachmentBroken)} aria-pressed={selectedGraphic === clip.id} style={place(clip.in, clip.out)} onClick={() => onGraphic(clip.id, false)} onDoubleClick={() => onGraphic(clip.id, true)} onKeyDown={(event) => onGraphicKey(event, clip.id)} onContextMenu={(event) => { event.preventDefault(); onGraphic(clip.id, true); }} onPointerDown={(event) => begin(event, 'move', { graphic: clip.id })} onPointerUp={end}>
      <span>{clip.title ?? clip.id}{clip.attachmentBroken ? ' · Reattach' : ''}</span>
      {clip.slid && <span className="rv-off">off its words</span>}
      {graphicEditable && !clip.attachmentBroken && (['start', 'end'] as const).map((edge) => <span key={edge} className={`native-trim native-trim-${edge}`} aria-label={`Trim graphic ${edge} ${clip.id}`} onPointerDown={(event) => begin(event, edge, { graphic: clip.id })} onPointerUp={end} />)}
    </button>)}</div></div>}
    {children}
    {phrases.length > 0 && <div className="native-lane" data-row="captions"><strong>Captions</strong><div className="native-lane-bars">{phrases.map((phrase, index) => <div key={index} data-caption={index} data-start={phrase.start} data-end={phrase.end} className={`editorial-text-bar${opened === index ? ' editorial-caption-open' : ''}`} style={{ ...place(phrase.start, phrase.end), ...(opened === index ? { minWidth: `${phrase.words.length * MIN_OPEN_WORD_WIDTH + 2}px` } : {}) }} onDoubleClick={() => { if (editable) { setEditingWord(null); setEditingPhrase(index); } }}>
      {editingPhrase === index ? <input aria-label={`Caption at ${phrase.start.toFixed(2)}`} defaultValue={phrase.words.map((word) => word.text).join(' ')} autoFocus onBlur={(event) => { if (event.target.value !== phrase.words.map((word) => word.text).join(' ')) onPhrase(index, event.target.value); setEditingPhrase(null); }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { event.preventDefault(); setEditingPhrase(null); } }} /> : opened !== index ? <button type="button" title="Open words. Double-click or press F2 to retype this caption." aria-expanded={false} aria-label={`Open caption at ${phrase.start.toFixed(2)}`} onClick={() => { setEditingWord(null); setOpened(index); }} onKeyDown={(event) => { if (event.key === 'F2' && editable) { event.preventDefault(); setOpened(index); setEditingPhrase(index); } }}>{phrase.words.map((word) => word.text).join(' ')}</button> : visibleWords.map((word) => {
      const id = `${word.placement}:${word.start}`;
      return <div key={id} className="editorial-text-bar editorial-word" data-word={id} data-source-start={word.sourceStart} data-source-end={word.sourceStart! + word.end - word.start} style={{ position: 'relative', top: 0, bottom: 0, flex: word.end - word.start, minWidth: MIN_OPEN_WORD_WIDTH }} onContextMenu={(event) => { if (canPin) { event.preventDefault(); onPin(word); } }}>
        {editingWord === id ? <input aria-label={`Word at ${word.start.toFixed(2)} in ${word.placement}`} defaultValue={word.text} autoFocus onBlur={(event) => { if (event.target.value.trim() && event.target.value !== word.text) onWord(word, event.target.value); setEditingWord(null); }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { event.preventDefault(); setEditingWord(null); } }} /> : <button type="button" aria-label={`Edit word ${word.text} at ${word.start.toFixed(2)} in ${word.placement}`} disabled={!editable} onClick={() => setEditingWord(id)}>{word.text}</button>}
        {canPin && <button type="button" className="editorial-word-pin" aria-label={`Pin word at ${word.start.toFixed(2)} in ${word.placement}`} onClick={() => onPin(word)}>P</button>}
        {editable && (['start', 'end'] as const).map((edge) => <span key={edge} className={`native-trim native-trim-${edge}`} role="spinbutton" tabIndex={0} aria-label={`Word ${edge} at ${word.start.toFixed(2)} in ${word.placement}`} aria-valuemin={edge === 'start' ? 0 : word.sourceStart! + MIN_WORD_DURATION} aria-valuenow={edge === 'start' ? word.sourceStart : word.sourceStart! + word.end - word.start} title="Arrow keys adjust timing." onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
          event.preventDefault(); event.stopPropagation();
          const delta = ['ArrowLeft', 'ArrowDown'].includes(event.key) ? -nudge : nudge;
          const start = word.sourceStart!;
          const finish = start + word.end - word.start;
          onRetime(word, edge === 'start' ? Math.max(0, Math.min(finish - MIN_WORD_DURATION, start + delta)) : start, edge === 'end' ? Math.max(start + MIN_WORD_DURATION, finish + delta) : finish);
        }} onPointerDown={(event) => begin(event, edge, { word })} onPointerUp={end} />)}
      </div>;
    })}
    </div>)}</div></div>}
  </section>;
}
