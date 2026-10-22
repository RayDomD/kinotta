import { useCallback, useEffect, useRef, useState } from 'react';
import { addOperation, cancelHandoff, fetchEdits, fetchMediaModel, fetchWorkingVersion, redoEdit, removeOperation, undoEdit } from '../../api/index.ts';
import type { EditList } from '../../api/index.ts';
import { applyOperations } from '../../../../server/core/model.ts';
import type { NewOperation, Operation, Sources } from '../../../../server/core/model.ts';

export interface EditsState {
  /** Null until the reel's list has arrived. */
  list: EditList | null;
  /** A durable edit or history change is on its way. */
  busy: boolean;
  /** Why the last change was refused, in plain words. */
  error: string | null;
  /** Adds one operation. Resolves false when it was refused (the reason is in `error`). */
  add(operation: NewOperation): Promise<boolean>;
  /** Drops one edit and keeps the ones after it. */
  remove(id: string): Promise<void>;
  /** Steps the list back, or forward again. */
  undo(): Promise<void>;
  redo(): Promise<void>;
  /** Ends the hand-off a copied batch started, without changing Working. */
  cancelHandoff(): Promise<void>;

}

const reason = (err: unknown): string => err instanceof Error ? err.message : 'Could not reach the server.';

const pendingReels = new Map<string, { count: number; reloads: Set<() => void> }>();
/** An SSE Working reload must wait until the journal's local previews have settled. */
export function afterPendingEdits(slug: string, reload: () => void) {
  const pending = pendingReels.get(slug);
  if (pending) pending.reloads.add(reload);
  else reload();
}
function pendingStarted(slug: string) {
  const pending = pendingReels.get(slug) ?? { count: 0, reloads: new Set<() => void>() };
  pending.count++; pendingReels.set(slug, pending);
}
function pendingFinished(slug: string) {
  const pending = pendingReels.get(slug)!;
  if (--pending.count) return;
  pendingReels.delete(slug);
  for (const reload of pending.reloads) reload();
}

type Change = { kind: 'add' | 'remove' | 'undo' | 'redo' | 'handoff'; operation?: Operation; id?: string; done: (ok: boolean) => void };
type View = { list: EditList | null; busy: boolean; error: string | null };
type History = { list: EditList; undo: EditList[]; redo: EditList[] };
const EMPTY: View = { list: null, busy: false, error: null };

/** Revision pages and the hydrated Working parts key are server-owned. */
const serverFirst = (op: Operation) => op.kind === 'shot-alternate' || op.kind === 'shot-alternate-dismiss';

/** Rebind provisional split/clip identities in queued commands when the server supplies its operation id. */
function bindTargets(value: unknown, from: string, to: string, key = ''): unknown {
  if (typeof value === 'string') return ['id', 'placement', 'target', 'clip', 'splitFrom'].includes(key)
    ? value === from ? to : value.split(`~${from}`).join(`~${to}`) : value;
  if (Array.isArray(value)) return value.map((item) => bindTargets(item, from, to));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, bindTargets(item, from, to, name)]));
  return value;
}

/** One reel's acknowledged journal plus queued previews. Requests remain ordered; replies rebase later previews. */
class EditSession {
  private committed: EditList | null = null;
  private sources: Sources | null = null;
  private undo: EditList[] = [];
  private redo: EditList[] = [];
  private queue: Change[] = [];
  private running = false;
  private live = true;
  private generation = 0;
  private refreshAfter = false;
  private error: string | null = null;
  constructor(readonly slug: string, private publish: (view: View) => void) {}

  private predict(state: History, change: Change): History {
    const before = state.list;
    let list: EditList;
    let undo = state.undo; let redo = state.redo;
    if (change.kind === 'handoff' || before.stale || (change.operation && serverFirst(change.operation))) return state;
    if (change.kind === 'add') list = { ...before, operations: [...before.operations, change.operation!], canUndo: true, canRedo: false };
    else if (change.kind === 'remove') list = { ...before, operations: before.operations.filter((op) => op.id !== change.id), canUndo: true, canRedo: false };
    else {
      const history = change.kind === 'undo' ? undo : redo;
      const target = history.at(-1);
      // The public journal does not contain persisted Undo/Redo snapshots from before this session.
      if (!target) return state;
      list = { ...target, ...(change.kind === 'undo' ? { canRedo: true } : { canUndo: true }) };
      if (change.kind === 'undo') { undo = undo.slice(0, -1); redo = [...redo, before]; }
      else { redo = redo.slice(0, -1); undo = [...undo, before]; }
    }
    if (!this.sources) return state;
    try { applyOperations(this.sources, list.operations.filter((op) => !list.flagged?.[op.id])); }
    catch { return state; } // Keep an unsafe/unavailable preview server-first and retain the server's refusal reason.
    if (change.kind === 'add' || change.kind === 'remove') { undo = [...undo, before]; redo = []; }
    return { list, undo, redo };
  }
  private emit() {
    if (!this.live) return;
    const state = this.committed ? this.queue.reduce((state, change) => this.predict(state, change), { list: this.committed, undo: this.undo, redo: this.redo }) : null;
    this.publish({ list: state?.list ?? null, busy: this.queue.length > 0, error: this.error });
  }

