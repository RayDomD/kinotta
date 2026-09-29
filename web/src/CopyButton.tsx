import { useEffect, useRef, useState } from 'react';
import { copyBatch } from './api/index.ts';

const CONFIRM_MS = 1400;

type Outcome =
  | { status: 'idle' }
  | { status: 'copied'; count: number }
  | { status: 'failed'; message: string };

/** Top bar button (disabled on a version that is read-only): saves the version's comment batch for Claude and puts the pasteable text on the clipboard. */
export function CopyButton({ slug, version, count, frozen = false }: { slug: string; version: number; count: number; frozen?: boolean }) {
  const [outcome, setOutcome] = useState<Outcome>({ status: 'idle' });
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy(): Promise<void> {
    window.clearTimeout(timer.current);
    setBusy(true);
    let saved: Awaited<ReturnType<typeof copyBatch>>;
    try {
      saved = await copyBatch(slug, version);
    } catch (err) {
      setBusy(false);
      setOutcome({ status: 'failed', message: `Could not save the comments. ${err instanceof Error ? err.message : 'Could not reach the server'}` });
      return;
    }
    setBusy(false);
    try {
      await navigator.clipboard.writeText(saved.text);
    } catch {
      setOutcome({ status: 'failed', message: `Saved to ${saved.file}, but the clipboard is not available. Ask Claude to read that file.` });
      return;
    }
    setOutcome({ status: 'copied', count: saved.count });
    timer.current = window.setTimeout(() => setOutcome({ status: 'idle' }), CONFIRM_MS);
  }

  const empty = count === 0;
  const copied = outcome.status === 'copied';
  return (
    <div className="copy">
      {outcome.status === 'failed' && <span className="copy-error">{outcome.message}</span>}
      <button
        type="button"
        className="btn"
        disabled={frozen || empty || busy}
        aria-label={frozen ? `Copy all comments, unavailable because v${version} is read-only` : empty ? 'Copy all comments, none yet' : copied ? 'Copied' : `Copy all comments, ${count}`}
        onClick={copy}
      >
        {copied ? 'Copied' : 'Copy all comments'}
        {!copied && <span className="count">{count}</span>}
      </button>
      <span className="sr-only" role="status">
        {copied ? `Copied ${outcome.count} ${outcome.count === 1 ? 'comment' : 'comments'} for Claude` : ''}
      </span>
    </div>
  );
}
