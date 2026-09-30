import { useEffect, useId, useRef, useState } from 'react';
import { copyBatch } from './api/index.ts';

const CONFIRM_MS = 1400;

type Outcome =
  | { status: 'idle' }
  | { status: 'copied'; count: number }
  | { status: 'failed'; message: string };

/** Top bar button (disabled on a version that is read-only): saves the version's comment batch for Claude and puts the pasteable text on the clipboard. */
export function CopyButton(props: {
  slug: string;
  version: number;
  count: number;
  /** The version has a note on the whole reel, which the batch then carries. */
  hasNote?: boolean;
  /** Runs before the batch is saved, so a note still being typed is in it. */
  beforeCopy?(): Promise<void>;
  frozen?: boolean;
  /** The version's contract issues (plain words), and the ones only this browser saw. When there are any, the batch can include them. */
  issues?: { all: string[]; runtime: string[] };
  /** On a reel with several sections: the one on screen, which is what the button copies. */
  section?: { id: string; number: string } | null;
  /** Runs once the batch is saved, so the version can show what the copy changed (a section now waiting). */
  onSaved?(): void;
}) {
  const { slug, version, count, hasNote = false, beforeCopy, frozen = false, issues, section = null, onSaved } = props;
  const includeId = useId();
  const [includeIssues, setIncludeIssues] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>({ status: 'idle' });
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy(): Promise<void> {
    window.clearTimeout(timer.current);
    setBusy(true);
    await beforeCopy?.();
    let saved: Awaited<ReturnType<typeof copyBatch>>;
    try {
      saved = await copyBatch(slug, version, {
        section: section?.id,
        ...(includeIssues && issues ? { includeIssues: true, runtimeIssues: issues.runtime } : {}),
      });
    } catch (err) {
      setBusy(false);
      setOutcome({ status: 'failed', message: `Could not save the comments. ${err instanceof Error ? err.message : 'Could not reach the server'}` });
      return;
    }
    setBusy(false);
    onSaved?.();
    try {
      await navigator.clipboard.writeText(saved.text);
    } catch {
      setOutcome({ status: 'failed', message: `Saved to ${saved.file}, but the clipboard is not available. Ask Claude to read that file.` });
      return;
    }
    setOutcome({ status: 'copied', count: saved.count });
    timer.current = window.setTimeout(() => setOutcome({ status: 'idle' }), CONFIRM_MS);
  }

  const what = section ? `section ${section.number} comments` : 'all comments';
  const empty = count === 0 && !hasNote;
  const withNote = hasNote ? ', and the reel note' : '';
  const copied = outcome.status === 'copied';
  return (
    <div className="copy">
      {outcome.status === 'failed' && <span className="copy-error">{outcome.message}</span>}
      {!frozen && issues !== undefined && issues.all.length > 0 && (
        <span className="copy-issues">
          <input id={includeId} type="checkbox" checked={includeIssues} onChange={(e) => setIncludeIssues(e.target.checked)} />
          <label htmlFor={includeId}>Include contract issues</label>
        </span>
      )}
      <button
        type="button"
        className="btn"
        disabled={frozen || empty || busy}
        aria-label={frozen ? `Copy ${what}, unavailable because v${version} is read-only` : empty ? `Copy ${what}, none yet` : copied ? 'Copied' : `Copy ${what}, ${count}${withNote}`}
        onClick={copy}
      >
        {copied ? 'Copied' : `Copy ${what}`}
        {!copied && <span className="count">{count}</span>}
      </button>
      <span className="sr-only" role="status">
        {copied ? `Copied ${outcome.count} ${outcome.count === 1 ? 'comment' : 'comments'} for Claude` : ''}
      </span>
    </div>
  );
}
