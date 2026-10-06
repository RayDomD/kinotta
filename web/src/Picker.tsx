import { useEffect, useState } from 'react';
import { approveVersion, fetchRenders, fetchRenderSettings, queueRender, renderFileUrl, revealRender, withdrawApproval } from './api/index.ts';
import type { RenderFile, RenderPreset, RenderSettings, VersionEntry } from './api/index.ts';
import { BUILT_BY_YOU } from '../../server/core/model.ts';

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

const presetName = (preset: RenderPreset): string => PRESETS.find((p) => p.id === preset)?.name ?? preset;
const issueText = (count: number): string => (count === 0 ? 'ok' : `${count} ${count === 1 ? 'issue' : 'issues'}`);
const builtBy = (who: string | undefined): string => (who === BUILT_BY_YOU ? 'you' : (who ?? ''));
const when = (iso: string): string => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export interface VersionsTableProps {
  slug: string;
  entries: VersionEntry[];
  selected: number | undefined;
  onSelect(number: number): void;
}

/** Every version of the reel as a row (mockup option B): built by, comments, contract, and approval with Approve or Withdraw. */
export function VersionsTable({ slug, entries, selected, onSelect }: VersionsTableProps) {
  const [busy, setBusy] = useState<number | null>(null);
  const [message, setMessage] = useState('');

  const change = (number: number, approve: boolean): void => {
    setBusy(number);
    setMessage('');
    // The rail and this table hear the change as an approval-changed event and reload the rows.
    (approve ? approveVersion(slug, number).then((a) => setMessage(a.warning ?? '')) : withdrawApproval(slug, number).then(() => undefined))
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Could not reach the server'))
      .finally(() => setBusy(null));
  };

  return (
    <div className="pk-versions">
      <table className="pk-table" aria-label="Versions">
        <thead>
          <tr>
            <th scope="col">Version</th>
            <th scope="col">Built by</th>
            <th scope="col">Comments</th>
            <th scope="col">Contract</th>
            <th scope="col">Approval</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.number} aria-current={entry.number === selected ? 'true' : undefined}>
              <th scope="row">
                <button type="button" className="pk-select" onClick={() => onSelect(entry.number)}>{`v${entry.number}`}</button>
              </th>
              <td>{builtBy(entry.builtBy)}</td>
              <td className="dot">{entry.comments}</td>
              <td>{issueText(entry.issues)}</td>
              <td className="pk-approval">
                {entry.approved ? (
                  <>
                    <span>✓ Approved</span>
                    <button type="button" className="c-act" aria-label={`Withdraw v${entry.number}`} disabled={busy === entry.number} onClick={() => change(entry.number, false)}>
                      Withdraw
                    </button>
                  </>
                ) : (
                  <button type="button" className="c-act strong" aria-label={`Approve v${entry.number}`} disabled={busy === entry.number} onClick={() => change(entry.number, true)}>
                    Approve
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="pk-message" role="status">{message}</p>
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

export interface PickerSideProps {
  slug: string;
  version: number | undefined;
  /** The reel has footage, so its audio joins at cuts. */
  footage: boolean;
  /** Changes when a render of this reel finishes, so the past renders reload. */
  rendersTick: number;
  onPlay(file: string): void;
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

/** The right column of Picker: Render for the selected version (preset and the four settings), then past renders. */
export function PickerSide({ slug, version, footage, rendersTick, onPlay }: PickerSideProps) {
  const [saved, setSaved] = useState<{ slug: string; settings: Record<RenderPreset, RenderSettings> } | null>(null);
  const [preset, setPreset] = useState<RenderPreset>('draft');
  const [settings, setSettings] = useState<RenderSettings | null>(null);
  const [sending, setSending] = useState(false);
  const [refusal, setRefusal] = useState('');
  const [status, setStatus] = useState('');
  const [renders, setRenders] = useState<RenderFile[]>([]);
  const [revealError, setRevealError] = useState('');

  useEffect(() => {
    let live = true;
    fetchRenderSettings(slug).then(
      (loaded) => {
        if (!live) return;
        setSaved({ slug, settings: loaded });
        setSettings(loaded[preset]);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
    // The form follows the preset from here on; only a new reel reloads what is saved.
  }, [slug]);

  useEffect(() => {
    let live = true;
    fetchRenders(slug).then((list) => live && setRenders(list), () => undefined);
    return () => {
      live = false;
    };
  }, [slug, rendersTick]);

  const pickPreset = (next: RenderPreset): void => {
    setPreset(next);
    setRefusal('');
    if (saved?.slug === slug) setSettings(saved.settings[next]);
  };
  const set = <K extends keyof RenderSettings>(key: K) => (value: RenderSettings[K]): void => setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));

  const render = (): void => {
    if (version === undefined || settings === null) return;
    setSending(true);
    setRefusal('');
    setStatus('');
    queueRender(slug, version, preset, settings)
      .then(() => {
        setStatus(`v${version} ${presetName(preset)} queued.`);
        // What Render saved is what this preset starts from next time.
        setSaved((prev) => (prev?.slug === slug ? { slug, settings: { ...prev.settings, [preset]: settings } } : prev));
      })
      .catch((err: unknown) => setRefusal(err instanceof Error ? err.message : 'Could not reach the server'))
      .finally(() => setSending(false));
  };

  const reveal = (file: string): void => {
    setRevealError('');
    revealRender(slug, file).catch((err: unknown) => setRevealError(err instanceof Error ? err.message : 'Could not reach the server'));
  };

  return (
    <aside className="comments pk-side" aria-label="Render">
      <section className="pk-render" aria-labelledby="pk-render-title">
        <h2 id="pk-render-title">{version === undefined ? 'Render' : `Render v${version}`}</h2>
        <fieldset className="pk-presets">
          <legend className="label">Preset</legend>
          {PRESETS.map((p) => (
            <label key={p.id} className="pk-preset">
              <input type="radio" name="pk-preset" value={p.id} checked={preset === p.id} onChange={() => pickPreset(p.id)} />
              <span>{p.name}</span>
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
        <button type="button" className="btn" disabled={version === undefined || settings === null || sending} onClick={render}>
          Render
        </button>
        {refusal !== '' && <p className="pk-refusal" role="alert">{refusal}</p>}
        <p className="pk-message" role="status">{status}</p>
      </section>
      <section className="pk-past" aria-labelledby="pk-past-title">
        <h2 id="pk-past-title">Past renders</h2>
        {renders.length === 0 ? (
          <p className="meta">None yet.</p>
        ) : (
          <ul className="pk-renders" aria-label="Past renders">
            {renders.map((r) => (
              <li key={r.file}>
                <span className="pk-file">{r.file}</span>
                <span className="meta">{`${presetName(r.preset)} · ${when(r.at)}`}</span>
                <span className="pk-actions">
                  {PLAYABLE.test(r.file) && (
                    <button type="button" className="c-act" onClick={() => onPlay(r.file)}>Play</button>
                  )}
                  <button type="button" className="c-act" onClick={() => reveal(r.file)}>Show in folder</button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {revealError !== '' && <p className="pk-refusal" role="alert">{revealError}</p>}
      </section>
    </aside>
  );
}
