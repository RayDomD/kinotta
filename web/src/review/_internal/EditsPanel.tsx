import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { applyOperations, describeOperation, pieceMap, toTimeline, toTimelineSpan } from '../../../../server/core/model.ts';
import type { Operation, Piece, PlanClip } from '../../../../server/core/model.ts';
import { formatTransport } from './clock.ts';
import { editedList } from './edited.ts';
import { useEditorWorkspace } from './EditorWorkspace.tsx';
import type { EditsState } from './useEdits.ts';

export interface ReviewSideProps {
  edits: EditsState | undefined;
  /** The open version's pieces; the cards say where each edit landed on the timeline. */
  pieces: readonly Piece[] | undefined;
  /** The open version's clips in source time, so a slide can say where its clip was. */
  clips?: readonly PlanClip[];
  /** The open version is the newest and has footage (or is built from code), so it can be edited. */
  editable: boolean;
  /** Built from code: only element moves are edits, and the cards name scenes, not clips. */
  codeOnly?: boolean;
  media?: boolean;
  /** Unsent comments on the open version. */
  commentCount: number;
  /** The Comments tab's content. */
  comments: ReactNode;
}

function verifyAttrs(tab: string, list: EditsState['list']) {
  return { 'data-verify-unit': 'EditsPanel', 'data-verify-tab': tab, 'data-verify-count': list?.operations.length ?? 0, 'data-verify-base': list?.base ?? 0, 'data-verify-replayed-from': list?.replayedFrom ?? '' };
}

/** Where an operation landed on the timeline as it was when the operation was made, in the transport's reading. */
function whereOn(pieces: readonly Piece[], operations: readonly Operation[], index: number, clips: readonly PlanClip[] | undefined): string {
  const op = operations[index]!;
  if (op.kind === 'use-version') return 'whole reel';
  if (op.kind === 'pin-comment') return op.comment ? `shot ${op.comment.pin.shot}` : 'pin';
  if (op.kind === 'shot-alternate' || op.kind === 'shot-alternate-dismiss') return `shot ${op.shot}`;
  if (op.kind === 'track-add' || op.kind === 'track-change' || op.kind === 'track-move' || op.kind === 'track-remove') return 'audio track';
  if (op.kind === 'placement-detach') return 'insert sound';
  if (op.kind === 'placement-duck') return 'music clip';
  if (op.kind === 'placement-snip') return `${formatTransport(op.from)} to ${formatTransport(op.to)}`;
  if (op.kind === 'clip-attachment') return `placement ${op.placement}`;
  if (op.kind === 'clip-split') return `clip ${op.clip}`;
  if (op.kind === 'placement-add' || op.kind === 'placement-change' || op.kind === 'placement-remove' || op.kind === 'placement-ripple-remove' || op.kind === 'placement-move' || op.kind === 'placement-layer' || op.kind === 'placement-replace' || op.kind === 'placement-split') return 'media placement';
  if (op.kind === 'source-beats') return 'music source';
  const before = pieceMap(editedList(pieces, operations.slice(0, index)), 0);
  if (op.kind === 'caption-position') return 'all captions';
  if (op.kind === 'clip-trim') return formatTransport(toTimeline(before, op.in) ?? 0);
  if (op.kind === 'clip-slide' || op.kind === 'element-offset') {
    // Where the clip began before this edit, with the clip edits made earlier applied.
    let from: number | undefined;
    try {
      from = applyOperations({ plan: { clips: [...(clips ?? [])] }, words: [] }, operations.slice(0, index).filter((o) => o.kind === 'clip-trim' || o.kind === 'clip-slide')).plan.clips?.find((c) => c.id === op.clip)?.in;
    } catch {
      from = undefined;
    }
    return formatTransport(from === undefined ? 0 : (toTimeline(before, from) ?? 0));
  }
  const at =
    op.kind === 'snip' || op.kind === 'phrase-text'
      ? toTimelineSpan(before, op.from, op.to)?.start
      : op.kind === 'move-piece'
        ? before.pieces[op.from]?.at
        : toTimeline(before, op.at);
  return formatTransport(at ?? 0);
}

