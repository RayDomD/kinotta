import { useEffect, useRef, useState } from 'react';
import { MAX_GENERATED_SECONDS } from '../../../../server/core/model.ts';
import { fetchTools, mediaUrl } from '../../api/index.ts';
import type { GeneratedAudio } from '../../api/index.ts';

const DEFAULT_SECONDS = 12;
const TICK_MS = 1000;

type Phase = 'idle' | 'running' | 'ready' | 'error';

interface Props {
  editable: boolean;
  /** Where Add puts the sound: the selected clip's track, else Music. */
  targetName: string;
  generate: (request: { prompt: string; seconds: number; seed?: number }, signal: AbortSignal) => Promise<GeneratedAudio>;
  onAdd: (sound: GeneratedAudio) => Promise<void>;
}

/** Local Stable Audio generation at the top of the Sound tab. It works with no clip selected. */
export function SoundGenerate({ editable, targetName, generate, onAdd }: Props) {
  const [prompt, setPrompt] = useState('');
  const [seconds, setSeconds] = useState(String(DEFAULT_SECONDS));
  const [seed, setSeed] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [sound, setSound] = useState<GeneratedAudio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [installed, setInstalled] = useState<boolean | null>(null);
  const stop = useRef<AbortController | null>(null);
  useEffect(() => { void fetchTools().then((check) => setInstalled(check.tools.find((tool) => tool.id === 'stable-audio')?.present ?? false), () => setInstalled(null)); }, []);
  useEffect(() => {
    if (phase !== 'running') return;
    const timer = setInterval(() => setElapsed((value) => value + 1), TICK_MS);
    return () => clearInterval(timer);
  }, [phase]);
  useEffect(() => () => stop.current?.abort(), []);

  const length = Number(seconds);
  const seedNumber = seed.trim() === '' ? undefined : Number(seed);
  const valid = prompt.trim() !== '' && Number.isFinite(length) && length > 0 && length <= MAX_GENERATED_SECONDS && (seedNumber === undefined || (Number.isInteger(seedNumber) && seedNumber >= 0));
  const running = phase === 'running';
  const canGenerate = editable && valid && !running && installed !== false;
  const run = async () => {
    const controller = new AbortController();
    stop.current = controller;
    setPhase('running'); setElapsed(0); setError(null); setSound(null);
    try {
      setSound(await generate({ prompt: prompt.trim(), seconds: length, ...(seedNumber !== undefined ? { seed: seedNumber } : {}) }, controller.signal));
      setPhase('ready');
    } catch (failure) {
      if (controller.signal.aborted) { setPhase('idle'); return; }
      setError(failure instanceof Error ? failure.message : 'The sound could not be generated.'); setPhase('error');
    }
  };
  const add = async () => {
    if (!sound) return;
    setAdding(true); setError(null);
    try { await onAdd(sound); setSound(null); setPhase('idle'); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'The sound could not be added.'); }
    finally { setAdding(false); }
  };

  return <div className="mv-controls editor-generate" aria-label="Generate sound" role="group"
    data-verify-unit="SoundGenerate" data-verify-status={phase} data-verify-loading={String(running)} data-verify-can-generate={String(canGenerate)}
    data-verify-has-result={String(!!sound)} data-verify-error={String(!!error)} data-verify-installed={installed === null ? 'unknown' : String(installed)}>
    <h3>Generate sound</h3>
    <span className="meta">Made on this computer with Stable Audio Open. About half a minute. Added to your library.</span>
    <label>Prompt <input aria-label="Sound prompt" type="text" maxLength={500} placeholder="Warm ambient synth bed, no vocals" value={prompt} disabled={!editable || running} onChange={(event) => setPrompt(event.target.value)} /></label>
    <label>Length (s) <input aria-label="Sound length in seconds" type="number" min="1" max={MAX_GENERATED_SECONDS} step="1" value={seconds} disabled={!editable || running} onChange={(event) => setSeconds(event.target.value)} /></label>
    <label>Seed <input aria-label="Sound seed" type="number" min="0" step="1" placeholder="random" value={seed} disabled={!editable || running} onChange={(event) => setSeed(event.target.value)} /></label>
    {installed === false && <p className="meta">Stable Audio Open is not installed. Ask your agent to set it up, then reload.</p>}
    <button type="button" className="rv-tool" disabled={!canGenerate} onClick={() => void run()}>{running ? 'Generating…' : 'Generate'}</button>
    {running && <><span role="status">Generating… {elapsed} s</span><button type="button" className="rv-tool" onClick={() => stop.current?.abort()}>Cancel</button></>}
    {error && <p role="alert">{error}</p>}
    {sound && <div className="mv-controls" aria-label="Generated sound">
      <strong>{sound.prompt}</strong><span className="meta">{sound.duration.toFixed(1)} s · seed {sound.seed}</span>
      <audio controls preload="none" src={mediaUrl(sound.id)} aria-label="Play generated sound" />
      <button type="button" className="rv-tool" disabled={!editable || adding} onClick={() => void add()}>Add on {targetName} at playhead</button>
      <button type="button" className="rv-tool" disabled={adding} onClick={() => { setSound(null); setPhase('idle'); }}>Done</button>
    </div>}
  </div>;
}
