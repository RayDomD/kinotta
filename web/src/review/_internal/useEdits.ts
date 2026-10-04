import { useCallback, useEffect, useState } from 'react';
import { addOperation, discardEdits, fetchEdits, redoEdit, removeOperation, saveEdits, undoEdit } from '../../api/index.ts';
import type { EditList } from '../../api/index.ts';
import type { NewOperation } from '../../../../server/core/model.ts';

export interface EditsState {
  /** Null until the reel's list has arrived. */
  list: EditList | null;
  /** An add, a Discard or a Save is on its way. */
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
  discard(): Promise<void>;
  /** Builds the next version. Resolves with its number, or null when it failed (the list is kept; the reason is in `error`). */
  save(): Promise<number | null>;
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
      const list = await run((reel) => addOperation(reel, operation));
      if (list !== null && slug !== undefined) setLoaded({ slug, list });
      return list !== null;
    },
    [run, slug],
  );

  const change = useCallback(
    async (task: (reel: string) => Promise<EditList>) => {
      const list = await run(task);
      if (list !== null && slug !== undefined) setLoaded({ slug, list });
    },
    [run, slug],
  );
  const discard = useCallback(() => change(discardEdits), [change]);
  const remove = useCallback((id: string) => change((reel) => removeOperation(reel, id)), [change]);
  const undo = useCallback(() => change(undoEdit), [change]);
  const redo = useCallback(() => change(redoEdit), [change]);

  const save = useCallback(async () => {
    const version = await run((reel) => saveEdits(reel));
    if (version !== null && slug !== undefined) {
      const list = await fetchEdits(slug).catch(() => null);
      if (list !== null) setLoaded({ slug, list });
    }
    return version;
  }, [run, slug]);

  return { list: loaded !== null && loaded.slug === slug ? loaded.list : null, busy, error, add, remove, undo, redo, discard, save };
}
