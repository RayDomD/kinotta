import { useEffect, useRef, useState } from 'react';
import { AGENT_PROVIDER_LABELS, fetchAgentSettings, saveAgentSettings, fetchStyles, listVideos, removeVideo, startReel } from './api/_internal/client.ts';
import type { AgentSettings, Style, VideoEntry } from './api/_internal/client.ts';
import { FRAMES, frameOf } from '../../server/core/model.ts';
import { BriefForm } from './BriefReel.tsx';
import { Direction } from './Direction.tsx';
import { DropZone } from './DropZone.tsx';
import { MissingTools } from './MissingTools.tsx';
import { formatClock } from './timecode.ts';

/** One project-wide yes, or permission for just the pending build. Settings are refreshed at every click. */
export function useAgentConfirmation() {
  const [pending, setPending] = useState<{ settings: AgentSettings; finish(confirmed: boolean): void } | null>(null);
  const confirm = async (): Promise<boolean> => {
    const settings = await fetchAgentSettings();
    if (settings.provider === 'copy' || settings.confirmed) return true;
    return new Promise((finish) => setPending({ settings, finish }));
  };
  return {
    confirm,
    dialog: pending && <AgentConfirmDialog settings={pending.settings} onFinish={(confirmed) => {
      setPending(null);
      pending.finish(confirmed);
    }} />,
  };
}

