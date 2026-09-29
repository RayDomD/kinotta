import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Comment, NewComment, Shot } from './api/index.ts';
import { HexPin } from './Pins.tsx';
import { ShotKind, ShotLine } from './Transcript.tsx';
import { PinFrame } from './stage/index.ts';
import type { FrameElement, FramePick } from './stage/index.ts';
import { formatTimecode } from './timecode.ts';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
const FRAME_CENTRE: FramePick = { x: 0.5, y: 0.5, element: null };

export interface ShotSheetProps {
  pageUrl: string;
  /** The reel's footage URL when it has footage; a panel shot draws it under its clip. */
  footage: string | undefined;
  shots: Shot[];
  /** Index into `shots` of the enlarged shot. */
  index: number;
  comments: Comment[];
  /** Set on a version that cannot take comments: the sheet then shows the frame only, with this line saying why. */
  readOnlyNote?: string | null;
  save(input: NewComment): Promise<void>;
  onStep(index: number): void;
  onClose(): void;
}

interface Draft extends FramePick {
  /** Changes with every new draft, so the comment input mounts (and takes focus) again. */
  id: number;
}

const ignorePick = (): void => undefined;

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** The enlarged shot: a stacked-paper sheet over the storyboard, with the live frame to pin comments on. */
export function ShotSheet({ pageUrl, footage, shots, index, comments, readOnlyNote = null, save, onStep, onClose }: ShotSheetProps) {
  const readOnly = readOnlyNote !== null;
  const shot = shots[index]!;
  const sheet = useRef<HTMLDivElement>(null);
  const draftCount = useRef(0);
  const titleId = useId();
  const numberId = useId();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [elements, setElements] = useState<FrameElement[] | null>(null);

  useEffect(() => {
    sheet.current?.focus();
  }, []);

  // A new shot starts clean: no draft, and no element list until its frame has drawn.
  useEffect(() => {
    setDraft(null);
    setText('');
    setError(null);
    setElements(null);
  }, [shot.number]);

  const latest = useRef({ index, count: shots.length, onStep, onClose });
  latest.current = { index, count: shots.length, onStep, onClose };

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const { index: at, count, onStep: step, onClose: close } = latest.current;
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !isTyping(e.target) && !e.altKey && !e.ctrlKey && !e.metaKey) {
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
    setDraft({ ...pick, id: draftCount.current });
    setText('');
    setError(null);
  }

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!draft || saving || text.trim() === '') return;
    setSaving(true);
    try {
      await save({ pin: { shot: shot.number, x: draft.x, y: draft.y, element: draft.element }, text: text.trim() });
      setDraft(null);
      setText('');
      setError(null);
      sheet.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the comment.');
    } finally {
      setSaving(false);
    }
  }

  const pins = comments.filter((c) => c.pin.shot === shot.number);
  const timecode = formatTimecode(shot.start);
  const where = draft?.element ?? 'this position';
  const openDraft = readOnly ? null : draft;

  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={sheet} className={readOnly ? 'sheet readonly' : 'sheet'} role="dialog" aria-modal="true" aria-labelledby={`${numberId} ${titleId}`} tabIndex={-1}>
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
            pageUrl={pageUrl}
            time={shot.start}
            title={`Shot ${shot.number}`}
            footageUrl={shot.type === 'panel' ? footage : undefined}
            onPick={readOnly ? ignorePick : startDraft}
            onElements={setElements}
            draft={openDraft}
            draftContent={
              openDraft && (
                <form className="draft" onSubmit={submit}>
                  <input
                    key={openDraft.id}
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
                  {error && <p id={`${titleId}-error`} role="alert" className="draft-error">{error}</p>}
                </form>
              )
            }
          >
            {pins.map((c) => (
              <HexPin key={c.id} number={c.number} x={c.pin.x} y={c.pin.y} />
            ))}
          </PinFrame>
        </div>
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
        <ShotLine text={shot.spoken} />
        <div className="hint">
          <span>{shot.description}</span>
          <span><kbd>←</kbd> <kbd>→</kbd> shots</span>
        </div>
        <span className="sr-only" role="status">{`Shot ${index + 1} of ${shots.length}`}</span>
      </div>
    </div>
  );
}