function EditsTab({ edits, pieces, clips, editable, codeOnly = false, media = false }: Omit<ReviewSideProps, 'commentCount' | 'comments'>) {
  const operations = edits?.list?.operations ?? [];
  const stale = edits?.list?.stale === true;
  const flagged = edits?.list?.flagged ?? {};
  const handedOff = edits?.list?.handedOff;
  // Flagged edits are not part of the preview, so where an edit landed is worked out from the ones that apply.
  const applied = operations.filter((op) => flagged[op.id] === undefined);
  const idle = edits !== undefined && !edits.busy;
  const { editFocus } = useEditorWorkspace();
  const lit = editFocus?.id;
  const rows = useRef<HTMLOListElement>(null);
  // An edit named in the error bar is scrolled into view and focused, so its row is where the owner lands.
  useEffect(() => {
    if (!editFocus) return;
    const row = [...(rows.current?.children ?? [])].find((el): el is HTMLElement => el instanceof HTMLElement && el.dataset.editId === editFocus.id);
    row?.scrollIntoView({ block: 'nearest' });
    row?.focus({ preventScroll: true });
  }, [editFocus?.seq, operations.length]);

  return (
    <>
      <div className="rv-panelbody">
        {edits?.list?.replayedFrom !== undefined && <p className="meta" role="status" data-verify-replay-notice>{`Edits carried from v${edits.list.replayedFrom} to v${edits.list.base}. Undo and Redo restarted for the new version.`}</p>}
        {!editable && <p className="meta">{stale ? 'These edits need to be checked against the working reel.' : 'Back to Working to edit the reel.'}</p>}
        {handedOff && (
          <div className="rv-handoff" role="status">
            <p className="meta">{handedOff.reason}</p>
            <button type="button" className="quiet-link" disabled={!idle} onClick={() => void edits?.cancelHandoff()}>Cancel hand-off</button>
          </div>
        )}
        {editable && operations.length === 0 && media && <p className="meta rv-hint">Import media from the library, then adjust each placement's range, timing and sound. Changes play in preview. Changes are kept in Working.</p>}
        {editable && operations.length === 0 && codeOnly && !media && <p className="meta rv-hint">No edits yet. Drag a shot in the Picture row to move it, or its edges to trim it. Click an element in the frame to move it, or drag its corner to scale it. The arrow keys nudge the element.</p>}
        {editable && operations.length === 0 && !codeOnly && !media && <p className="meta rv-hint">No edits yet. Press S for the Snip tool, drag across the lanes, then press Snip. Press B for the Blade to cut, and drag a piece to move it. Drag a clip to slide it, or its edges to trim it. Click an element in the frame to move it; the arrow keys nudge it.</p>}
        {editable && (operations.length > 0 || edits?.list?.canUndo === true || edits?.list?.canRedo === true) && (
          <div className="rv-undo">
            <button type="button" disabled={edits?.list?.canUndo !== true} onClick={() => void edits?.undo()}>
              Undo <kbd className="dot">Ctrl Z</kbd>
            </button>
            <button type="button" disabled={edits?.list?.canRedo !== true} onClick={() => void edits?.redo()}>
              Redo <kbd className="dot">Ctrl Shift Z</kbd>
            </button>
            <span>{`since v${edits?.list?.base ?? ''}`}</span>
          </div>
        )}
        {operations.length > 0 && (
          <ol className="clist" aria-label="Edits" ref={rows}>
            {operations.map((op, i) => {
              const { target, text } = describeOperation(op);
              const gone = flagged[op.id];
              return (
                <li key={op.id} data-edit-id={op.id} tabIndex={-1} className={`${op.kind === 'clip-slide' || gone !== undefined ? 'c flag' : 'c'}${lit === op.id ? ' lit' : ''}`} aria-current={lit === op.id ? 'true' : undefined}>
                  <div className="where">
                    <span className="dot">{i + 1}</span>
                    {`${codeOnly ? target.replace(/^Clip/, 'Scene') : target}${pieces && gone === undefined ? ` · ${whereOn(pieces, applied, applied.indexOf(op), clips)}` : ''}`}
                  </div>
                  {op.kind === 'snip' && op.reason && <p className="meta">{op.reason}</p>}
                  <p>{text}</p><span className="rv-edit-author">{op.by}</span>
                  {gone !== undefined && <div className="note">{`No longer applies to v${edits?.list?.base ?? ''}: ${gone} Remove it, or make the edit again. Saving leaves it out.`}</div>}
                  {gone === undefined && op.kind === 'clip-slide' && <div className="note">Off its words: its changes no longer land on the words they were placed on. Keep it, or ask your agent to re-sync.</div>}
                  <button type="button" className="x" aria-label={`Remove edit ${i + 1}`} disabled={!editable || !edits || stale} onClick={() => void edits?.remove(op.id)}>
                    Remove
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        {edits?.error && <p role="alert" className="c-error">{edits.error}</p>}
      </div>

    </>
  );
}

/** The right column of the Review tab: durable Edits and Comments. */
export function ReviewSide(props: ReviewSideProps) {
  const { panelTab: tab, setPanelTab: setTab, setClipHost, setSoundHost, setPinHost } = useEditorWorkspace();
  const count = props.edits?.list?.operations.length ?? 0;
  return (
    <div className="rv-side" {...verifyAttrs(tab, props.edits?.list ?? null)}>
      <div className="rv-tabs" role="tablist" aria-label="Edits and comments">
        <button type="button" role="tab" aria-selected={tab === 'edits'} onClick={() => setTab('edits')}>
          Edits{count > 0 && <span className="dot">{count}</span>}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'comments'} onClick={() => setTab('comments')}>
          Comments{props.commentCount > 0 && <span className="dot">{props.commentCount}</span>}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'clip'} onClick={() => setTab('clip')}>Clip</button>
        {props.media && <button type="button" role="tab" aria-selected={tab === 'sound'} onClick={() => setTab('sound')}>Sound</button>}
      </div>
      {tab === 'edits' && <EditsTab {...props} />}
      <div className="editor-pin-host" ref={setPinHost} hidden={tab !== 'comments'} />
      {tab === 'comments' && props.comments}
      <div className="editor-clip-host" ref={setClipHost} hidden={tab !== 'clip'} />
      <div className="editor-clip-host" ref={setSoundHost} hidden={tab !== 'sound'} />
    </div>
  );
}
