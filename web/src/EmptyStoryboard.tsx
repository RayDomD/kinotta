import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Comment, NewComment, Shot, TranscriptWord, Version } from './api/index.ts';
import { CopyRequest } from './CopyRequest.tsx';
import { NO_SHOT } from './sections.ts';
import { WordRow, isWordComment, wordLabel } from './Transcript.tsx';

export interface EmptyStoryboardProps {
  version: Version;
  comments: Comment[];
  /** An older version: words are shown but cannot be pinned, and nothing is copied. */
  readOnly: boolean;
  save(input: NewComment): Promise<void>;
}

/**
 * The Storyboard of a version with no shots (a reel with footage and no clips yet): what to do next, a copyable
 * request for b-roll, and the transcript to pin words on. The lanes under it are the Storyboard's own.
 */
export function EmptyStoryboard({ version, comments, readOnly, save }: EmptyStoryboardProps) {
  const [draftWord, setDraftWord] = useState<TranscriptWord | null>(null);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedLine, setSavedLine] = useState('');
  const words = version.transcript ?? [];
  // The transcript stands in for the one shot a word row needs: it spans the reel and owns every word.
  const transcriptShot: Shot = { number: NO_SHOT, start: 0, duration: version.duration, title: 'Transcript', description: '', words };
  const pins = comments.filter(isWordComment).filter((c) => c.pin.shot === NO_SHOT);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (draftWord === null || saving || text.trim() === '') return;
    setSaving(true);
    setError(null);
    try {
      await save({ pin: { kind: 'word', shot: NO_SHOT, time: draftWord.start, word: draftWord.text }, text });
      setSavedLine(`Comment saved on ${wordLabel(draftWord.text)}.`);
      setDraftWord(null);
      setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the comment');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="empty empty-board" role="status">
        <p>No clips in this reel yet.</p>
        {readOnly ? (
          <p className="meta">Newer versions can take a request for b-roll.</p>
        ) : (
          <>
            <p className="meta">Ask for b-roll to fill the storyboard. Pin words below to say where it should go.</p>
            {version.brollRequest !== undefined && <CopyRequest text={version.brollRequest} label="Copy request for b-roll" />}
          </>
        )}
        <div className="terrain" aria-hidden="true" />
      </div>
      {version.transcriptProblem !== undefined && <p className="meta">{version.transcriptProblem}</p>}
      {words.length > 0 && (
        <>
          <WordRow
            shots={[transcriptShot]}
            index={0}
            pins={pins}
            markedId={null}
            readOnly={readOnly}
            draftWord={draftWord}
            onPick={(word) => {
              setDraftWord(word);
              setText('');
              setError(null);
              setSavedLine('');
            }}
          />
          {draftWord !== null && !readOnly && (
            <div className="word-draft">
              <form className="draft" onSubmit={(event) => void submit(event)}>
                <input
                  key={draftWord.start}
                  autoFocus
                  type="text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  aria-label={`Comment on ${wordLabel(draftWord.text)}`}
                  placeholder="Add a comment…"
                  autoComplete="off"
                  disabled={saving}
                />
                <button type="button" className="draft-cancel" disabled={saving} onClick={() => setDraftWord(null)}>Cancel</button>
                {error !== null && <p role="alert" className="draft-error">{error}</p>}
              </form>
            </div>
          )}
          <p className="sheet-status" role="status">{savedLine}</p>
        </>
      )}
    </>
  );
}
