import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import type { Comment, NewComment, Shot, TranscriptWord } from './api/index.ts';
import { ShotKind, ShotLine, WordRow, isWordComment, wordLabel } from './Transcript.tsx';
import { PageStill, PinFrame } from './stage/index.ts';
import { clipStates } from './sections.ts';
import type { FrameElement, FramePick, FramePin } from './stage/index.ts';
import { formatTimecode } from './timecode.ts';
import type { EditsState } from './review/index.ts';

const FOCUSABLE = 'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
const FRAME_CENTRE: FramePick = { x: 0.5, y: 0.5, element: null };

function verifyAttrs(shot: Shot, count: number, viewed: string | undefined, pins: number, readOnly: boolean, loading: boolean) {
  return { 'data-verify-unit': 'ShotSheet', 'data-verify-status': readOnly ? 'frozen' : loading ? 'loading' : 'ready', 'data-verify-count': String(count), 'data-verify-viewed': viewed ?? '', 'data-verify-selected': shot.revision ?? '', 'data-verify-pin-count': String(pins), 'data-verify-read-only': String(readOnly), 'data-verify-loading': String(loading) };
}

export interface ShotSheetProps {
  initialRevision?: string;
  edits?: EditsState;
  /** A code-built reel can ask for options; a single-page one is converted to parts by the agent to answer. */
  canAskOptions?: boolean;
  alternatePage?(shot: string, revision: string): string;
  pageUrl: string;
  /** The reel's footage URL when it has footage; a panel shot draws it under its clip. */
  footage: string | undefined;
  shots: Shot[];
  /** Every shot of the reel, when `shots` is one section of it. */
  reelShots?: Shot[];
  /** Index into `shots` of the enlarged shot. */
  index: number;
  comments: Comment[];
  /** The comment whose pin is highlighted, if any. */
  markedId?: string | null;
  /** Set on a version that cannot take comments: the sheet then shows the frame only, with this line saying why. */
  readOnlyNote?: string | null;
  /** Why a shot cannot render, by shot number. */
  unavailable?: ReadonlyMap<string, string>;
  save(input: NewComment): Promise<void>;
  onStep(index: number): void;
  onClose(): void;
}

interface Draft extends FramePick {
  /** Changes with every new draft, so the comment input mounts (and takes focus) again. */
  id: number;
}

/** A comment being written on a spoken word. */
interface WordDraft {
  id: number;
  word: TranscriptWord;
}

const ignorePick = (): void => undefined;

