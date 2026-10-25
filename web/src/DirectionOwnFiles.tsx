import { useEffect, useRef, useState } from 'react';
import { fetchWaveform, importFont, importMedia, mediaUrl } from './api/_internal/client.ts';
import { formatClock } from './timecode.ts';

export const FONT_FILE = /\.(ttf|otf|woff2?)$/i;
export const MUSIC_FILE = /\.(mp3|wav|m4a|ogg|aac|flac)$/i;
export type FontUse = 'words' | 'numbers' | 'both';

export interface OwnFont {
  /** Project-relative: `fonts/Brand-Bold.woff2`. */
  path: string;
  family: string;
  use: FontUse;
  /** The face loaded in this page for the sample line, when the file was dropped here. */
  face?: string;
}
export interface OwnMusic {
  /** Project-relative, as the style records it. */
  path: string;
  name: string;
  /** The media library id, when the file was dropped here: playback and the waveform need it. */
  id?: string;
  fit: 'beat' | 'under';
  duck: boolean;
}

let faces = 0;
/** Copies the font into the project and loads it in this page under its own name for the sample. */
export async function takeFont(file: File): Promise<OwnFont> {
  const imported = await importFont(file);
  const face = `kinotta-own-${++faces}`;
  try {
    const loaded = await new FontFace(face, await file.arrayBuffer()).load();
    document.fonts.add(loaded);
    return { path: imported.path, family: imported.family, use: 'words', face };
  } catch {
    // The copy is still in the project; the sample just falls back to the editor's face.
    return { path: imported.path, family: imported.family, use: 'words' };
  }
}

/** Copies the track into the project's media, where the waveform and playback come from. */
export async function takeMusic(file: File): Promise<OwnMusic> {
  const imported = await importMedia(file);
  return { path: imported.path, name: imported.name, id: imported.id, fit: 'beat', duck: true };
}

