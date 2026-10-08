import { useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react';
import type { MediaCaptionPhrase, PlanClip, mediaWords } from '../../../../server/core/model.ts';
import type { TimeWindow } from './timeline.ts';

const MIN_WORD_DURATION = 0.02;
type Word = ReturnType<typeof mediaWords>[number];
interface Pin { id: string; number: number; text: string; moment: { time: number; removed?: boolean }; state?: unknown }
interface Props {
  duration: number;
  win: TimeWindow;
  words: readonly Word[];
  phrases: readonly MediaCaptionPhrase[];
  graphics: readonly PlanClip[];
  pins: readonly Pin[];
  editable: boolean;
  graphicEditable: boolean;
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
  onSeek: (time: number) => void;
}
function verifyAttrs(words: number, graphics: number, broken: number, win: TimeWindow) {
  return { 'data-verify-unit': 'EditorialLanes', 'data-verify-words': words, 'data-verify-graphics': graphics, 'data-verify-broken': broken, 'data-verify-window-start': win.start, 'data-verify-window-length': win.length };
}

/** Native source identities stay on words and graphics while their bars show reel time. */
export function EditorialLanes({ duration, win, words, phrases, graphics, pins, editable, graphicEditable, canPin, selectedGraphic, onGraphic, onGraphicKey, onGraphicDrag, onGraphicPreview, onWord, onRetime, onPin, onPhrase, onSeek }: Props) {
  const length = win.length;
  const [editingWord, setEditingWord] = useState<string | null>(null);
  const [editingPhrase, setEditingPhrase] = useState<number | null>(null);
  const gesture = useRef<{ x: number; width: number; edge: 'start' | 'end' | 'move'; word?: Word; graphic?: string } | null>(null);
  const place = (start: number, end: number): CSSProperties => ({ left: `${(start - win.start) / length * 100}%`, width: `${Math.max(0.02, end - start) / length * 100}%` });
  const begin = (event: PointerEvent<HTMLElement>, edge: 'start' | 'end' | 'move', item: { word?: Word; graphic?: string }) => {
    if (!editable || item.graphic && !graphicEditable || event.button !== 0) return;
    if (item.graphic && graphics.find((clip) => clip.id === item.graphic)?.attachmentBroken) return;
    event.preventDefault(); event.stopPropagation();
    gesture.current = { x: event.clientX, width: event.currentTarget.closest('.native-lane-bars')!.getBoundingClientRect().width, edge, ...item };
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
  return <section className="editorial-lanes" aria-label="Graphics, speech and pins" {...verifyAttrs(words.length, graphics.length, graphics.filter((clip) => clip.attachmentBroken).length, win)} onPointerMove={(event) => {
    const drag = gesture.current;
    if (drag?.graphic) onGraphicPreview({ id: drag.graphic, edge: drag.edge, delta: (event.clientX - drag.x) / drag.width * length });
  }} onPointerCancel={() => { gesture.current = null; onGraphicPreview(null); }}>
    <div className="native-lane"><strong>Clips</strong><div className="native-lane-bars">{graphics.map((clip) => <button key={clip.id} type="button" className={`native-clip editorial-graphic${clip.attachmentBroken ? ' editorial-broken' : ''}`} data-graphic={clip.id} data-verify-broken-graphic={String(!!clip.attachmentBroken)} aria-pressed={selectedGraphic === clip.id} style={place(clip.in, clip.out)} onClick={() => onGraphic(clip.id, false)} onDoubleClick={() => onGraphic(clip.id, true)} onKeyDown={(event) => onGraphicKey(event, clip.id)} onContextMenu={(event) => { event.preventDefault(); onGraphic(clip.id, true); }} onPointerDown={(event) => begin(event, 'move', { graphic: clip.id })} onPointerUp={end}>
      <span>{clip.title ?? clip.id}{clip.attachmentBroken ? ' · Reattach' : ''}</span>
      {clip.slid && <span className="rv-off">off its words</span>}
      {graphicEditable && !clip.attachmentBroken && (['start', 'end'] as const).map((edge) => <span key={edge} className={`native-trim native-trim-${edge}`} aria-label={`Trim graphic ${edge} ${clip.id}`} onPointerDown={(event) => begin(event, edge, { graphic: clip.id })} onPointerUp={end} />)}
    </button>)}</div></div>
    <div className="native-lane"><strong>Captions</strong><div className="native-lane-bars">{phrases.map((phrase, index) => <div key={`${phrase.start}:${index}`} className="editorial-text-bar" style={place(phrase.start, phrase.end)}>
      {editingPhrase === index ? <input aria-label={`Caption at ${phrase.start.toFixed(2)}`} defaultValue={phrase.words.map((word) => word.text).join(' ')} autoFocus onBlur={(event) => { if (event.target.value !== phrase.words.map((word) => word.text).join(' ')) onPhrase(index, event.target.value); setEditingPhrase(null); }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { event.preventDefault(); setEditingPhrase(null); } }} /> : <button type="button" disabled={!editable} onClick={() => setEditingPhrase(index)}>{phrase.words.map((word) => word.text).join(' ')}</button>}
    </div>)}</div></div>
    <div className="native-lane"><strong>Words</strong><div className="native-lane-bars">{words.map((word) => {
      const id = `${word.placement}:${word.start}`;
      return <div key={id} className="editorial-text-bar editorial-word" data-word={id} data-source-start={word.sourceStart} data-source-end={word.sourceStart! + word.end - word.start} style={place(word.start, word.end)} onContextMenu={(event) => { if (canPin) { event.preventDefault(); onPin(word); } }}>
        {editingWord === id ? <input aria-label={`Word at ${word.start.toFixed(2)} in ${word.placement}`} defaultValue={word.text} autoFocus onBlur={(event) => { if (event.target.value.trim() && event.target.value !== word.text) onWord(word, event.target.value); setEditingWord(null); }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { event.preventDefault(); setEditingWord(null); } }} /> : <button type="button" aria-label={`Edit word ${word.text} at ${word.start.toFixed(2)} in ${word.placement}`} disabled={!editable} onClick={() => setEditingWord(id)}>{word.text}</button>}
        {canPin && <button type="button" className="editorial-word-pin" aria-label={`Pin word at ${word.start.toFixed(2)} in ${word.placement}`} onClick={() => onPin(word)}>P</button>}
        {editable && (['start', 'end'] as const).map((edge) => <span key={edge} className={`native-trim native-trim-${edge}`} aria-label={`Word ${edge} at ${word.start.toFixed(2)} in ${word.placement}`} onPointerDown={(event) => begin(event, edge, { word })} onPointerUp={end} />)}
      </div>;
    })}</div></div>
    <div className="native-lane"><strong>Pins</strong><div className="native-lane-bars">{pins.map((pin) => <button type="button" key={pin.id} className="editorial-pin" aria-label={`${pin.number}. ${pin.text}${pin.moment.removed ? '. Moment removed' : ''}`} disabled={pin.moment.removed || !!pin.state} style={{ left: `${(Math.min(duration, pin.moment.time) - win.start) / length * 100}%` }} onClick={() => onSeek(pin.moment.time)}>{pin.number}</button>)}</div></div>
  </section>;
}
