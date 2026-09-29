import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchNote, saveNote } from './api/index.ts';

const SAVE_PAUSE_MS = 600;

export type NoteStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface NoteState {
  /** False until the version's saved note has been read. */
  loaded: boolean;
  /** What the reviewer sees: the saved note plus anything typed since. */
  text: string;
  status: NoteStatus;
  /** Set when the note could not be read or saved. */
  error: string | null;
  /** Typing: keeps the text and saves it after a short pause. */
  edit(text: string): void;
  /** Saves any unsaved text now. Never rejects; a failure shows in `status` and `error`. */
  flush(): Promise<void>;
}

/** The note on the whole reel for one version: loaded when the version changes, saved on a pause in typing, on blur and before a copy. */
export function useNote(slug: string | undefined, number: number | undefined): NoteState {
  const key = slug === undefined || number === undefined ? null : `${slug}/${number}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<NoteStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const textRef = useRef('');
  const savedRef = useRef('');
  const timer = useRef<number | undefined>(undefined);
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (slug === undefined || number === undefined || key === null) return;
    let current = true;
    setLoadedKey(null);
    setStatus('idle');
    setError(null);
    fetchNote(slug, number).then(
      (note) => {
        if (!current) return;
        textRef.current = note;
        savedRef.current = note;
        setText(note);
        setLoadedKey(key);
      },
      (err: unknown) => {
        if (!current) return;
        textRef.current = '';
        savedRef.current = '';
        setText('');
        setError(err instanceof Error ? err.message : 'Could not reach the server');
        setLoadedKey(key);
      },
    );
    return () => {
      current = false;
      window.clearTimeout(timer.current);
      // Leaving a version with unsaved typing still saves it.
      if (loadedKeyRef.current === key && textRef.current !== savedRef.current) {
        saveNote(slug, number, textRef.current).catch(() => undefined);
      }
    };
  }, [key, slug, number]);

  const loadedKeyRef = useRef<string | null>(null);
  loadedKeyRef.current = loadedKey;

  const flush = useCallback((): Promise<void> => {
    window.clearTimeout(timer.current);
    if (slug === undefined || number === undefined) return Promise.resolve();
    queue.current = queue.current.then(async () => {
      const value = textRef.current;
      if (value === savedRef.current) return;
      setStatus('saving');
      try {
        await saveNote(slug, number, value);
        savedRef.current = value;
        setError(null);
        setStatus(textRef.current === value ? 'saved' : 'saving');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not reach the server');
        setStatus('error');
      }
    });
    return queue.current;
  }, [slug, number]);

  const edit = useCallback(
    (next: string) => {
      textRef.current = next;
      setText(next);
      setStatus('idle');
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), SAVE_PAUSE_MS);
    },
    [flush],
  );

  const mine = key !== null && loadedKey === key;
  return { loaded: mine, text: mine ? text : '', status, error, edit, flush };
}
