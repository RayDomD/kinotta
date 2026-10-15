import { useCallback, useEffect, useState } from 'react';
import { addOperation, cancelHandoff, fetchEdits, redoEdit, removeOperation, undoEdit } from '../../api/index.ts';
import type { EditList } from '../../api/index.ts';
import type { NewOperation } from '../../../../server/core/model.ts';

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

const reason = (err: unknown): string => (err instanceof Error ? err.message : 'Could not reach the server.');

/** The reel's edit list, and the changes to it. Loaded again for each reel and whenever `refresh` changes. */
export function useEdits(slug: string | undefined, refresh: number): EditsState {
  const [loaded, setLoaded] = useState<{ slug: string; list: EditList } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (slug === undefined) return;
    let current = true;
    setError(null);
    fetchEdits(slug).then(
      (list) => current && setLoaded({ slug, list }),
      (err: unknown) => current && setError(reason(err)),
    );
    return () => {
      current = false;
    };
  }, [slug, refresh]);

  const run = useCallback(
    async <T,>(task: (reel: string) => Promise<T>): Promise<T | null> => {
      if (slug === undefined) return null;
      setBusy(true);
      setError(null);
      try {
        return await task(slug);
      } catch (err) {
        setError(reason(err));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [slug],
  );

  const add = useCallback(
    async (operation: NewOperation) => {
      // The list lands in the same render that ends `busy`, so a dragged clip goes straight to its new place.
      const list = await run(async (reel) => {
        const next = await addOperation(reel, operation);
        setLoaded({ slug: reel, list: next });
        return next;
      });
      return list !== null;
    },
    [run, slug],
  );

  const change = useCallback(
    async (task: (reel: string) => Promise<EditList>) => {
      await run(async (reel) => setLoaded({ slug: reel, list: await task(reel) }));
    },
    [run, slug],
  );
  const endHandoff = useCallback(() => change(cancelHandoff), [change]);
  const remove = useCallback((id: string) => change((reel) => removeOperation(reel, id)), [change]);
  const undo = useCallback(() => change(undoEdit), [change]);
  const redo = useCallback(() => change(redoEdit), [change]);


  return { list: loaded !== null && loaded.slug === slug ? loaded.list : null, busy, error, add, remove, undo, redo, cancelHandoff: endHandoff };
}
