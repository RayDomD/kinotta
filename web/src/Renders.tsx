import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { cancelRender, fetchOverload, fetchRenders, fetchRenderSettings, queueRender, renderFileUrl, revealRender, renderWorking } from './api/index.ts';
import type { MixOverload, RenderFile, RenderJob, RenderPreset, RenderSettings, VersionEntry } from './api/index.ts';
import { describeOverload } from '../../server/core/model.ts';
import { formatRemaining } from './timecode.ts';

const PRESETS: ReadonlyArray<{ id: RenderPreset; name: string }> = [
  { id: 'draft', name: 'Draft' },
  { id: 'final', name: 'Final' },
  { id: 'overlay', name: 'Overlay' },
];
const FPS_OPTIONS: ReadonlyArray<{ value: RenderSettings['fps']; name: string }> = [
  { value: 'source', name: 'Source' },
  { value: 24, name: '24' },
  { value: 25, name: '25' },
  { value: 30, name: '30' },
  { value: 60, name: '60' },
];
const SIZE_OPTIONS: ReadonlyArray<{ value: RenderSettings['size']; name: string }> = [
  { value: 'half', name: 'Half' },
  { value: 'source', name: 'Source' },
  { value: '1080p', name: '1080p' },
  { value: '4k', name: '4K' },
];
const QUALITY_OPTIONS: ReadonlyArray<{ value: RenderSettings['quality']; name: string }> = [
  { value: 'standard', name: 'Standard' },
  { value: 'high', name: 'High' },
];
const AUDIO_OPTIONS: ReadonlyArray<{ value: RenderSettings['audio']; name: string }> = [
  { value: 'smooth', name: 'Smooth' },
  { value: 'hard', name: 'Hard' },
];
/** Browsers play H.264 but not ProRes, so only an `.mp4` render plays in Kinotta. */
const PLAYABLE = /\.mp4$/i;

export const presetName = (preset: RenderPreset): string => PRESETS.find((p) => p.id === preset)?.name ?? preset;
const PERCENT = 100;
/** `42%`, a job's progress in whole percents. */
export const percent = (job: RenderJob): string => `${Math.floor(job.progress * PERCENT)}%`;
/** `about 2 min left`: a running job's estimate, as the queue says it. */
function timeLeft(job: RenderJob): string {
  if (job.remaining === null) return 'starting';
  return job.remaining <= 0 ? 'almost done' : `about ${formatRemaining(job.remaining)} left`;
}
/** The file a finished job wrote, from its project-relative output path. */
export const outputFile = (job: RenderJob): string | null => job.output?.split('/').at(-1) ?? null;
const when = (iso: string): string => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * A button that opens a panel under it: Escape or a press outside closes it and gives focus back to the button. The
 * panel is a dialog named `label`, its first control focused on open.
 */
function Popover({ label, button, buttonDescriptionId, className, buttonClass, children, open, onOpen }: {
  label: string;
  button: ReactNode;
  buttonDescriptionId?: string;
  className: string;
  buttonClass: string;
  children: ReactNode;
  open: boolean;
  onOpen(open: boolean): void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('input, select, button')?.focus();
    const close = (refocus: boolean): void => {
      onOpen(false);
      if (refocus) trigger.current?.focus();
    };
    const key = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      close(true);
    };
    const press = (e: PointerEvent): void => {
      const target = e.target as Node;
      if (!panel.current?.contains(target) && !trigger.current?.contains(target)) close(false);
    };
    window.addEventListener('keydown', key, true);
    window.addEventListener('pointerdown', press, true);
    return () => {
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('pointerdown', press, true);
    };
  }, [open, onOpen]);
  return (
    <span className="popover-anchor">
      <button ref={trigger} type="button" className={buttonClass} aria-label={label} aria-describedby={buttonDescriptionId} aria-haspopup="dialog" aria-expanded={open} onClick={() => onOpen(!open)}>
        {button}
      </button>
      {open && (
        <div ref={panel} className={`popover ${className}`} role="dialog" aria-label={label}>
          {children}
        </div>
      )}
    </span>
  );
}

export interface VersionActionsProps {
  slug: string;
  /** The version on show, from the reel's version list; absent while it loads. */
  entry: VersionEntry | undefined;
  /** The reel has footage, so its audio joins at cuts. */
  footage: boolean;
  /** Render the durable Working reel rather than the numbered snapshot. */
  working?: boolean;
  nextVersion?: number;
  /** A render boundary captured Working, so refresh the version rail. */
  onSaved?(version: number): void;
}

