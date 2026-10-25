import { useEffect, useState } from 'react';
import { fetchRenderSettings, renderFileUrl, renderWorking, subscribe } from './api/_internal/client.ts';
import type { RenderJob } from './api/_internal/client.ts';

/**
 * Simple preview's Export: renders Working as a Final MP4 (freezing it as the next version, as Final always does) and
 * follows the job to a file to save. Mix overloads and other refusals are shown as they come; the full editor has the
 * render settings.
 */
export function SimpleExport({ slug }: { slug: string }) {
  const [job, setJob] = useState<RenderJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  useEffect(() => { setJob(null); setProblem(''); }, [slug]);
  useEffect(() => {
    if (!job || job.state === 'done' || job.state === 'failed' || job.state === 'cancelled') return;
    return subscribe((event) => {
      if (event.type === 'render-progress' && event.job.id === job.id) setJob(event.job);
    });
  }, [job?.id, job?.state]);

  const exportReel = () => {
    setBusy(true);
    setProblem('');
    fetchRenderSettings(slug)
      .then((settings) => renderWorking(slug, 'final', settings.final))
      .then(setJob, (err: unknown) => setProblem(err instanceof Error ? err.message : 'Could not export the reel.'))
      .finally(() => setBusy(false));
  };

  const running = job !== null && (job.state === 'queued' || job.state === 'running');
  const file = job?.state === 'done' ? job.output?.split('/').at(-1) : undefined;
  return (
    <div className="dx-export">
      <button type="button" className="dx-export-go" disabled={busy || running} onClick={exportReel}>
        {running ? <>Exporting <span className="dx-num">{Math.floor(job.progress * 100)}%</span></> : <>Export <span aria-hidden="true">→</span></>}
      </button>
      <span className="dx-export-status" role="status">
        {file && <a href={renderFileUrl(slug, file)} download={file}>Save {file}</a>}
        {job?.state === 'failed' && (job.error ?? 'The export failed.')}
      </span>
      {problem && <span className="dx-export-status" role="alert">{problem}</span>}
    </div>
  );
}
