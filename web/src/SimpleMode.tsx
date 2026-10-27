import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  copyBatch,
  fetchWorkingVersion,
  migrateStyleProfile,
} from './api/_internal/client.ts';
import type {
  NewComment,
  ReelListing,
  ReelSummary,
  Version,
} from './api/_internal/client.ts';
import { migrateSimpleOptionsProfile } from './simple-options.ts';
import { BriefWaiting } from './BriefReel.tsx';
import { SimpleMake } from './SimpleMake.tsx';
import { Review } from './review/index.ts';
import { EditorIcon } from './review/_internal/EditorIcon.tsx';
import type { EditsState } from './review/index.ts';
import type { CommentsState } from './useComments.ts';
import { formatClock } from './timecode.ts';
import { SimpleCutsContext } from './SimpleTimeline.tsx';
import type { CutBlock, SimpleCutsValue } from './SimpleTimeline.tsx';
import { pieceMap, snipPieces, MIN_SNIP } from '../../server/core/model.ts';
import type { Piece, SnipOperation } from '../../server/core/model.ts';
import './simple.css';

/** Handles undo/redo keyboard shortcuts in Simple mode. */
export function handleSimpleUndoRedo(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey' | 'defaultPrevented' | 'target' | 'preventDefault'>,
  edits: Pick<EditsState, 'busy' | 'list' | 'undo' | 'redo'>,
): boolean {
  if (event.defaultPrevented || event.altKey || !(event.ctrlKey || event.metaKey)) {
    return false;
  }
  const isUndo = !event.shiftKey && event.key.toLowerCase() === 'z';
  const isRedo = (event.shiftKey && event.key.toLowerCase() === 'z') || event.key.toLowerCase() === 'y';
  if (!isUndo && !isRedo) return false;

  const target = event.target as HTMLElement | null;
  const dialog = target?.closest?.('dialog') as HTMLDialogElement | null | undefined;
  const isOpenDialog = dialog ? (dialog.open || (typeof dialog.hasAttribute === 'function' && dialog.hasAttribute('open'))) : false;
  if (
    target?.isContentEditable ||
    target?.closest?.('input, textarea, select, [contenteditable="true"]') ||
    isOpenDialog
  ) {
    return false;
  }

  if (isUndo) {
    if (edits.list?.canUndo) {
      event.preventDefault();
      void edits.undo();
      return true;
    }
  } else if (isRedo) {
    if (edits.list?.canRedo) {
      event.preventDefault();
      void edits.redo();
      return true;
    }
  }
  return false;
}

export const MODE_STORAGE_KEY = 'kinotta-mode';
/** Read the previous tab preference once, then share the choice across tabs and reloads. */
export function startsInSimpleMode(): boolean {
  try {
    let mode = localStorage.getItem(MODE_STORAGE_KEY);
    if (mode === null) {
      mode = sessionStorage.getItem(MODE_STORAGE_KEY) ?? 'simple';
      localStorage.setItem(MODE_STORAGE_KEY, mode);
      sessionStorage.removeItem(MODE_STORAGE_KEY);
    }
    return mode !== 'editor';
  } catch { return true; }
}