/** Render the current reel, by the reel's title in Review (mockup option C). */
function actionsVerifyAttrs(working: boolean, busy: boolean) {
  return { 'data-verify-unit': 'VersionActions', 'data-verify-working': String(working), 'data-verify-busy': String(busy) };
}

export function VersionActions({ slug, entry, footage, working = false, nextVersion, onSaved }: VersionActionsProps) {
  const number = entry?.number;
  return (
    <div className="rv-actions" role="group" aria-label="Version actions" {...actionsVerifyAttrs(working, false)}>
      <RenderPopover key={`${slug}/${number ?? 'loading'}`} slug={slug} version={number} footage={footage} working={working} nextVersion={nextVersion} onSaved={onSaved} />
    </div>
  );
}

export interface RenderPlayerProps {
  slug: string;
  file: string;
  version: number | undefined;
  onBack(): void;
}

/** A finished render, played in place of the version. */
export function RenderPlayer({ slug, file, version, onBack }: RenderPlayerProps) {
  return (
    <>
      <div className="head">
        <span className="meta">{file}</span>
        {version !== undefined && (
          <button type="button" className="c-act" onClick={onBack}>{`Back to v${version}`}</button>
        )}
      </div>
      <div className="well rv-well">
        <video className="pk-video" src={renderFileUrl(slug, file)} controls aria-label={`Render ${file}`} />
      </div>
    </>
  );
}

function Choice<T extends string | number>(props: { label: string; value: T; options: ReadonlyArray<{ value: T; name: string }>; onChange(value: T): void }) {
  const { label, value, options, onChange } = props;
  return (
    <label className="pk-field">
      <span className="label">{label}</span>
      <select value={String(value)} onChange={(e) => onChange(options.find((o) => String(o.value) === e.target.value)!.value)}>
        {options.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>{option.name}</option>
        ))}
      </select>
    </label>
  );
}

