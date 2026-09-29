import { useCallback, useEffect, useState } from 'react';
import { addComment, fetchComments } from './api/index.ts';
import type { Comment, NewComment } from './api/index.ts';

export interface CommentsState {
  comments: Comment[];
  /** Set when the saved comments could not be read. */
  error: string | null;
  /** Saves a comment. Rejects with a readable message when the server refuses it. */
  save(input: NewComment): Promise<void>;
}

/** The comments of one version, loaded when the version changes and renumbered by every save. */
export function useComments(slug: string | undefined, number: number | undefined): CommentsState {
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
  }, [key, slug, number]);

  const save = useCallback(
    async (input: NewComment) => {
      if (key === null || slug === undefined || number === undefined) throw new Error('No version is open.');
      const { comments } = await addComment(slug, number, input);
      setLoaded({ key, comments, error: null });
    },
    [key, slug, number],
  );

  const mine = loaded !== null && loaded.key === key ? loaded : null;
  return { comments: mine?.comments ?? [], error: mine?.error ?? null, save };
}
