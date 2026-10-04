import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { CarryNotice, Comment } from './api/index.ts';
import { NO_SHOT, sectionNumber } from './sections.ts';
import { Empty } from './Empty.tsx';
import { readOnlyNote } from './readOnly.ts';
import { wordLabel } from './Transcript.tsx';
import { formatTimecode } from './timecode.ts';
import type { CommentsState } from './useComments.ts';
import type { NoteState } from './useNote.ts';

const UNDO_MS = 6000;
const NOTE_PLACEHOLDER = 'Feedback that belongs to no single moment…';

const failure = (err: unknown, fallback: string): string => (err instanceof Error ? err.message : fallback);

interface CardProps {
  comment: Comment;
  /** False on a version that cannot take comments: no Edit and Delete. */
  editable: boolean;
  onOpen(opener: HTMLElement): void;
  onEdit(text: string): Promise<void>;
  onDelete(): void;
}

function CommentCard({ comment, editable, onOpen, onEdit, onDelete }: CardProps) {
  const { pin } = comment;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(comment.text);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) field.current?.focus();
  }, [editing]);

  function startEditing(): void {
    setText(comment.text);
    setError(null);
    setEditing(true);
  }

  function stopEditing(): void {
    setEditing(false);
    setError(null);
    // The field is going away; keep the keyboard where it was.
    window.setTimeout(() => editButton.current?.focus());
  }

  async function save(): Promise<void> {
    if (busy) return;
    if (text.trim() === '') {
      setError('A comment needs some text.');
      return;
    }
    setBusy(true);
    try {
      await onEdit(text.trim());
      stopEditing();
    } catch (err) {
      setError(failure(err, 'Could not save the comment.'));
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void save();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      stopEditing();
    }
  }

  const target = pin.kind === 'word' ? wordLabel(pin.word) : pin.element;
  const where = target ?? 'position';
  return (
    <li className="c">
      <div className="where">
        <span className="dot">{comment.number}</span>
        <span className="num">{`${pin.shot === NO_SHOT ? '' : `Shot ${pin.shot} · `}${formatTimecode(pin.time)}s`}</span>
        <span className={target ? 'el' : undefined}>{where}</span>
      </div>
      {(comment.sent || comment.carried) && (
        <div className="carry-state">
          {[comment.sent ? 'Sent to Claude' : '', comment.carried ? (comment.carried.moved ? `Moved to v${comment.carried.to}` : `Not carried to v${comment.carried.to}`) : '']
            .filter((part) => part !== '')
            .join(' · ')}
        </div>
      )}
      {editing ? (
        <div className="c-edit">
          <textarea
            ref={field}
            value={text}
            rows={3}
            aria-label={`Edit comment ${comment.number}`}
            aria-describedby={error ? `c-${comment.id}-error` : undefined}
            disabled={busy}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
          />
          {error && <p id={`c-${comment.id}-error`} role="alert" className="c-error">{error}</p>}
          <div className="c-actions shown">
            <button type="button" className="c-act strong" disabled={busy} onClick={() => void save()}>Save</button>
            <button type="button" className="c-act" onClick={stopEditing}>Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <p>{comment.text}</p>
          <button
            ref={openButton}
            type="button"
            className="c-open"
            aria-label={pin.shot === NO_SHOT ? `Open comment ${comment.number}, ${where}` : `Open comment ${comment.number} on shot ${pin.shot}, ${where}`}
            onClick={(e) => onOpen(e.currentTarget)}
          />
          {editable && (
            <div className="c-actions">
              <button ref={editButton} type="button" className="c-act" aria-label={`Edit comment ${comment.number}`} onClick={startEditing}>Edit</button>
              <button type="button" className="c-act" aria-label={`Delete comment ${comment.number}`} onClick={onDelete}>Delete</button>
            </div>
          )}
        </>
      )}
    </li>
  );
}

function NoteBox({ note, readOnly }: { note: NoteState; readOnly: boolean }) {
  const label = 'Note on the whole reel';
  const saveState =
    note.error !== null ? `Could not save the note. ${note.error}` : note.status === 'saving' ? 'Saving…' : note.status === 'saved' ? 'Saved' : '';
  return (
    <div className="note-box">
      {readOnly ? (
        <>
          <div id="reel-note-label" className="label">{label}</div>
          <p className="note-read">{note.text.trim() === '' ? 'No note.' : note.text}</p>
        </>
      ) : (
        <>
          <label className="label" htmlFor="reel-note">{label}</label>
          <textarea
            id="reel-note"
            value={note.text}
            placeholder={NOTE_PLACEHOLDER}
            disabled={!note.loaded}
            maxLength={4000}
            onChange={(e) => note.edit(e.target.value)}
            onBlur={() => void note.flush()}
          />
          <span className="note-state meta" role="status" aria-live="polite">{saveState}</span>
        </>
      )}
    </div>
  );
}