function AgentConfirmDialog({ settings, onFinish }: { settings: AgentSettings; onFinish(confirmed: boolean): void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const [remember, setRemember] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { dialog.current!.showModal(); cancel.current!.focus(); }, []);
  const build = async () => {
    setSaving(true);
    setError('');
    try {
      if (remember) await saveAgentSettings({ confirmed: true });
      onFinish(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save confirmation. Try again.');
      setSaving(false);
    }
  };
  return <dialog ref={dialog} className="agent-confirm" role="dialog" aria-modal="true" aria-labelledby="agent-confirm-title" aria-describedby="agent-confirm-body" onCancel={(event) => { event.preventDefault(); if (!saving) onFinish(false); }}>
    <h2 id="agent-confirm-title">Build it all now?</h2>
    <div id="agent-confirm-body">
      <p>Kinotta makes the cut here, then runs <b>{AGENT_PROVIDER_LABELS[settings.provider]}</b> in the background to add b-roll.</p>
      <p>{settings.usageNotice}</p>
      <p>You can watch progress at the top of the page and Cancel there.</p>
    </div>
    <label><input type="checkbox" checked={remember} disabled={saving} onChange={(event) => setRemember(event.target.checked)} /> Don&rsquo;t ask again for this project</label>
    {error && <p role="alert">{error}</p>}
    <div className="agent-confirm-actions">
      <button ref={cancel} type="button" className="c-act" disabled={saving} onClick={() => onFinish(false)}>Cancel</button>
      <button type="button" className="btn" disabled={saving} onClick={() => void build()}>Build now</button>
    </div>
  </dialog>;
}

/** Codecs browsers cannot play: starting makes an H.264 copy first, which takes a while on a long video. */
const NEEDS_PLAYBACK_COPY = new Set(['hevc', 'prores']);

/** "Portrait 9:16 · 1080 × 1920", or nothing when the probe could not read the picture. */
export function videoFrameText(video: Pick<VideoEntry, 'width' | 'height'>): string {
  const frame = frameOf(video.width, video.height);
  return frame ? `${FRAMES.find((f) => f.id === frame)!.label} · ${video.width} × ${video.height}` : '';
}

/** The picked video: its name, length and the frame found in it. */
export function VideoCard({ video, action }: { video: VideoEntry; action?: React.ReactNode }) {
  const frame = frameOf(video.width, video.height);
  return (
    <div className="dx-video">
      <span className={`dx-video-shape ${frame ?? 'landscape'}`} aria-hidden="true" />
      <div className="dx-video-text">
        <b>{video.name}</b>
        <span className="dx-video-meta">
          {frame && <>{videoFrameText(video)} · </>}<span className="num">{formatClock(video.duration)}</span>
          {frame && ' · Frame found in your video'}
        </span>
      </div>
      {action}
    </div>
  );
}

/**
 * The start screen, in Simple mode and for the editor's New reel: drop or pick a video, name the reel, then Auto (build
 * now in your usual style) or Direct (choose the style, fonts and music first). A picked video can be removed again,
 * which deletes the copy this screen just made in footage/ unless a reel uses it. A reel with no footage starts from a
 * short brief.
 */
export function SimpleMake({ onStarted, onBriefStarted }: { onStarted(slug: string): void; onBriefStarted(slug: string): void }) {
  const confirmation = useAgentConfirmation();
  const [agent, setAgent] = useState<AgentSettings | null>(null);
  const [videos, setVideos] = useState<VideoEntry[]>([]);
  const [picked, setPicked] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [usual, setUsual] = useState<Style | null>(null);
  const [directing, setDirecting] = useState(false);
  const [briefing, setBriefing] = useState(false);
  /** The video this screen just copied into footage/, which Remove may delete; a project video is only unpicked. */
  const [dropped, setDropped] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const load = (path?: string) =>
    listVideos().then(
      (found) => {
        setVideos(found);
        if (path) {
          setPicked(path);
          setTitle(found.find((video) => video.path === path)?.suggestedTitle ?? 'My reel');
        }
      },
      (err: unknown) => setError(err instanceof Error ? err.message : 'Could not list videos.'),
    );

  useEffect(() => {
    void load();
    void fetchAgentSettings().then(setAgent, () => setAgent(null));
    // Auto's style: your default, or the built-in Kinotta picks before you save one.
    void fetchStyles().then(
      (listing) => setUsual(listing.styles.find((style) => style.id === listing.defaultId) ?? null),
      () => setUsual(null),
    );
  }, []);

  const video = videos.find((v) => v.path === picked);

  const remove = () => {
    if (!video || busy) return;
    const copy = dropped === video.path;
    setPicked('');
    setTitle('');
    setDropped(null);
    setError('');
    setNotice('');
    if (!copy) return;
    void removeVideo(video.path).then(
      ({ removed }) => {
        if (removed) setNotice(`Removed ${video.name} and Kinotta’s copy in footage/.`);
        void load();
      },
      (err: unknown) => setError(err instanceof Error ? err.message : 'Could not remove the video.'),
    );
  };

  const usualStyle = (): Promise<Style | null> => usual
    ? Promise.resolve(usual)
    : fetchStyles().then((listing) => listing.styles.find((style) => style.id === listing.defaultId) ?? null);

  const auto = () => {
    if (!picked || busy || !title.trim()) return;
    setBusy(true);
    setError('');
    void confirmation.confirm().then(async (confirmed) => {
      if (!confirmed) { setBusy(false); return; }
      const style = await usualStyle();
      const { slug } = await startReel({ made: 'auto', agentConfirmed: true, video: picked, title: title.trim(), ...(style ? { style: { id: style.id } } : {}) });
      onStarted(slug);
    }).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Could not make the reel. Try again.');
      setBusy(false);
    });
  };

  if (directing && video) {
    return <Direction video={video} title={title.trim() || video.suggestedTitle} onBack={() => setDirecting(false)} onStarted={onStarted} />;
  }

  return (
    <main className="sm-make dx-make">
      {confirmation.dialog}
      <p className="dx-eyebrow">Your next reel starts here</p>
      <h1>Drop a video. We&rsquo;ll find the reel.</h1>
      <p>One video in. A first cut you can make your own.</p>
      {!video && (
        <DropZone
          onImported={(path, copied) => {
            setError('');
            setNotice('');
            setDropped(copied ? path : null);
            void load(path);
          }}
        />
      )}
      {!video && videos.length > 0 && (
        <label>
          Or use a video in this project
          <select
            value={picked}
            disabled={busy}
            onChange={(event) => {
              const next = videos.find((v) => v.path === event.target.value);
              setPicked(next?.path ?? '');
              setTitle(next?.suggestedTitle ?? '');
              setNotice('');
            }}
          >
            <option value="">Choose a video</option>
            {videos.map((v) => (
              <option key={v.path} value={v.path}>{v.path}</option>
            ))}
          </select>
        </label>
      )}

      {video && (
        <div className="dx-make-panel">
          <VideoCard
            video={video}
            action={<button type="button" className="c-act" disabled={busy} aria-label={`Remove ${video.name}`} onClick={remove}>Remove</button>}
          />
          <label>
            Reel name
            <input required disabled={busy} value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <div className="dx-choices" role="group" aria-label="How to make it">
            <button type="button" className="dx-choice dx-choice-primary" disabled={busy || !title.trim()} onClick={auto}>
              <b>{busy ? 'Making…' : 'Auto'} <span aria-hidden="true">→</span></b>
              <span>We cut it in your usual style. Change anything after.</span>
            </button>
            <button type="button" className="dx-choice" disabled={busy || !title.trim()} onClick={() => setDirecting(true)}>
              <b>Direct</b>
              <span>Choose the style, fonts and music in 5 short steps.</span>
            </button>
          </div>
          <p className="dx-hint">
            {agent?.provider === 'copy'
              ? 'No agent found on this machine: Auto makes the cut and prepares the b-roll request for you to paste.'
              : <>{usual
              ? usual.scope === 'builtin'
                ? <>Your usual style: Kinotta&rsquo;s {usual.name}, until you save your own.</>
                : <>Your usual style: {usual.name}.</>
              : 'Your usual style: Kinotta picks one for this video.'}{agent && ` B-roll runs with ${AGENT_PROVIDER_LABELS[agent.provider]} on your plan.`}</>}
          </p>
        </div>
      )}

      {!video && (
        briefing
          ? <BriefForm onStarted={onBriefStarted} />
          : <button type="button" className="dx-quiet dx-brief-open" onClick={() => setBriefing(true)}>No footage? Start from a short brief</button>
      )}

      {busy && (
        <p role="status">
          {video && NEEDS_PLAYBACK_COPY.has(video.codec)
            ? 'Making a copy the browser can play, then starting your reel.'
            : 'Starting your reel. The preview opens while the words are prepared.'}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      <MissingTools />
    </main>
  );
}