  async reload() {
    if (!this.live) return;
    if (this.queue.length) { this.refreshAfter = true; return; }
    const generation = ++this.generation;
    try {
      const [list, version, model] = await Promise.all([
        fetchEdits(this.slug), fetchWorkingVersion(this.slug).catch(() => null), fetchMediaModel(this.slug).catch(() => null),
      ]);
      if (!this.live || generation !== this.generation) return;
      if (this.committed && JSON.stringify(this.committed) !== JSON.stringify(list)) { this.undo = []; this.redo = []; }
      this.committed = list;
      this.sources = model?.legacySources ?? (version || model ? {
        plan: { media: version?.media ?? model?.media, parts: version?.parts, codeTiming: !!version?.code,
          duration: version?.duration ?? model?.duration, clips: version?.clips ?? model?.clips,
          captions: version?.captions ?? model?.captions, sections: version?.mediaSections ?? model?.sections ?? version?.sections },
        words: version?.transcript ?? [],
      } : null);
      this.emit();
    } catch (error) { if (this.live && generation === this.generation) { this.error = reason(error); this.emit(); } }
  }
  enqueue(kind: Change['kind'], operation?: NewOperation, id?: string): Promise<boolean> {
    if (!this.committed) return Promise.resolve(false);
    this.generation++; this.error = null;
    return new Promise((done) => {
      const op = operation ? { ...operation, by: operation.by?.trim() ?? 'you', id: `optimistic:${crypto.randomUUID()}` } as Operation : undefined;
      this.queue.push({ kind, operation: op, id, done });
      pendingStarted(this.slug); this.emit(); void this.drain();
    });
  }
  private async drain() {
    if (this.running) return;
    this.running = true;
    while (this.queue.length) {
      const change = this.queue[0]!; const before = this.committed!;
      let ok = false;
      try {
        let list: EditList;
        if (change.kind === 'add') {
          const { id: _id, reversal: _reversal, ...operation } = change.operation!;
          list = await addOperation(this.slug, operation);
          const acknowledged = list.operations.at(-1);
          if (acknowledged) for (const next of this.queue.slice(1)) {
            if (next.id === change.operation!.id) next.id = acknowledged.id;
            if (next.operation) next.operation = bindTargets(next.operation, change.operation!.id, acknowledged.id) as Operation;
          }
        } else if (change.kind === 'remove') list = await removeOperation(this.slug, change.id!);
        else if (change.kind === 'undo') list = await undoEdit(this.slug);
        else if (change.kind === 'redo') list = await redoEdit(this.slug);
        else list = await cancelHandoff(this.slug);
        if (change.kind === 'add' || change.kind === 'remove') { this.undo.push(before); this.redo = []; }
        else if (change.kind === 'undo') { this.undo.pop(); this.redo.push(before); }
        else if (change.kind === 'redo') { this.redo.pop(); this.undo.push(before); }
        this.committed = list; ok = true;
      } catch (error) { this.error = reason(error); }
      this.queue.shift(); this.emit(); pendingFinished(this.slug); change.done(ok);
    }
    this.running = false;
    if (this.refreshAfter) { this.refreshAfter = false; void this.reload(); }
  }
  dispose() { this.live = false; this.generation++; }
}

/** The hook observes one reel session; old requests cannot publish into a newly selected reel. */
export function useEdits(slug: string | undefined, refresh: number): EditsState {
  const session = useRef<EditSession | null>(null);
  const [view, setView] = useState<{ slug: string; value: View } | null>(null);
  useEffect(() => {
    if (slug === undefined) { session.current = null; return; }
    const current = new EditSession(slug, (value) => setView({ slug, value }));
    session.current = current;
    return () => { current.dispose(); if (session.current === current) session.current = null; };
  }, [slug]);
  useEffect(() => { void session.current?.reload(); }, [slug, refresh]);
  const run = useCallback((kind: Change['kind'], operation?: NewOperation, id?: string) => {
    const current = session.current;
    return current && current.slug === slug ? current.enqueue(kind, operation, id) : Promise.resolve(false);
  }, [slug]);
  const add = useCallback((operation: NewOperation) => run('add', operation), [run]);
  const remove = useCallback(async (id: string) => { await run('remove', undefined, id); }, [run]);
  const undo = useCallback(async () => { await run('undo'); }, [run]);
  const redo = useCallback(async () => { await run('redo'); }, [run]);
  const endHandoff = useCallback(async () => { await run('handoff'); }, [run]);
  return { ...(view && view.slug === slug ? view.value : EMPTY), add, remove, undo, redo, cancelHandoff: endHandoff };
}
