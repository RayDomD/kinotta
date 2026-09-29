import { useCallback, useEffect, useState } from 'react';
import { addComment, deleteComment, editComment, fetchComments } from './api/index.ts';
import type { Comment, NewComment } from './api/index.ts';

export interface CommentsState {
  comments: Comment[];
  /** Set when the saved comments could not be read. */
  error: string | null;
  /** Saves a comment. Rejects with a readable message when the server refuses it. */
  save(input: NewComment): Promise<void>;
  /** Changes a comment's text. Rejects with a readable message when the server refuses it. */
  edit(id: string, text: string): Promise<void>;
  /** Removes a comment and its pin; the rest renumber. */
  remove(id: string): Promise<void>;
}

/**
 * The comments of one version, loaded when the version changes (or `refresh` does, when the server says its comments
 * changed) and renumbered by every save.
 */
export function useComments(slug: string | undefined, number: number | undefined, refresh = 0): CommentsState {
  const key = slug === undefined || number === undefined ? null : `${slug}/${number}`;
  const [loaded, setLoaded] = useState<{ key: string; comments: Comment[]; error: string | null } | null>(null);

  useEffect(() => {
    if (key === null || slug === undefined || number === undefined) return;
    let current = true;
    fetchComments(slug, number).then(
      (comments) => current && setLoaded({ key, comments, error: null }),
      (err: unknown) => current && setLoaded({ key, comments: [], error: err instanceof Error ? err.message : 'Could not reach the server' }),
    );
    return () => {
      current = false;
    };
  }, [key, slug, number, refresh]);

  const save = useCallback(
    async (input: NewComment) => {
      if (key === null || slug === undefined || number === undefined) throw new Error('No version is open.');
      const { comments } = await addComment(slug, number, input);
      setLoaded({ key, comments, error: null });
    },
    [key, slug, number],
  );

  const edit = useCallback(
    async (id: string, text: string) => {
      if (key === null || slug === undefined || number === undefined) throw new Error('No version is open.');
      const { comments } = await editComment(slug, number, id, text);
      setLoaded({ key, comments, error: null });
    },
    [key, slug, number],
  );

  const remove = useCallback(
    async (id: string) => {
      if (key === null || slug === undefined || number === undefined) throw new Error('No version is open.');
      setLoaded({ key, comments: await deleteComment(slug, number, id), error: null });
    },
    [key, slug, number],
  );

  const mine = loaded !== null && loaded.key === key ? loaded : null;
  return { comments: mine?.comments ?? [], error: mine?.error ?? null, save, edit, remove };
}