/** The last card in the Fonts or Music row: click to choose a file, or drop one on it. */
export function DropCard({ label, accept, hint, busy, onFile }: { label: string; accept: string; hint: string; busy: boolean; onFile(file: File): void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <>
      <button
        type="button"
        className={`dx-card dx-drop ${over ? 'drag' : ''}`}
        disabled={busy}
        onClick={() => input.current?.click()}
        onDragOver={(event) => { event.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => { event.preventDefault(); event.stopPropagation(); setOver(false); const file = event.dataTransfer.files[0]; if (file) onFile(file); }}
      >
        <span className="dx-mark" aria-hidden="true">+</span>
        <b>{busy ? 'Copying…' : label}</b>
        <span>{hint} · or click to choose</span>
      </button>
      <input ref={input} type="file" accept={accept} hidden aria-label={label} onChange={(event) => { const file = event.target.files?.[0]; if (file) onFile(file); event.target.value = ''; }} />
    </>
  );
}

const USES: { id: FontUse; label: string }[] = [{ id: 'words', label: 'Words' }, { id: 'numbers', label: 'Numbers' }, { id: 'both', label: 'Both' }];

/** Your font: a sample line in it, what to use it for, and the license note. */
export function OwnFontPanel({ font, brandWords, brandNumbers, onUse, onRemove }: { font: OwnFont; brandWords: string; brandNumbers: string; onUse(use: FontUse): void; onRemove(): void }) {
  const face = font.face ? `"${font.face}", sans-serif` : undefined;
  return (
    <div className="dx-own" aria-label="Your font">
      <p className="dx-sample">
        <span style={{ fontFamily: font.use === 'numbers' ? undefined : face }}>Take the long way home.</span>
        <span className="dx-sample-num" style={{ fontFamily: font.use === 'words' ? undefined : face }}>00:30</span>
      </p>
      <div className="dx-row">
        <span className="dx-row-name">Use it for</span>
        <span className="dx-seg" role="group" aria-label="Use it for">
          {USES.map((use) => <button key={use.id} type="button" aria-pressed={font.use === use.id} className={font.use === use.id ? 'on' : ''} onClick={() => onUse(use.id)}>{use.label}</button>)}
        </span>
        <span className="dx-row-hint">{font.use === 'words' ? `${brandNumbers} stays for numbers.` : font.use === 'numbers' ? `${brandWords} stays for words.` : 'Every word and number.'}</span>
      </div>
      <div className="dx-own-note">
        <span>Copied into this project as <code>{font.path}</code> so renders use it. Use a font you&rsquo;re licensed to use.</span>
        <button type="button" className="dx-quiet" onClick={onRemove}>Remove</button>
      </div>
    </div>
  );
}

const BARS = 64;
const WAVEFORM_TRIES = 8;
const WAVEFORM_WAIT_MS = 1500;

/** Your music: a waveform with play and seek, how it fits the cut, ducking, and the rights note. */
export function OwnMusicPanel({ music, footage, onChange, onRemove }: { music: OwnMusic; footage: boolean; onChange(music: OwnMusic): void; onRemove(): void }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!music.id) return;
    let live = true;
    // The library prepares the track's audio in the background, so the first asks can come back empty.
    const load = async () => {
      for (let attempt = 0; attempt < WAVEFORM_TRIES && live; attempt++) {
        const wave = await fetchWaveform(music.id!).catch(() => null);
        if (wave?.state === 'ready' && wave.peaks.length) {
          if (!live) return;
          const max = Math.max(...wave.peaks, 0.001);
          setPeaks(Array.from({ length: BARS }, (_, i) => wave.peaks[Math.floor((i / BARS) * wave.peaks.length)]! / max));
          setDuration(wave.duration);
          return;
        }
        await new Promise((done) => setTimeout(done, WAVEFORM_WAIT_MS));
      }
    };
    void load();
    return () => { live = false; };
  }, [music.id]);

  const seek = (event: React.MouseEvent<HTMLButtonElement> | React.KeyboardEvent<HTMLButtonElement>, to?: number) => {
    const player = audio.current;
    if (!player || !duration) return;
    const box = event.currentTarget.getBoundingClientRect();
    const at = to ?? (((event as React.MouseEvent).clientX - box.left) / box.width) * duration;
    player.currentTime = Math.max(0, Math.min(duration, at));
    setTime(player.currentTime);
  };

  return (
    <div className="dx-own" aria-label="Your music">
      {music.id && (
        <div className="dx-track">
          <button type="button" className="dx-play" aria-label={playing ? 'Pause' : 'Play'} onClick={() => { const player = audio.current; if (!player) return; if (player.paused) void player.play(); else player.pause(); }}>
            {playing ? '❚❚' : '▶'}
          </button>
          <div className="dx-track-info"><b>{music.name}</b><span className="dx-num">{formatClock(time)} / {formatClock(duration)}</span></div>
          <button
            type="button"
            className="dx-wave"
            aria-label="Waveform; click to seek"
            onClick={(event) => seek(event)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); seek(event, time + (event.key === 'ArrowRight' ? 5 : -5)); }
            }}
          >
            {peaks
              ? peaks.map((peak, i) => <span key={i} className={duration && i / BARS < time / duration ? 'played' : ''} style={{ height: `${Math.max(6, peak * 100)}%` }} />)
              : <em>Preparing the waveform…</em>}
          </button>
          <audio
            ref={audio}
            src={mediaUrl(music.id)}
            preload="metadata"
            onLoadedMetadata={(event) => setDuration((current) => current || event.currentTarget.duration)}
            onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
          />
        </div>
      )}
      <div className="dx-row">
        <span className="dx-row-name">Fit</span>
        <span className="dx-seg" role="group" aria-label="Fit">
          <button type="button" aria-pressed={music.fit === 'beat'} className={music.fit === 'beat' ? 'on' : ''} onClick={() => onChange({ ...music, fit: 'beat' })}>Cut on its beat</button>
          <button type="button" aria-pressed={music.fit === 'under'} className={music.fit === 'under' ? 'on' : ''} onClick={() => onChange({ ...music, fit: 'under' })}>Play under the cut</button>
        </span>
        <span className="dx-row-hint">{music.fit === 'beat' ? 'Cuts land on the track\'s beats.' : 'The track plays as it is; the cut keeps its own timing.'}</span>
      </div>
      {footage && (
        <div className="dx-row">
          <span className="dx-row-name">Under your voice</span>
          <span className="dx-seg" role="group" aria-label="Under your voice">
            <button type="button" aria-pressed={music.duck} className={music.duck ? 'on' : ''} onClick={() => onChange({ ...music, duck: true })}>Lower it</button>
            <button type="button" aria-pressed={!music.duck} className={!music.duck ? 'on' : ''} onClick={() => onChange({ ...music, duck: false })}>Leave it</button>
          </span>
          <span className="dx-row-hint">{music.duck ? 'Drops the music while you talk.' : 'The music stays at full level.'}</span>
        </div>
      )}
      <div className="dx-own-note">
        <span>Saved to this project&rsquo;s media as <code>{music.path}</code>. Use music you have the rights to.</span>
        <button type="button" className="dx-quiet" onClick={onRemove}>Remove</button>
      </div>
    </div>
  );
}