/** Left and Right move between words while focus is in the word row; they must not step shots. */
function inWordRow(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[data-word-row]') !== null;
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** The enlarged shot: a stacked-paper sheet over the storyboard, with the live frame to pin comments on. */
export function ShotSheet({ pageUrl, footage, shots, reelShots, index, comments, markedId = null, readOnlyNote = null, unavailable, save, onStep, onClose, edits, alternatePage, initialRevision, canAskOptions = false }: ShotSheetProps) {
  const readOnly = readOnlyNote !== null;
  const shot = shots[index]!;
  const sheet = useRef<HTMLDivElement>(null);
  const draftCount = useRef(0);
  const titleId = useId();
  const numberId = useId();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [wordDraft, setWordDraft] = useState<WordDraft | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [elements, setElements] = useState<FrameElement[] | null>(null);
  /** The last saved comment, confirmed in the sheet because the comments column sits behind the scrim. */
  const [savedLine, setSavedLine] = useState<string | null>(null);
  const [viewedRevision, setViewedRevision] = useState<string | null>(initialRevision ?? null);
  const [dismissReason, setDismissReason] = useState('');
  const [askOptions, setAskOptions] = useState(false);
  const [optionsCount, setOptionsCount] = useState<2 | 3 | 4>(3);
  const alternates = shot.alternates?.filter((alternate) => !alternate.dismissed) ?? [];
  const viewed = alternates.find((alternate) => alternate.revision === viewedRevision) ?? alternates.find((alternate) => alternate.inReel) ?? alternates[0];
  const viewedPage = viewed && alternatePage && shot.name ? alternatePage(shot.name, viewed.revision) : pageUrl;
  const askingOther = comments.find((comment) => comment.options !== undefined && comment.pin.shot !== shot.number);
  const prevShot = useRef(shot.number);

  useEffect(() => {
    sheet.current?.focus();
  }, []);

  // A new shot starts clean: no draft, and no element list until its frame has drawn.
  useEffect(() => {
    if (prevShot.current !== shot.number) {
      prevShot.current = shot.number;
      setDraft(null);
      setWordDraft(null);
      setText('');
      setError(null);
      setElements(null);
      setSavedLine(null);
      setViewedRevision(null);
      setAskOptions(false);
      setOptionsCount(3);
    }
  }, [shot.number]);

  useEffect(() => {
    const pin = comments.find((comment) => comment.id === markedId)?.pin;
    if (pin?.kind === 'frame' && pin.alternate) setViewedRevision(pin.alternate);
  }, [markedId, shot.number]);

  function viewAlternate(revision: string): void {
    setViewedRevision(revision);
    setDraft(null);
    setWordDraft(null);
    setText('');
    setElements(null);
    setError(null);
    setDismissReason('');
  }

  function stepAlternate(delta: number): void {
    const current = alternates.findIndex((alternate) => alternate.revision === viewed?.revision);
    const next = alternates[current + delta];
    if (next) viewAlternate(next.revision);
  }

  const draftOpen = !readOnly && (draft !== null || wordDraft !== null);
  const latest = useRef({ index, count: shots.length, onStep, onClose, draftOpen, cancelDraft, stepAlternate, alternateCount: alternates.length });
  latest.current = { index, count: shots.length, onStep, onClose, draftOpen, cancelDraft, stepAlternate, alternateCount: alternates.length };

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const { index: at, count, onStep: step, onClose: close, draftOpen: drafting, cancelDraft: cancel } = latest.current;
      if (e.key === 'Escape') {
        e.preventDefault();
        // With a pin being placed, Esc drops it and keeps the sheet; the next Esc closes the sheet.
        if (drafting) cancel();
        else close();
      } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && latest.current.alternateCount > 0 && !isTyping(e.target) && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        latest.current.stepAlternate(e.key === 'ArrowDown' ? 1 : -1);
      } else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !isTyping(e.target) && !inWordRow(e.target) && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const next = at + (e.key === 'ArrowRight' ? 1 : -1);
        if (next >= 0 && next < count) step(next);
      } else if (e.key === 'Tab' && sheet.current) {
        const stops = [...sheet.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
        const first = stops[0];
        const last = stops[stops.length - 1];
        const active = document.activeElement;
        if (!first || !last) return;
        if (!sheet.current.contains(active) || active === sheet.current) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        } else if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function startDraft(pick: FramePick): void {
    draftCount.current += 1;
    setWordDraft(null);
    setDraft({ ...pick, id: draftCount.current });
    setText('');
    setError(null);
  }

  function startWordDraft(word: TranscriptWord): void {
    draftCount.current += 1;
    setDraft(null);
    setWordDraft({ word, id: draftCount.current });
    setText('');
    setError(null);
  }

  /** Puts the keyboard back where the pin was placed: on its word, or on the sheet. */
  function returnFocus(word: TranscriptWord | null): void {
    const button = word ? sheet.current?.querySelector<HTMLElement>(`button[data-start="${word.start}"]`) : null;
    (button ?? sheet.current)?.focus();
  }

  /** Drops the pin being placed. Nothing was saved, so nothing is removed from the version. */
  function cancelDraft(): void {
    const word = wordDraft?.word ?? null;
    setDraft(null);
    setWordDraft(null);
    setText('');
    setError(null);
    returnFocus(word);
  }

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if ((!draft && !wordDraft) || saving || text.trim() === '') return;
    setSaving(true);
    try {
      const pin = wordDraft
        ? ({ kind: 'word', shot: shot.number, time: wordDraft.word.start, word: wordDraft.word.text } as const)
        : { shot: shot.number, x: draft!.x, y: draft!.y, element: draft!.element, ...(viewed ? { alternate: viewed.revision } : {}) };
      await save({ pin, text: text.trim(), ...(askOptions ? { options: optionsCount } : {}) });
      const word = wordDraft?.word ?? null;
      setSavedLine(`Comment saved on ${word ? `word “${word.text}”` : (draft!.element ?? 'this position')}.`);
      setDraft(null);
      setWordDraft(null);
      setText('');
      setError(null);
      returnFocus(word);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the comment.');
    } finally {
      setSaving(false);
    }
  }

  const pins = comments.filter((c) => c.pin.kind === 'frame' && c.pin.shotName && shot.name ? c.pin.shotName === shot.name : c.pin.shot === shot.number);
  // Kept stable across keystrokes in the comment input, since each new list re-places every tag on the frame.
  const framePins = useMemo<FramePin[]>(
    () =>
      comments.flatMap((c) =>
        c.pin.kind === 'frame' && (c.pin.shotName && shot.name ? c.pin.shotName === shot.name : c.pin.shot === shot.number) && (!c.pin.alternate || c.pin.alternate === viewed?.revision || c.pin.alternate === shot.revision && !viewed)
          ? [{ id: c.id, number: c.number, x: c.pin.x, y: c.pin.y, element: c.pin.element, text: c.text, marked: c.id === markedId }]
          : [],
      ),
    [comments, shot.number, shot.name, markedId, viewed?.revision, shot.revision],
  );
  const wordPins = pins.filter(isWordComment);
  const timecode = formatTimecode(shot.start);
  const states = clipStates(shots, shot);
  const where = draft?.element ?? 'this position';
  const openDraft = readOnly ? null : draft;
  const openWordDraft = readOnly ? null : wordDraft;

  function draftForm(key: number, where: string): ReactElement {
    return (
      <form className="draft" onSubmit={submit}>
        <input
          key={key}
          autoFocus
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label={`Comment on ${where}, shot ${shot.number}`}
          aria-describedby={error ? `${titleId}-error` : undefined}
          placeholder="Add a comment…"
          autoComplete="off"
          disabled={saving}
        />
        <button type="button" className="draft-cancel" disabled={saving} onClick={cancelDraft}>Cancel</button>
        {canAskOptions && <div className="draft-options">
          <label><input type="checkbox" checked={askOptions} disabled={saving || !!askingOther} onChange={(event) => setAskOptions(event.target.checked)} />Ask for options</label>
          {askOptions && <label>Alternates <select aria-label="Number of alternates" value={optionsCount} disabled={saving} onChange={(event) => { const count = Number(event.target.value); if (count === 2 || count === 3 || count === 4) setOptionsCount(count); }}><option value="2">2</option><option value="3">3</option><option value="4">4</option></select></label>}
          {askingOther && <span>{`Shot ${askingOther.pin.shot} already asks for options.`}</span>}
        </div>}
        {error && <p id={`${titleId}-error`} role="alert" className="draft-error">{error}</p>}
      </form>
    );
  }

  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={sheet} className={`sheet${readOnly ? ' readonly' : ''}${alternates.length > 0 ? ' with-alternates' : ''}`} role="dialog" aria-modal="true" aria-labelledby={`${numberId} ${titleId}`} tabIndex={-1} {...verifyAttrs(shot, alternates.length, viewed?.revision, framePins.length, readOnly, elements === null)}>
        <div className="lbl">
          <span>
            <span id={numberId} className="dot">{shot.number}</span>
            <span id={titleId}>{shot.title}</span>
            <ShotKind type={shot.type} />
            <span className="t">{timecode}</span>
          </span>
          <button type="button" className="close" onClick={onClose}>Close <kbd>Esc</kbd></button>
        </div>
        <div className="well">
          <PinFrame
            key={viewedPage}
            pageUrl={viewedPage}
            time={shot.start}
            title={`Shot ${shot.number}`}
            footageUrl={shot.type === 'panel' ? footage : undefined}
            unavailable={unavailable?.get(shot.number)}
            onPick={readOnly ? ignorePick : startDraft}
            onElements={setElements}
            draft={openDraft}
            draftContent={openDraft && draftForm(openDraft.id, where)}
            pins={framePins}
          />
        </div>
        {alternates.length > 0 && <div className="alternate-strip" role="group" aria-label={`Alternates of shot ${shot.number}`}>
          {alternates.map((alternate) => <div key={alternate.revision} className={alternate.revision === viewed?.revision ? 'alternate-preview viewing' : 'alternate-preview'}>
            <PageStill pageUrl={alternatePage && shot.name ? alternatePage(shot.name, alternate.revision) : pageUrl} time={shot.start} title={`Alternate ${alternate.label} still`} />
            <button type="button" className="alternate-view" data-alternate-revision={alternate.revision} aria-label={`View alternate ${alternate.label}`} aria-pressed={alternate.revision === viewed?.revision} onClick={() => viewAlternate(alternate.revision)}><span className="num">{alternate.label}</span> {alternate.title}</button>
            <p>{alternate.note}</p>
            {alternate.inReel && <span className="alternate-in-reel">In the reel</span>}
          </div>)}
        </div>}
        {viewed && !readOnly && edits && shot.name && <div className="alternate-actions">
          <button type="button" className="btn" aria-label={`Use alternate ${viewed.label}`} disabled={edits.busy || viewed.inReel && shot.choiceMade} onClick={() => void edits.add({ kind: 'shot-alternate', shot: shot.name!, revision: viewed.revision })}>Use</button>
          <label>Reason, optional <input aria-label="Reason for Not this" value={dismissReason} disabled={edits.busy || viewed.inReel} onChange={(event) => setDismissReason(event.target.value)} /></label>
          <button type="button" className="btn quiet" aria-label={`Not this alternate ${viewed.label}`} disabled={edits.busy || viewed.inReel} onClick={() => void edits.add({ kind: 'shot-alternate-dismiss', shot: shot.name!, revision: viewed.revision, reason: dismissReason })}>Not this</button>
          {edits.error && <p role="alert">{edits.error}</p>}
        </div>}
        {states.length > 0 && (
          <div className="states" role="group" aria-label={`States of clip ${shot.clip}`}>
            <span className="label">{`Clip ${shot.clip} · ${states[0]!.title}`}</span>
            {states.map((s) => (
              <div key={s.number} className={s === shot ? 'clip-state on' : 'clip-state'}>
                <PageStill pageUrl={pageUrl} time={s.start} title={`Shot ${s.number} still`} footageUrl={s.type === 'panel' ? footage : undefined} unavailable={unavailable?.get(s.number)} />
                <button type="button" title={`${s.number} ${s.title}`} aria-current={s === shot ? 'true' : undefined} onClick={() => onStep(shots.indexOf(s))}>
                  <span className="dot">{s.number}</span> {s.title}
                </button>
              </div>
            ))}
          </div>
        )}
        {readOnly ? (
          <p className="pinrow meta">{readOnlyNote}</p>
        ) : (
          <div className="pinrow" role="group" aria-labelledby={`${titleId}-pin`}>
            <span id={`${titleId}-pin`} className="label">Pin an element</span>
            {(elements ?? []).map((el) => (
              <button key={el.name} type="button" className="chip" onClick={() => startDraft({ x: el.x, y: el.y, element: el.name })}>
                {el.name}
              </button>
            ))}
            <button type="button" className="chip" disabled={elements === null} onClick={() => startDraft(FRAME_CENTRE)}>
              Frame centre (position only)
            </button>
          </div>
        )}
        {!(shot.words && shot.words.length > 0) && <ShotLine text={shot.spoken} />}
        {shot.words && shot.words.length > 0 ? (
          <>
            <WordRow
              key={shot.number}
              shots={shots}
              index={index}
              reelShots={reelShots}
              pins={wordPins}
              markedId={markedId}
              readOnly={readOnly}
              draftWord={openWordDraft?.word ?? null}
              onPick={startWordDraft}
            />
            {openWordDraft && <div className="word-draft">{draftForm(openWordDraft.id, wordLabel(openWordDraft.word.text))}</div>}
          </>
        ) : null}
        <p className="sheet-status" role="status">{savedLine}</p>
        <div className="hint">
          <span>{shot.description}</span>
          <span><kbd>←</kbd> <kbd>→</kbd> shots{alternates.length > 0 && <> · <kbd>↑</kbd> <kbd>↓</kbd> alternates</>}</span>
        </div>
        <span className="sr-only" role="status">{`Shot ${index + 1} of ${shots.length}`}</span>
      </div>
    </div>
  );
}