/** Preset settings for Working or the explicit numbered snapshot on show. */
function RenderPopover({ slug, version, footage, working = false, nextVersion, onSaved }: { slug: string; version: number | undefined; footage: boolean; working?: boolean; nextVersion?: number; onSaved?(version: number): void }) {
  const [open, setOpen] = useState(false);
  const presetsName = useId();
  const [saved, setSaved] = useState<{ slug: string; settings: Record<RenderPreset, RenderSettings> } | null>(null);
  const [preset, setPreset] = useState<RenderPreset>('draft');
  const [settings, setSettings] = useState<RenderSettings | null>(null);
  const [sending, setSending] = useState(false);
  const [refusal, setRefusal] = useState('');
  const [status, setStatus] = useState('');
  const [settingsError, setSettingsError] = useState('');

  useEffect(() => {
    let live = true;
    fetchRenderSettings(slug).then(
      (loaded) => {
        if (!live) return;
        setSaved({ slug, settings: loaded });
        setSettings(loaded[preset]);
      },
      (err: unknown) => {
        if (live) setSettingsError(err instanceof Error ? err.message : 'Could not load render settings');
      },
    );
    return () => {
      live = false;
    };
    // The form follows the preset from here on; only a new reel reloads what is saved.
  }, [slug]);

  const pickPreset = (next: RenderPreset): void => {
    setPreset(next);
    setRefusal('');
    if (saved?.slug === slug) setSettings(saved.settings[next]);
  };
  const set = <K extends keyof RenderSettings>(key: K) => (value: RenderSettings[K]): void => setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));

  const target = working ? 'working' : 'saved';
  const overloadKey = version === undefined || preset === 'overlay' ? null : `${target}/${version}`;
  const [measured, setMeasured] = useState<{ key: string; overload: MixOverload } | null>(null);
  const [accepted, setAccepted] = useState(false);
  useEffect(() => {
    setAccepted(false);
    if (!open || overloadKey === null) return;
    let live = true;
    // A failed measurement shows nothing here: the render itself still refuses an overloaded mix with the reason.
    fetchOverload(slug, working ? undefined : version).then((overload) => live && setMeasured({ key: overloadKey, overload }), () => undefined);
    return () => {
      live = false;
    };
  }, [open, overloadKey, slug, target, version]);
  const overload = measured !== null && measured.key === overloadKey && measured.overload.spans.length > 0 ? measured.overload : null;
  const render = (): void => {
    if (version === undefined || settings === null) return;
    setSending(true);
    setRefusal('');
    setStatus('');
    const remembered = (): void => {
      // What Render saved is what this preset starts from next time.
      setSaved((prev) => (prev?.slug === slug ? { slug, settings: { ...prev.settings, [preset]: settings } } : prev));
    };
    (working
      ? renderWorking(slug, preset, settings, overload !== null && accepted).then((job) => {
          remembered();
          setStatus(`${job.working ? 'Working' : `v${job.version}`} ${presetName(preset)} queued.`);
          onSaved?.(job.version);
        })
      : queueRender(slug, version, preset, settings, overload !== null && accepted).then(() => {
          remembered();
          setStatus(`v${version} ${presetName(preset)} queued.`);
        }))
      .catch((err: unknown) => setRefusal(err instanceof Error ? err.message : 'Could not reach the server'))
      .finally(() => setSending(false));
  };

  const label = working ? 'Render Working' : version === undefined ? 'Render' : `Render v${version}`;
  const action = 'Render';
  return (
    <Popover label={label} button={<>Render <span aria-hidden="true">▾</span></>} buttonClass="btn" className="pk-render" open={open} onOpen={setOpen}>
      <h2>{label}</h2>
      <fieldset className="pk-presets">
        <legend className="label">Preset</legend>
        {PRESETS.map((p) => (
          <label key={p.id} className="pk-preset">
            <input type="radio" name={presetsName} value={p.id} checked={preset === p.id} onChange={() => pickPreset(p.id)} />
            <span>{working ? p.id === 'draft' ? 'Draft of Working' : `${p.name}, freezes as v${nextVersion ?? version}` : p.name}</span>
          </label>
        ))}
      </fieldset>
      {settings !== null && (
        <div className="pk-settings">
          <Choice label="Frame rate" value={settings.fps} options={FPS_OPTIONS} onChange={set('fps')} />
          <Choice label="Size" value={settings.size} options={SIZE_OPTIONS} onChange={set('size')} />
          <Choice label="Quality" value={settings.quality} options={QUALITY_OPTIONS} onChange={set('quality')} />
          {footage && <Choice label="Audio at cuts" value={settings.audio} options={AUDIO_OPTIONS} onChange={set('audio')} />}
        </div>
      )}
      {settings === null && settingsError === '' && <p className="pk-message" role="status">Loading render settings…</p>}
      {settingsError !== '' && <p className="pk-refusal" role="alert">{settingsError}</p>}
      {overload !== null && (
        <div className="pk-overload">
          <p className="pk-refusal" role="alert">{`The mix goes above full scale at ${describeOverload(overload)}. Lower a level in the editor, or render it as it is.`}</p>
          <label className="pk-preset">
            <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
            <span>Render with the overload</span>
          </label>
        </div>
      )}
      <button type="button" className="btn" disabled={version === undefined || settings === null || sending || (overload !== null && !accepted)} onClick={render}>
        {action}
      </button>
      {refusal !== '' && <p className="pk-refusal" role="alert">{refusal}</p>}
      <p className="pk-message" role="status">{status}</p>
    </Popover>
  );
}

export interface RenderMenuProps {
  /** The open reel, whose past renders the menu lists; absent with no reel open. */
  slug: string | undefined;
  /** The project's queue: the running job first, then the waiting ones, for any reel. */
  jobs: RenderJob[];
  /** Reel titles by slug, to name a job of another reel. */
  titles: ReadonlyMap<string, string>;
  /** The last render that failed, until another is queued. */
  failure: RenderJob | null;
  /** Changes when a render of the open reel finishes, so the past renders reload. */
  rendersTick: number;
  onPlay(file: string): void;
}

interface PastRendersState {
  slug: string;
  tick: number;
  state: 'loading' | 'ready' | 'error';
  renders: RenderFile[];
  error?: string;
}