/** Computes legacy reel cut blocks with played-time join markers and source ranges. */
export function computeSimpleCuts(
  version: Pick<Version, 'pieces' | 'isNewest'> | undefined,
  edits: Pick<EditsState, 'busy' | 'list' | 'remove' | 'add'>,
  replacingCut?: { oldId: string; newOp: SnipOperation } | null,
): SimpleCutsValue | null {
  if (!version?.pieces || version.pieces.length === 0 || !version.isNewest || !edits.list || edits.list.stale || edits.list.handedOff) {
    return null;
  }
  const basePieces: Piece[] = version.pieces.map((p) => ({ in: p.in, out: p.out }));
  let liveSnips = edits.list.operations.filter(
    (op): op is SnipOperation =>
      op.kind === 'snip' && !(edits.list?.flagged && edits.list.flagged[op.id]),
  );
  if (replacingCut) {
    const hasNew = liveSnips.some((s) => s.from === replacingCut.newOp.from && s.to === replacingCut.newOp.to);
    if (!hasNew) {
      liveSnips = [...liveSnips.filter((s) => s.id !== replacingCut.oldId), replacingCut.newOp];
    }
  }
  const baseMaxOut = Math.max(0, ...basePieces.map((p) => p.out));
  const snipMaxTo = Math.max(0, ...liveSnips.map((s) => s.to));
  const sourceDuration = Math.max(baseMaxOut, snipMaxTo);
  if (sourceDuration <= 0) return null;

  let keptPieces: Piece[] = basePieces;
  for (const snip of liveSnips) {
    try {
      keptPieces = snipPieces(keptPieces, snip.from, snip.to);
    } catch {
      // Ignored if snip cannot be applied to current pieces
    }
  }

  const keptMap = pieceMap(keptPieces, sourceDuration);

  const cuts: CutBlock[] = [];
  let prevEnd = 0;
  let playedAt = 0;
  for (const piece of keptPieces) {
    if (piece.in - prevEnd > MIN_SNIP) {
      const from = prevEnd;
      const to = piece.in;
      const ops = liveSnips.filter((s) => s.from < to + MIN_SNIP && s.to > from - MIN_SNIP);
      const isDeadAir = ops.length > 0 && ops.every((s) => s.by === 'dead-air');
      cuts.push({ from, to, ops, isDeadAir, joinAt: playedAt });
    }
    playedAt += piece.out - piece.in;
    prevEnd = piece.out;
  }
  if (sourceDuration - prevEnd > MIN_SNIP) {
    const from = prevEnd;
    const to = sourceDuration;
    const ops = liveSnips.filter((s) => s.from < to + MIN_SNIP && s.to > from - MIN_SNIP);
    const isDeadAir = ops.length > 0 && ops.every((s) => s.by === 'dead-air');
    cuts.push({ from, to, ops, isDeadAir, joinAt: playedAt });
  }

  return {
    sourceDuration,
    basePieces,
    keptPieces,
    keptMap,
    cuts,
    // Cut edits use the same ordered queue as the rest of Working.
    busy: false,
    restoreCut: async (cut: CutBlock) => {
      for (const op of cut.ops) {
        await edits.remove(op.id);
      }
    },
    replaceCut: async (oldOp: SnipOperation, from: number, to: number) => {
      await edits.remove(oldOp.id);
      const ok = await edits.add({ kind: 'snip', from, to, by: oldOp.by });
      if (!ok) {
        await edits.add({ kind: 'snip', from: oldOp.from, to: oldOp.to, by: oldOp.by });
        return false;
      }
      return true;
    },
  };
}

