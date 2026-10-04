import { useEffect, useRef, useState } from 'react';

const CONFIRM_MS = 1400;

type Outcome = 'idle' | 'copied' | 'failed';

/** Puts a ready-made request on the clipboard. When the clipboard is not available the request is shown to copy by hand. */
export function CopyRequest({ text, label }: { text: string; label: string }) {
  const [outcome, setOutcome] = useState<Outcome>('idle');
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy(): Promise<void> {
    window.clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(text);
      setOutcome('copied');
      timer.current = window.setTimeout(() => setOutcome('idle'), CONFIRM_MS);
    } catch {
      setOutcome('failed');
    }
  }

  return (
    <div className="copy-request">
      <button type="button" className="btn" onClick={() => void copy()}>
        {outcome === 'copied' ? 'Copied' : label}
      </button>
      <span className="sr-only" role="status">{outcome === 'copied' ? 'Request copied' : ''}</span>
      {outcome === 'failed' && (
        <>
          <p role="alert" className="rv-problem">The clipboard is not available. Copy the request from here.</p>
          <textarea readOnly rows={6} value={text} aria-label="Request" onFocus={(e) => e.currentTarget.select()} />
        </>
      )}
    </div>
  );
}