/** `Rendering v2 Draft 42% · 1 waiting`, or Renders: the top bar's button, on every tab, opening the queue and past renders. */
export function RenderMenu({ slug, jobs, titles, failure, rendersTick, onPlay }: RenderMenuProps) {
  const statusId = useId();
  const [open, setOpen] = useState(false);
  const [past, setPast] = useState<PastRendersState | null>(null);
  const [revealError, setRevealError] = useState('');
  const [cancelError, setCancelError] = useState('');

  useEffect(() => {
    if (slug === undefined || !open) return;
    let live = true;
    setPast({ slug, tick: rendersTick, state: 'loading', renders: [] });
    fetchRenders(slug).then(
      (renders) => {
        if (live) setPast({ slug, tick: rendersTick, state: 'ready', renders });
      },
      (err: unknown) => {
        if (live) setPast({ slug, tick: rendersTick, state: 'error', renders: [], error: err instanceof Error ? err.message : 'Could not load past renders' });
      },
    );
    return () => {
      live = false;
    };
  }, [slug, rendersTick, open]);
  const currentPast = past !== null && past.slug === slug && past.tick === rendersTick ? past : null;

  const running = jobs.find((job) => job.state === 'running');
  const waiting = jobs.filter((job) => job.state === 'queued').length;
  const jobName = (job: RenderJob): string => `${job.reel === slug ? '' : `${titles.get(job.reel) ?? job.reel} `}${job.working ? 'Working' : `v${job.version}`} ${presetName(job.preset)}`;
  const status = running !== undefined
    ? `Rendering ${jobName(running)}.${waiting > 0 ? ` ${waiting} waiting.` : ''}`
    : waiting > 0 ? `${waiting} waiting to render.` : failure !== null ? 'Render failed.' : 'No renders in progress.';
  const cancel = (job: RenderJob): void => {
    setCancelError('');
    // The job leaves the queue when its render-progress event says it is cancelled.
    cancelRender(job.id).catch((err: unknown) => setCancelError(err instanceof Error ? err.message : 'Could not reach the server'));
  };
  const reveal = (file: string): void => {
    if (slug === undefined) return;
    setRevealError('');
    revealRender(slug, file).catch((err: unknown) => setRevealError(err instanceof Error ? err.message : 'Could not reach the server'));
  };

  const summary = (
    <span className="tb-render">
      {running !== undefined && (
        <span>
          {`Rendering ${jobName(running)} `}
          <span className="dot">{percent(running)}</span>
        </span>
      )}
      {waiting > 0 && <span className="meta">{running === undefined ? `${waiting} waiting to render` : `${waiting} waiting`}</span>}
      {jobs.length === 0 && <span className="meta">{failure !== null ? 'Render failed' : 'Renders'}</span>}
    </span>
  );

  return (
    <>
      <span id={statusId} className="sr-only" role="status" aria-label="Render status">{status}</span>
      <Popover label="Renders" button={summary} buttonDescriptionId={statusId} buttonClass="tb-menu" className="tb-pop" open={open} onOpen={setOpen}>
      <section className="pk-queue" aria-label="Queue">
        <h2>Queue</h2>
        {jobs.length === 0 ? (
          <p className="meta">Nothing rendering.</p>
        ) : (
          <ul className="pk-jobs" aria-label="Queue">
            {jobs.map((job) => (
              <li key={job.id}>
                <span className="pk-job">
                  {job.state === 'running' ? `${jobName(job)} · ${percent(job)} · ${timeLeft(job)}` : `${jobName(job)} · waiting`}
                </span>
                {job.state === 'running' && (
                  <span className="pk-bar" aria-hidden="true">
                    <span style={{ transform: `scaleX(${job.progress})` }} />
                  </span>
                )}
                <button type="button" className="c-act" aria-label={`Cancel ${jobName(job)}`} onClick={() => cancel(job)}>
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        )}
        {failure !== null && <p className="pk-refusal" role="alert">{`${jobName(failure)} failed: ${failure.error ?? 'unknown reason'}`}</p>}
        {cancelError !== '' && <p className="pk-refusal" role="alert">{cancelError}</p>}
      </section>
      {slug !== undefined && (
        <section className="pk-past" aria-label="Past renders">
          <h2>Past renders</h2>
          {currentPast === null || currentPast.state === 'loading' ? (
            <p className="meta" role="status">Loading past renders…</p>
          ) : currentPast.state === 'error' ? (
            <p className="pk-refusal" role="alert">{currentPast.error}</p>
          ) : currentPast.renders.length === 0 ? (
            <p className="meta">None yet.</p>
          ) : (
            <ul className="pk-renders" aria-label="Past renders">
              {currentPast.renders.map((r) => (
                <li key={r.file}>
                  <span className="pk-file">{r.file}</span>
                  <span className="meta">{`${presetName(r.preset)} · ${when(r.at)}`}</span>
                  <span className="pk-actions">
                    {PLAYABLE.test(r.file) && (
                      <button
                        type="button"
                        className="c-act"
                        onClick={() => {
                          setOpen(false);
                          onPlay(r.file);
                        }}
                      >
                        Play
                      </button>
                    )}
                    <button type="button" className="c-act" onClick={() => reveal(r.file)}>Show in folder</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {revealError !== '' && <p className="pk-refusal" role="alert">{revealError}</p>}
        </section>
      )}
      </Popover>
    </>
  );
}
