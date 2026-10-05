import { useState } from 'react';
import { startReelFromBrief } from './api/index.ts';
import type { ReelSummary } from './api/index.ts';
import { CopyRequest } from './CopyRequest.tsx';
import { WaitingMark } from './Waiting.tsx';

interface BriefFormProps {
  /** Called with the new reel's slug once it is written. Its request is already on the clipboard when the browser allowed it. */
  onStarted(slug: string): void;
}

/** The "from a brief" half of New reel: a name and a short brief. Starting writes the reel and copies the request for whoever builds it. */
export function BriefForm({ onStarted }: BriefFormProps) {
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function start(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const { slug, request } = await startReelFromBrief({ title, brief });
      // The reel's page offers the request again, so a refused clipboard costs nothing.
      await navigator.clipboard.writeText(request).catch(() => undefined);
      onStarted(slug);
    } catch (err) {
      setBusy(false);
      setProblem(err instanceof Error ? err.message : 'Could not start the reel');
    }
  }

  return (
    <section className="rv-brief" aria-labelledby="rv-brief-title">
      <h3 id="rv-brief-title">Or start from a brief</h3>
      <p className="rv-lede">Kinotta copies a request for your agent. The reel waits in the list until it writes the shot list.</p>
      <form
        className="rv-name"
        onSubmit={(event) => {
          event.preventDefault();
          void start();
        }}
      >
        <label>
          <span className="label">Brief title</span>
          <input value={title} disabled={busy} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="rv-brief-text">
          <span className="label">Brief</span>
          <textarea rows={4} value={brief} disabled={busy} onChange={(event) => setBrief(event.target.value)} />
        </label>
        <button type="submit" className="btn" disabled={busy || title.trim() === '' || brief.trim() === ''}>Start from brief</button>
        {problem !== null && <span className="rv-problem" role="alert">{problem}</span>}
      </form>
    </section>
  );
}

/** What a reel started from a brief shows until its first version appears. */
export function BriefWaiting({ reel }: { reel: ReelSummary & { brief: NonNullable<ReelSummary['brief']> } }) {
  return (
    <main className="main" aria-label="Waiting for the shot list">
      <section className="rv-pick">
        <h2>{reel.title}</h2>
        <WaitingMark />
        <p className="rv-lede">Waiting for the shot list. This reel opens in Storyboard when the first version is written.</p>
        <p className="rv-brief-quote">{reel.brief.text}</p>
        <CopyRequest text={reel.brief.request} label="Copy request" />
      </section>
    </main>
  );
}