export function SimpleMode({
  agentStripSlot,
  isJobActive,
  listing,
  reel,
  version,
  state,
  message,
  creating,
  comments,
  edits,
  onOpen,
  onNew,
  onStarted,
  onBriefStarted,
  topBar,
  renderPlayer,
  onRefresh,
}: {
  agentStripSlot: ReactNode;
  isJobActive: boolean;
  listing: ReelListing;
  reel: ReelSummary | undefined;
  version: Version | undefined;
  state: 'loading' | 'error' | 'none' | 'ready';
  message?: string;
  creating: boolean;
  comments: CommentsState;
  edits: EditsState;
  onOpen(slug: string): void;
  onNew(): void;
  onStarted(slug: string): void;
  /** Called with the slug of a reel started from a brief, which waits for its first version. */
  onBriefStarted(slug: string): void;
  topBar: ReactNode;
  renderPlayer?: ReactNode;
  onRefresh(): void;
}) {
  const [draft, setDraft] = useState<NewComment['pin'] | null>(null);
  const [pinMode, setPinMode] = useState(false);
  const bubble = useRef<HTMLFormElement>(null);
  const [text, setText] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [jump, setJump] = useState<{ time: number; seq: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [request, setRequest] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  useEffect(() => {
    void migrateSimpleOptionsProfile(migrateStyleProfile);
  }, []);

  useEffect(() => {
    setDraft(null);
    setPinMode(false);
    setSelected(null);
    setJump(null);
    setStatus('');
    setError('');
    setRequest('');
    setEditing(null);
  }, [reel?.slug, creating]);

  const [replacingCut, setReplacingCut] = useState<{ oldId: string; newOp: SnipOperation } | null>(null);

  const effectiveEdits = useMemo(() => {
    if (!replacingCut || !edits.list) return edits;
    const hasNew = edits.list.operations.some((op) => op.kind === 'snip' && op.from === replacingCut.newOp.from && op.to === replacingCut.newOp.to);
    if (hasNew) return edits;
    const ops = edits.list.operations.filter((op) => op.id !== replacingCut.oldId);
    return {
      ...edits,
      list: {
        ...edits.list,
        operations: [...ops, replacingCut.newOp],
      },
    };
  }, [edits, replacingCut]);

  const cutsValue = useMemo(() => {
    const base = computeSimpleCuts(version, effectiveEdits, replacingCut);
    if (!base) return null;
    return {
      ...base,
      replaceCut: async (oldOp: SnipOperation, from: number, to: number) => {
        const newOp: SnipOperation = { kind: 'snip', from, to, by: oldOp.by, id: `pending:${crypto.randomUUID()}` };
        setReplacingCut({ oldId: oldOp.id, newOp });
        try {
          await edits.remove(oldOp.id);
          const ok = await edits.add({ kind: 'snip', from, to, by: oldOp.by });
          if (!ok) {
            await edits.add({ kind: 'snip', from: oldOp.from, to: oldOp.to, by: oldOp.by });
            return false;
          }
          return true;
        } finally {
          setReplacingCut(null);
        }
      },
    };
  }, [version, effectiveEdits, replacingCut, edits]);
  const pins = comments.comments;
  const jumpTo = (index: number) => {
    if (!pins.length) return;
    const pin = pins[(index + pins.length) % pins.length]!;
    setSelected(pin.id);
    setJump((previous) => ({ time: pin.pin.time, seq: (previous?.seq ?? 0) + 1 }));
  };

  const stepPin = (direction: -1 | 1) => {
    const current = pins.findIndex((pin) => pin.id === selected);
    jumpTo(current < 0 ? (direction === 1 ? 0 : pins.length - 1) : current + direction);
  };

  const togglePinMode = () => {
    if (busy) return;
    setPinMode((current) => !current);
    setDraft(null);
    setText('');
  };

  useEffect(() => {
    if (!draft || text.trim() || busy) return;
    const away = (event: PointerEvent) => {
      if (!bubble.current?.contains(event.target as Node)) setDraft(null);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [draft, text, busy]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        (event.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')
      ) {
        return;
      }
      if (event.key.toLowerCase() === 'p' && reel && version && !creating) {
        event.preventDefault();
        togglePinMode();
      }
      if (event.key === 'Escape' && !busy) setDraft(null);
      if (event.key === '[' || event.key === ']') {
        event.preventDefault();
        stepPin(event.key === ']' ? 1 : -1);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [pins, selected, busy, reel, version, creating]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      handleSimpleUndoRedo(event, edits);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [edits]);

  const problem = (err: unknown) => setError(err instanceof Error ? err.message : 'Could not complete that action. Try again.');

  const regenerate = async () => {
    // A copied batch can freeze Working into a new version, which would fail the running job's publish.
    if (!reel || !version || busy || isJobActive) return;
    setBusy(true);
    setError('');
    setStatus('Saving the request…');
    setRequest('');
    try {
      const sections =
        version.sections.length > 1
          ? version.sections.filter((section) => pins.some((pin) => pin.pin.section === section.id && !pin.state))
          : [null];
      const batches: string[] = [];
      let current = version.number;
      for (const section of sections) {
        const saved = await copyBatch(reel.slug, current, section ? { section: section.id } : {});
        batches.push(saved.text);
        current = (await fetchWorkingVersion(reel.slug)).number;
      }
      const body = batches.join('\n\n');
      if (!body) throw new Error('No pins are ready to copy.');
      setRequest(body);
      onRefresh();
      try {
        await navigator.clipboard.writeText(body);
        setStatus('Request copied. Paste it into your agent to regenerate.');
      } catch {
        setStatus('Request saved. Copy the request below and paste it into your agent.');
      }
    } catch (err) {
      problem(err);
      setStatus('');
    } finally {
      setBusy(false);
    }
  };

  // The reel picker: in the start page's top bar, and beside the reel's own actions once one is open.
  const reelMenu = (
    <label>
      Reel
      <select
        aria-label="Choose reel"
        value={creating ? '' : reel?.slug ?? ''}
        disabled={busy}
        onChange={(event) => (event.target.value ? onOpen(event.target.value) : onNew())}
      >
        <option value="">New reel</option>
        {listing.reels.map((r) => (
          <option key={r.slug} value={r.slug}>{r.title}</option>
        ))}
      </select>
    </label>
  );
  const starting = creating || !reel;

  return (
    <div className="app sm-app">
      {starting ? (
        // The start page carries only the name and the reel menu; the agent and the editor come with a reel.
        <header className="sm-top">
          <span className="brand">KINOTTA</span>
          <div className="sm-top-actions">{reelMenu}</div>
        </header>
      ) : <>{topBar}{agentStripSlot}</>}
      {!starting && <div className="sm-heading"><div><h1>{reel.title}</h1><p>Watch, pin a moment, and say what should change.</p></div></div>}

      {starting ? (
        <SimpleMake onStarted={onStarted} onBriefStarted={onBriefStarted} />
      ) : reel.brief !== undefined && reel.newestVersion === null ? (
        // A reel started from a brief has nothing to play until its first version is written.
        <BriefWaiting reel={{ ...reel, brief: reel.brief }} />
      ) : renderPlayer ?? (
        <div className="sm-studio">
          <div className="sm-preview">
            <SimpleCutsContext.Provider value={cutsValue}>
              <Review
                reel={reel}
                state={state}
                version={version}
                message={message}
                comments={pins}
                edits={effectiveEdits}
                simple={{
                  pinMode,
                  controls: <button type="button" className="rv-tool sm-pin-tool" aria-label="Pin mode" title="Pin mode (P)" aria-keyshortcuts="P" aria-pressed={pinMode} disabled={busy || !version} onClick={togglePinMode}><EditorIcon name="pin" /></button>,
                  draft,
                  draftContent: draft && (
                    <form
                      ref={bubble}
                      className="sm-pin-bubble"
                      aria-label="New pin"
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          event.preventDefault(); event.stopPropagation();
                          if (!busy) setDraft(null);
                        } else if (event.key === 'Enter' && (event.target as HTMLElement).tagName === 'TEXTAREA' && !event.shiftKey && !event.nativeEvent.isComposing) {
                          event.preventDefault(); event.stopPropagation();
                          event.currentTarget.requestSubmit();
                        }
                      }}
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (!text.trim() || busy) return;
                        setBusy(true); setError('');
                        void comments.save({ pin: draft, text: text.trim() }).then(() => {
                          setDraft(null); setText(''); setStatus('Pin saved.');
                        }, problem).finally(() => setBusy(false));
                      }}
                    >
                      <p className="sm-pin-context"><span className="num">{formatClock(draft.time ?? 0)}</span>{draft.kind === 'frame' && draft.element && <> · <span className="sm-pin-element">{draft.element}</span></>}</p>
                      <textarea aria-label="Pin note (required)" placeholder="What should change?" autoFocus required maxLength={4000} value={text} disabled={busy} onChange={(event) => setText(event.target.value)} />
                      <div className="sm-pin-bubble-actions">
                        <span>Enter saves · Esc cancels</span>
                        <button type="button" className="c-act" disabled={busy} onClick={() => setDraft(null)}>Cancel pin</button>
                        <button type="submit" className="btn" disabled={busy || !text.trim()}>Add pin</button>
                      </div>
                    </form>
                  ),
                  onPin: (pin) => {
                    setDraft(pin);
                    setText('');
                    setError('');
                  },
                  jump,
                }}
              />
            </SimpleCutsContext.Provider>
          </div>

          <aside className="sm-pins" aria-label="Your pins">
            <div className="sm-pins-heading">
              <h2>Your pins <span className="num">{pins.length}</span></h2>
              <button className="c-act" type="button" disabled={!pins.length} onClick={() => stepPin(-1)}>
                Previous pin
              </button>
              <button className="c-act" type="button" disabled={!pins.length} onClick={() => stepPin(1)}>
                Next pin
              </button>
            </div>
            <p className="meta">
              Jump between pins with <kbd className="sm-kbd">[</kbd> and <kbd className="sm-kbd">]</kbd>
            </p>
            {pins.length === 0 && (
              <div className="empty">
                <h3>What would you change?</h3>
                <p>Turn on the pin, then click the picture.</p>
                <span className="terrain" aria-hidden="true" />
              </div>
            )}
            <ol className="sm-pin-list">
              {pins.map((pin, index) => (
                <li key={pin.id} data-selected={pin.id === selected}>
                  <button
                    type="button"
                    className="sm-pin-jump"
                    aria-label={`Pin ${pin.number} at ${formatClock(pin.pin.time)}${pin.pin.kind === 'frame' && pin.pin.element ? ` · ${pin.pin.element}` : ''}: ${pin.text}`}
                    onClick={() => jumpTo(index)}
                  >
                    <span className="num">{pin.number} · {formatClock(pin.pin.time)}</span>
                    <span>{pin.state ? 'Needs attention' : pin.sent ? 'Copied' : 'New'}</span>
                    {pin.pin.kind === 'frame' && pin.pin.element && <span className="sm-pin-element">{pin.pin.element}</span>}
                    <span>{pin.text}</span>
                  </button>
                  {pin.stateReason && <p className="meta">{pin.stateReason}</p>}
                  {editing === pin.id ? (
                    <form
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') setEditing(null);
                      }}
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (!editText.trim() || busy) return;
                        setBusy(true);
                        void comments
                          .edit(pin.id, editText.trim())
                          .then(() => setEditing(null), problem)
                          .finally(() => setBusy(false));
                      }}
                    >
                      <label>
                        Edit pin note
                        <textarea
                          required
                          autoFocus
                          value={editText}
                          onChange={(event) => setEditText(event.target.value)}
                        />
                      </label>
                      <button className="c-act" type="submit" disabled={busy || !editText.trim()}>
                        Save note
                      </button>
                      <button className="c-act" type="button" onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <div className="sm-pin-actions">
                      <button
                        className="c-act"
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setEditing(pin.id);
                          setEditText(pin.text);
                        }}
                      >
                        Edit note
                      </button>
                      <button
                        className="c-act"
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setBusy(true);
                          void comments.remove(pin.id).catch(problem).finally(() => setBusy(false));
                        }}
                      >
                        Delete pin
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ol>
            <div className="sm-regenerate">
              <button
                type="button"
                className="btn"
                disabled={busy || isJobActive || !version || !pins.some((pin) => !pin.state)}
                onClick={() => void regenerate()}
              >
                Regenerate (<span className="num">{pins.filter((pin) => !pin.state).length}</span> pins)
              </button>
              <p className="meta">{isJobActive ? 'Available when the background run finishes.' : 'Copies the request for your agent.'}</p>
            </div>
          </aside>
        </div>
      )}

      {(error || comments.error || edits.error) && (
        <p className="sm-message" role="alert">{error || comments.error || edits.error}</p>
      )}
      <p className="sm-message" role="status">{status}</p>
      {request && (
        <details className="sm-request">
          <summary>Request to copy</summary>
          <textarea
            aria-label="Request to copy"
            readOnly
            value={request}
            onFocus={(event) => event.target.select()}
          />
        </details>
      )}
    </div>
  );
}
