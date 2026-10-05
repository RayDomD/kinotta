import { useState } from 'react';
import type { ReactNode } from 'react';
import { applyOperations, describeOperation, pieceMap, toTimeline, toTimelineSpan } from '../../../../server/core/model.ts';
import type { Operation, Piece, PlanClip } from '../../../../server/core/model.ts';
import { formatTransport } from './clock.ts';
import { editedList } from './edited.ts';
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
  /** The reel has no version yet (its transcript is still coming in): edits collect, and Save waits for v1. */
  awaitingV1?: boolean;
  /** The number the next Save makes. */
  nextVersion: number;
  /** Unsent comments on the open version. */
  commentCount: number;
  /** Save built this version; open it. */
  onSaved(version: number): void;
  /** The Comments tab's content. */
  comments: ReactNode;
}

/** Where an operation landed on the timeline as it was when the operation was made, in the transport's reading. */
function whereOn(pieces: readonly Piece[], operations: readonly Operation[], index: number, clips: readonly PlanClip[] | undefined): string {
  const before = pieceMap(editedList(pieces, operations.slice(0, index)), 0);
  const op = operations[index]!;
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
    op.kind === 'snip'
      ? toTimelineSpan(before, op.from, op.to)?.start
      : op.kind === 'move-piece'
        ? before.pieces[op.from]?.at
        : toTimeline(before, op.at);
  return formatTransport(at ?? 0);
}

function EditsTab({ edits, pieces, clips, editable, codeOnly = false, awaitingV1 = false, nextVersion, onSaved }: Omit<ReviewSideProps, 'commentCount' | 'comments'>) {
  const operations = edits?.list?.operations ?? [];
  const stale = edits?.list?.stale === true;
  const flagged = edits?.list?.flagged ?? {};
  const handedOff = edits?.list?.handedOff;
  // Flagged edits are not part of the preview, so where an edit landed is worked out from the ones that apply.
  const applied = operations.filter((op) => flagged[op.id] === undefined);
  const idle = edits !== undefined && !edits.busy;

  async function save(): Promise<void> {
    const version = await edits?.save();
    if (version !== null && version !== undefined) onSaved(version);
  }

  return (
    <>
      <div className="rv-panelbody">
        {!editable && <p className="meta">{stale ? 'These edits were made on an older version. Discard them to start again.' : 'Open the newest version to edit it.'}</p>}
        {handedOff && (
          <div className="rv-handoff" role="status">
            <p className="meta">{handedOff.reason}</p>
            <button type="button" className="quiet-link" disabled={!idle} onClick={() => void edits?.cancelHandoff()}>Cancel hand-off</button>
          </div>
        )}
        {editable && operations.length === 0 && codeOnly && <p className="meta rv-hint">No edits yet. Click an element in the frame and drag it to move it, or drag its corner to scale it. The arrow keys nudge it. This reel is built from code, so its timing is changed by your agent.</p>}
        {editable && operations.length === 0 && !codeOnly && <p className="meta rv-hint">No edits yet. Press S for the Snip tool, drag across the lanes, then press Snip. Press B for the Blade to cut, and drag a piece to move it. Drag a clip to slide it, or its edges to trim it. Click an element in the frame to move it; the arrow keys nudge it.</p>}
        {editable && (operations.length > 0 || edits?.list?.canUndo === true || edits?.list?.canRedo === true) && (
          <div className="rv-undo">
            <button type="button" disabled={!idle || edits?.list?.canUndo !== true} onClick={() => void edits?.undo()}>
              Undo <kbd className="dot">Ctrl Z</kbd>
            </button>
            <button type="button" disabled={!idle || edits?.list?.canRedo !== true} onClick={() => void edits?.redo()}>
              Redo <kbd className="dot">Ctrl Shift Z</kbd>
            </button>
            <span>{`since v${edits?.list?.base ?? ''}`}</span>
          </div>
        )}
        {operations.length > 0 && (
          <ol className="clist" aria-label="Edits">
            {operations.map((op, i) => {
              const { target, text } = describeOperation(op);
              const gone = flagged[op.id];
              return (
                <li key={op.id} className={op.kind === 'clip-slide' || gone !== undefined ? 'c flag' : 'c'}>
                  <div className="where">
                    <span className="dot">{i + 1}</span>
                    {`${codeOnly ? target.replace(/^Clip/, 'Scene') : target}${pieces && gone === undefined ? ` · ${whereOn(pieces, applied, applied.indexOf(op), clips)}` : ''}`}
                  </div>
                  <p>{text}</p>
                  {gone !== undefined && <div className="note">{`No longer applies to v${edits?.list?.base ?? ''}: ${gone} Remove it, or make the edit again.`}</div>}
                  {gone === undefined && op.kind === 'clip-slide' && <div className="note">Off its words: its changes no longer land on the words they were placed on. Keep it, or ask your agent to re-sync.</div>}
                  <button type="button" className="x" aria-label={`Remove edit ${i + 1}`} disabled={!idle || stale} onClick={() => void edits?.remove(op.id)}>
                    Remove
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        {edits?.error && <p role="alert" className="c-error">{edits.error}</p>}
      </div>
      {operations.length > 0 && (
        <div className="rv-save">
          <div className="row">
            <button type="button" className="btn" disabled={!idle || stale || awaitingV1} onClick={() => void save()}>
              {awaitingV1 ? 'Save' : `Save as v${nextVersion}`}
              <span className="count">{operations.length}</span>
            </button>
            <button type="button" className="quiet-link" disabled={!idle} onClick={() => void edits?.discard()}>Discard</button>
          </div>
          <div className="hint">{awaitingV1 ? 'Save is on once the transcript is done and v1 is built. Your edits are kept and apply to v1.' : codeOnly ? `Writes the moves into kinotta-edits.css beside the page and saves v${nextVersion}.` : `Writes the edits into the reel's plan and builds v${nextVersion}, about a second.`}</div>
        </div>
      )}
    </>
  );
}

/** The right column of the Review tab: Edits (the edit list, Save and Discard) and Comments. */
export function ReviewSide(props: ReviewSideProps) {
  const [tab, setTab] = useState<'edits' | 'comments'>('edits');
  const count = props.edits?.list?.operations.length ?? 0;
  return (
    <div className="rv-side">
      <div className="rv-tabs" role="tablist" aria-label="Edits and comments">
        <button type="button" role="tab" aria-selected={tab === 'edits'} onClick={() => setTab('edits')}>
          Edits{count > 0 && <span className="dot">{count}</span>}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'comments'} onClick={() => setTab('comments')}>
          Comments{props.commentCount > 0 && <span className="dot">{props.commentCount}</span>}
        </button>
      </div>
      {tab === 'edits' ? <EditsTab {...props} /> : props.comments}
    </div>
  );
}
