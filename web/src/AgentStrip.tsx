import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AGENT_PROVIDER_LABELS,
  cancelReelAgentJob,
  copyReelAgentJob,
  fetchReelAgentJob,
  retryReelAgentJob,
  subscribe,
  type AgentJob,
  type AgentJobState,
} from './api/_internal/client.ts';
import { formatClock } from './timecode.ts';

const TIMER_TICK_MS = 1000;
const JOB_POLL_MS = 3000;
const ACTIVE_JOB_STATES: AgentJobState[] = ['queued', 'running', 'validating', 'cancelling'];
const STAGE_LABELS: Partial<Record<AgentJobState, string>> = {
  queued: 'Preparing the request',
  validating: 'Checking the result',
  cancelling: 'Cancelling',
  failed: 'Failed',
  interrupted: 'Failed',
  cancelled: 'Cancelled',
  'copy-ready': 'Waiting for your agent',
};
const isActive = (job: AgentJob | null) => job !== null && ACTIVE_JOB_STATES.includes(job.state);

function AgentRunTimer({ job, active }: { job: AgentJob; active: boolean }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), TIMER_TICK_MS);
    return () => clearInterval(timer);
  }, [job.id, active]);
  const elapsed = active
    ? Math.max(job.elapsedSeconds, Math.floor((now - Date.parse(job.createdAt)) / TIMER_TICK_MS))
    : job.elapsedSeconds;
  const clock = formatClock(elapsed).replace(/^0(?=\d:)/, '');
  return <span className="agent-strip-timer" role="timer" aria-live="off" aria-label={`${active ? 'Agent run elapsed' : 'Agent run total'}: ${clock}`}>
    {active ? 'Elapsed ' : 'Took '}<span className="num">{clock}</span>
  </span>;
}