interface PanelProps {
  version: number | undefined;
  newest: number | undefined;
  state: CommentsState;
  note: NoteState;
  onOpenComment(comment: Comment, opener: HTMLElement): void;
  /** On a multi-section reel: the current section's number and the shots it holds; the column lists only its comments. */
  section?: { number: string; shots: ReadonlySet<string> } | null;
  /** The open version's section ids in order on a multi-section reel, so the notice can number them; null on a one-section reel. */
  sectionIds?: string[] | null;
  onOpenVersion(number: number): void;
}

/** What the comments column says about the version before: the unsent comments it kept because their section changed. */
function CarryLine({ notice, sectionIds, onOpen }: { notice: CarryNotice; sectionIds: string[] | null; onOpen(number: number): void }) {
  const { count, from, sections } = notice;
  const numbers = sections.map((id) => (sectionIds?.includes(id) ? sectionNumber(sectionIds.indexOf(id)) : id));
  const why = sectionIds === null ? 'the reel changed' : `${sections.length === 1 ? 'section' : 'sections'} ${numbers.join(', ')} changed`;
  return (
    <p className="carry-line">
      <span>{`${count} ${count === 1 ? 'comment' : 'comments'} on v${from} ${count === 1 ? 'was' : 'were'} not carried because ${why}.`}</span>
      <button type="button" className="c-act strong" onClick={() => onOpen(from)}>{`Open v${from}`}</button>
    </p>
  );
}

/** The comments column: a card per pin (open, edit, delete with undo), and the note on the whole reel. */
export function CommentsPanel({ version, newest, state, note, onOpenComment, onOpenVersion, section = null, sectionIds = null }: PanelProps) {
  const { error } = state;
  const comments = section ? state.comments.filter((c) => section.shots.has(c.pin.shot)) : state.comments;
  const readOnly = version !== undefined && newest !== undefined && version !== newest;
  const [undo, setUndo] = useState<{ comment: Comment; number: number } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const undoTimer = useRef<number | undefined>(undefined);
  const undoButton = useRef<HTMLButtonElement>(null);

  useEffect(() => () => window.clearTimeout(undoTimer.current), []);
  // The line about a deleted comment belongs to the version it happened on.
  useEffect(() => {
    window.clearTimeout(undoTimer.current);
    setUndo(null);
    setProblem(null);
  }, [version]);
  useEffect(() => {
    if (undo) undoButton.current?.focus();
  }, [undo]);

  async function remove(comment: Comment): Promise<void> {
    setProblem(null);
    try {
      await state.remove(comment.id);
    } catch (err) {
      setProblem(failure(err, 'Could not delete the comment.'));
      return;
    }
    window.clearTimeout(undoTimer.current);
    setUndo({ comment, number: comment.number });
    undoTimer.current = window.setTimeout(() => setUndo(null), UNDO_MS);
  }

  async function restore(): Promise<void> {
    if (!undo) return;
    const { pin, text } = undo.comment;
    window.clearTimeout(undoTimer.current);
    setUndo(null);
    try {
      await state.save({
        pin: pin.kind === 'word' ? { kind: 'word', shot: pin.shot, time: pin.time, word: pin.word } : { shot: pin.shot, x: pin.x, y: pin.y, element: pin.element },
        text,
      });
    } catch (err) {
      setProblem(failure(err, 'Could not restore the comment.'));
    }
  }

  const empty = version === undefined ? 'No comments yet.' : readOnly ? `No comments on v${version}.` : `No comments on v${version} yet. Enlarge a shot and click the frame to pin one.`;
  return (
    <aside className="comments" aria-label="Comments">
      <header>
        <h2>Comments</h2>
        {version !== undefined && (
          <span className="meta num">{section ? `v${version} · section ${section.number} · ${comments.length}` : `v${version} · ${comments.length}`}</span>
        )}
      </header>
      {readOnly && newest !== undefined && <p className="readonly-note">{readOnlyNote(version, newest)}</p>}
      <div className="undo" role="status" aria-live="polite">
        {undo && (
          <>
            <span>{`Comment ${undo.number} deleted`}</span>
            <button ref={undoButton} type="button" className="c-act strong" onClick={() => void restore()}>Undo</button>
          </>
        )}
      </div>
      {state.notCarried && <CarryLine notice={state.notCarried} sectionIds={sectionIds} onOpen={onOpenVersion} />}
      {problem && <p role="alert" className="c-error">{problem}</p>}
      {error ? (
        <Empty>{`Could not read the comments. ${error}`}</Empty>
      ) : comments.length > 0 ? (
        <ol className="clist" aria-label="Comments on this version">
          {comments.map((comment) => (
            <CommentCard
              key={comment.id}
              comment={comment}
              editable={!readOnly}
              onOpen={(opener) => onOpenComment(comment, opener)}
              onEdit={(text) => state.edit(comment.id, text)}
              onDelete={() => void remove(comment)}
            />
          ))}
        </ol>
      ) : (
        <Empty>{empty}</Empty>
      )}
      {version !== undefined && <NoteBox note={note} readOnly={readOnly} />}
    </aside>
  );
}
