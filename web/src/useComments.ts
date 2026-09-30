import { useCallback, useEffect, useState } from 'react';
import { addComment, deleteComment, editComment, fetchComments } from './api/index.ts';
import type { CarryNotice, Comment, NewComment } from './api/index.ts';

export interface CommentsState {
  comments: Comment[];
  /** Unsent comments the version before kept back because their section changed; null when there are none. */
  notCarried: CarryNotice | null;
  /** Set when the saved comments could not be read. */
  error: string | null;
  /** Saves a comment. Rejects with a readable message when the server refuses it. */
  save(input: NewComment): Promise<void>;
  /** Changes a comment's text. Rejects with a readable message when the server refuses it. */
  edit(id: string, text: string): Promise<void>;
  /** Removes a comment and its pin; the rest renumber. */
  remove(id: string): Promise<void>;
}

interface Loaded {
  key: string;
  comments: Comment[];
  notCarried: CarryNotice | null;
  error: string | null;
}

/**
 * The comments of one version, loaded when the version changes (or `refresh` does, when the server says its comments
 * changed) and renumbered by every save.
 */
export function useComments(slug: string | undefined, number: number | undefined, refresh = 0): CommentsState {
  const key = slug === undefined || number === undefined ? null : `${slug}/${number}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (key === null || slug === undefined || number === undefined) return;
    let current = true;
    fetchComments(slug, number).then(
      ({ comments, notCarried }) => current && setLoaded({ key, comments, notCarried, error: null }),
      (err: unknown) =>
        current && setLoaded({ key, comments: [], notCarried: null, error: err instanceof Error ? err.message : 'Could not reach the server' }),
    );
    return () => {
      current = false;
    };
  }, [key, slug, number, refresh]);

  /** A save answers with the version's comments; what was left behind by the version before does not change with them. */
  const replaceComments = useCallback(
    (forKey: string, comments: Comment[]) =>
      setLoaded((prev) => ({ key: forKey, comments, notCarried: prev?.key === forKey ? prev.notCarried : null, error: null })),
    [],
  );

  const save = useCallback(
    async (input: NewComment) => {
      if (key === null || slug === undefined || number === undefined) throw new Error('No version is open.');
      const { comments } = await addComment(slug, number, input);
      replaceComments(key, comments);
    },
    [key, slug, number, replaceComments],
  );

  const edit = useCallback(
    async (id: string, text: string) => {
      if (key === null || slug === undefined || number === undefined) throw new Error('No version is open.');
      const { comments } = await editComment(slug, number, id, text);
      replaceComments(key, comments);
    },
    [key, slug, number, replaceComments],
  );

  const remove = useCallback(
    async (id: string) => {
      if (key === null || slug === undefined || number === undefined) throw new Error('No version is open.');
      replaceComments(key, await deleteComment(slug, number, id));
    },
    [key, slug, number, replaceComments],
  );

  const mine = loaded !== null && loaded.key === key ? loaded : null;
  return { comments: mine?.comments ?? [], notCarried: mine?.notCarried ?? null, error: mine?.error ?? null, save, edit, remove };
}