/** One job controller stays mounted in App; its notice follows the current page's header slot. */
export function AgentStrip({ slug, title, nextVersion, target, onActiveChange, onRefresh, onOpenVersion }: {
  slug?: string;
  title?: string;
  nextVersion: number;
  target: HTMLElement | null;
  onActiveChange(active: boolean): void;
  onRefresh(): void;
  onOpenVersion(number: number): void;
}) {
  const [job, setJob] = useState<AgentJob | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [request, setRequest] = useState('');
  const revision = useRef(0);
  const currentSlug = useRef(slug);
  currentSlug.current = slug;
  const refreshed = useRef<string | null>(null);
  const currentJob = job?.reel === slug ? job : null;
  const active = isActive(currentJob);

  useEffect(() => {
    let disposed = false;
    setJob(null);
    setDismissed(null);
    setBusy(false);
    setError('');
    setStatus('');
    setRequest('');
    refreshed.current = null;
    revision.current++;
    if (!slug) return;
    const initialRevision = revision.current;
    void fetchReelAgentJob(slug).then((loaded) => {
      if (!disposed && initialRevision === revision.current) setJob(loaded);
    }).catch(() => {});
    const unsubscribe = subscribe((event) => {
      if (event.type === 'agent-progress' && event.reel === slug) {
        revision.current++;
        setJob(event.job);
      }
    });
    return () => { disposed = true; unsubscribe(); };
  }, [slug]);

  useEffect(() => {
    onActiveChange(active);
  }, [active, onActiveChange]);

  useEffect(() => {
    if (!currentJob || currentJob.state !== 'succeeded' || refreshed.current === currentJob.id) return;
    refreshed.current = currentJob.id;
    onRefresh();
  }, [currentJob, onRefresh]);

  useEffect(() => {
    if (!slug || !active) return;
    let disposed = false;
    const timer = setInterval(() => {
      const polledRevision = revision.current;
      void fetchReelAgentJob(slug).then((loaded) => {
        if (!disposed && polledRevision === revision.current && loaded) setJob(loaded);
      }).catch(() => {});
    }, JOB_POLL_MS);
    return () => { disposed = true; clearInterval(timer); };
  }, [slug, active]);

  // A retried job must not inherit the previous request, error, or clipboard notice.
  useEffect(() => {
    setError(''); setStatus(''); setRequest('');
  }, [currentJob?.id]);

  const act = async (action: 'cancel' | 'retry' | 'copy') => {
    if (!slug || busy) return;
    const actionSlug = slug;
    setBusy(true); setError(''); setStatus(''); setRequest('');
    try {
      if (action === 'copy') {
        const result = await copyReelAgentJob(slug);
        if (currentSlug.current !== actionSlug) return;
        try {
          await navigator.clipboard.writeText(result.request);
          if (currentSlug.current === actionSlug) setStatus('Agent request copied.');
        } catch {
          if (currentSlug.current === actionSlug) {
            setRequest(result.request);
            setStatus('Copy the request below and paste it into your agent.');
          }
        }
      } else {
        const updated = await (action === 'cancel' ? cancelReelAgentJob(slug) : retryReelAgentJob(slug));
        if (currentSlug.current !== actionSlug) return;
        revision.current++;
        setJob(updated);
      }
    } catch (failure) {
      if (currentSlug.current === actionSlug) setError(failure instanceof Error ? failure.message : 'Could not complete that action. Try again.');
    } finally {
      if (currentSlug.current === actionSlug) setBusy(false);
    }
  };

  if (!target || !currentJob || currentJob.id === dismissed) return null;
  const ready = currentJob.state === 'succeeded';
  const failed = currentJob.state === 'failed' || currentJob.state === 'interrupted';
  const cancelled = currentJob.state === 'cancelled';
  const copy = !ready && !failed && !cancelled && (currentJob.state === 'copy-ready' || (currentJob.provider === 'copy' && !active));
  const stage = currentJob.state === 'running'
    ? `${AGENT_PROVIDER_LABELS[currentJob.provider]} is choosing and building cutaways`
    : STAGE_LABELS[currentJob.state];
  const displayTitle = title ?? slug ?? 'this reel';
  return createPortal(
    <section className="agent-strip" data-state={currentJob.state} data-active={active} aria-label="B-roll progress">
      <div className="agent-strip-row">
        <div className="agent-strip-what" role="status">
          <b>{ready ? (currentJob.provider === 'copy' ? 'Your agent finished' : `B-roll for ${displayTitle} is ready`) : failed ? 'Failed' : cancelled ? 'Cancelled' : copy ? `B-roll for ${displayTitle}` : `Adding b-roll to ${displayTitle}`}</b>
          {!ready && !failed && !cancelled && <span className="agent-strip-stage">{stage}</span>}
          {currentJob.quiet && active && <span className="agent-strip-quiet">Running, no recent output</span>}
          {currentJob.error && <span className="agent-strip-error">{currentJob.error}</span>}
        </div>
        <span className="agent-strip-track" aria-hidden="true"><i /></span>
        <AgentRunTimer job={currentJob} active={active} />
        <div className="agent-strip-actions">
          {active && <button type="button" className="c-act" disabled={busy || currentJob.state === 'cancelling'} onClick={() => void act('cancel')}>Cancel</button>}
          {ready && currentJob.version !== undefined && <button type="button" className="btn" onClick={() => { onOpenVersion(currentJob.version!); setDismissed(currentJob.id); }}>Open v<span className="num">{currentJob.version}</span></button>}
          {!active && (failed || cancelled || currentJob.canRetry) && <button type="button" className="c-act" disabled={busy} onClick={() => void act('retry')}>Retry</button>}
          {copy && <button type="button" className="btn" disabled={busy || !currentJob.canCopy} onClick={() => void act('copy')}>Copy request</button>}
          {(ready || cancelled || failed) && <button type="button" className="c-act" onClick={() => setDismissed(currentJob.id)}>Dismiss</button>}
        </div>
      </div>
      {copy && <p className="agent-strip-next">Paste it into your agent. Kinotta loads v<span className="num">{currentJob.version ?? nextVersion}</span> when it's done.</p>}
      <p className="agent-strip-message" role="status" aria-live="polite" hidden={!status}>{status}</p>
      {error && <p className="agent-strip-error" role="alert">{error}</p>}
      {request && <label className="agent-strip-request">Agent request<textarea aria-label="Agent request" readOnly value={request} rows={6} /></label>}
    </section>, target,
  );
}
