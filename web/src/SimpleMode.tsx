import { useEffect, useState } from 'react';
import {
  cancelReelAgentJob,
  copyBatch,
  copyReelAgentJob,
  fetchAgentSettings,
  fetchReelAgentJob,
  fetchWorkingVersion,
  listVideos,
  retryReelAgentJob,
  saveAgentSettings,
  startReel,
  subscribe,
} from './api/_internal/client.ts';
import type {
  AgentJob,
  AgentProvider,
  NewComment,
  ReelListing,
  ReelSummary,
  Version,
  VideoEntry,
} from './api/_internal/client.ts';
import { brollTargets } from '../../server/core/model.ts';
import {
  BROLL_LEVELS,
  CAPTIONS_MODES,
  DIAL_DESCRIPTIONS,
  loadSimpleOptions,
  PACE_LEVELS,
  saveSimpleOptions,
  serializeSimpleOptions,
  setDial,
  setVideoType,
  VIDEO_TYPES,
  type SimpleOptionsState,
} from './simple-options.ts';
import { DropZone } from './DropZone.tsx';
import { Review } from './review/index.ts';
import type { EditsState } from './review/index.ts';
import type { CommentsState } from './useComments.ts';
import { formatClock } from './timecode.ts';
import './simple.css';

/** Simple mode is the default on each new browser tab; an explicit editor switch survives reload. */
export function startsInSimpleMode(): boolean {
  try { return sessionStorage.getItem('kinotta-mode') !== 'editor'; } catch { return true; }
}

const KINDS = [
  [160, 'photo'],
  [75, 'graphic'],
  [330, 'title'],
  [200, 'clip'],
] as const;

function AgentRunTimer({ job, active }: { job: AgentJob; active: boolean }) {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [job.id, active]);

  const elapsed = active
    ? Math.max(job.elapsedSeconds, Math.floor((now - Date.parse(job.createdAt)) / 1000))
    : job.elapsedSeconds;
  const clock = formatClock(elapsed).replace(/^0(?=\d:)/, '');

  return (
    <span className="sm-agent-timer" role="timer" aria-live="off" aria-label={active ? 'Agent run elapsed' : 'Agent run total'}>
      {active ? 'Elapsed ' : 'Took '}<span className="num">{clock}</span>
    </span>
  );
}

function SimpleMake({ onStarted }: { onStarted(slug: string): void }) {
  const [videos, setVideos] = useState<VideoEntry[]>([]);
  const [picked, setPicked] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [options, setOptions] = useState<SimpleOptionsState>(loadSimpleOptions);
  const [notes, setNotes] = useState('');

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
  }, []);

  const selectedVideo = videos.find((v) => v.path === picked);
  const totalDuration = selectedVideo?.duration && selectedVideo.duration > 0 ? selectedVideo.duration : 58;
  const { coveragePercent, shotSeconds, count } = brollTargets(options.broll, options.pace, totalDuration);

  const targetCoverSeconds = (coveragePercent / 100) * totalDuration;
  const gap = count > 0 ? Math.max(0, (totalDuration - targetCoverSeconds) / (count + 1)) : 0;
  let x = gap * 0.6 + 1;
  const cutaways: Array<{ start: number; duration: number }> = [];
  for (let i = 0; i < count; i++) {
    if (x + shotSeconds <= totalDuration) {
      cutaways.push({ start: x, duration: shotSeconds });
    }
    x += shotSeconds + gap * (i % 2 ? 1.3 : 0.7);
  }

  const ticks: Array<{ sec: number; pct: number; major: boolean; label: string }> = [];
  const tickStep = totalDuration > 120 ? 10 : totalDuration > 60 ? 5 : 1;
  const majorStep = totalDuration > 120 ? 30 : totalDuration > 60 ? 10 : 5;
  for (let s = 0; s <= totalDuration; s += tickStep) {
    const isMajor = s % majorStep === 0;
    ticks.push({
      sec: s,
      pct: (s / totalDuration) * 100,
      major: isMajor,
      label: formatClock(s),
    });
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!picked || busy || !title.trim()) return;
    setBusy(true);
    setError('');

    const optionsPayload = serializeSimpleOptions(options, notes);
    void startReel({
      video: picked,
      title: title.trim(),
      deadAir: 'normal',
      ...optionsPayload,
    }).then(
      ({ slug }) => onStarted(slug),
      (err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not make the reel. Try again.');
        setBusy(false);
      },
    );
  };

  return (
    <main className="sm-make">
      <h1>Drop a video. Make it yours.</h1>
      <p>Watch your reel, then pin the moments you want to change.</p>
      <DropZone onImported={(path) => { setError(''); void load(path); }} />
      {videos.length > 0 && (
        <label>
          Or use a video in this project
          <select
            value={picked}
            disabled={busy}
            onChange={(event) => {
              const video = videos.find((v) => v.path === event.target.value);
              setPicked(video?.path ?? '');
              setTitle(video?.suggestedTitle ?? '');
            }}
          >
            <option value="">Choose a video</option>
            {videos.map((video) => (
              <option key={video.path} value={video.path}>{video.path}</option>
            ))}
          </select>
        </label>
      )}

      {picked && (
        <div className="sm-make-panel">
          <div className="sm-file-info">
            <div className="sm-file-swatch" />
            <div>
              <b>{selectedVideo?.name ?? picked}</b>
              <div className="sm-file-stat num">
                {selectedVideo?.duration ? formatClock(selectedVideo.duration) : formatClock(totalDuration)}
              </div>
            </div>
          </div>

          <p className="sm-label">What are you making?</p>
          <div className="sm-type-cards">
            {VIDEO_TYPES.map((type) => {
              const isSelected = options.videoType === type.id;
              return (
                <button
                  key={type.id}
                  type="button"
                  className={`sm-type-card ${isSelected ? 'on' : ''}`}
                  aria-pressed={isSelected}
                  onClick={() => {
                    const next = setVideoType(options, type.id);
                    setOptions(next);
                    saveSimpleOptions(next);
                  }}
                >
                  <b>{isSelected ? '✓ ' : ''}{type.label}</b>
                  <p>{type.description}</p>
                </button>
              );
            })}
          </div>

          <p className="sm-label">Settings · filled in by the type, change any of them</p>
          <div className="sm-dial-row">
            <span className="sm-dial-name">B-roll</span>
            <span className="sm-seg" role="group" aria-label="B-roll">
              {BROLL_LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  className={`${options.broll === level ? 'on' : ''} ${options.overridden.broll && options.broll === level ? 'mine' : ''}`}
                  aria-pressed={options.broll === level}
                  onClick={() => {
                    const next = setDial(options, 'broll', level);
                    setOptions(next);
                    saveSimpleOptions(next);
                  }}
                >
                  {level}
                </button>
              ))}
            </span>
            <span className="sm-dial-why">
              {DIAL_DESCRIPTIONS.broll[options.broll]}{options.overridden.broll ? ' · yours' : ''}
            </span>
          </div>

          <div className="sm-dial-row">
            <span className="sm-dial-name">Pace</span>
            <span className="sm-seg" role="group" aria-label="Pace">
              {PACE_LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  className={`${options.pace === level ? 'on' : ''} ${options.overridden.pace && options.pace === level ? 'mine' : ''}`}
                  aria-pressed={options.pace === level}
                  onClick={() => {
                    const next = setDial(options, 'pace', level);
                    setOptions(next);
                    saveSimpleOptions(next);
                  }}
                >
                  {level}
                </button>
              ))}
            </span>
            <span className="sm-dial-why">
              {DIAL_DESCRIPTIONS.pace[options.pace]}{options.overridden.pace ? ' · yours' : ''}
            </span>
          </div>

          <div className="sm-dial-row">
            <span className="sm-dial-name">Captions</span>
            <span className="sm-seg" role="group" aria-label="Captions">
              {CAPTIONS_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`${options.captions === mode ? 'on' : ''} ${options.overridden.captions && options.captions === mode ? 'mine' : ''}`}
                  aria-pressed={options.captions === mode}
                  onClick={() => {
                    const next = setDial(options, 'captions', mode);
                    setOptions(next);
                    saveSimpleOptions(next);
                  }}
                >
                  {mode}
                </button>
              ))}
            </span>
            <span className="sm-dial-why">
              {options.overridden.captions ? 'yours' : ''}
            </span>
          </div>
          <p className="sm-dials-sub">Changing a dial marks it &ldquo;yours&rdquo;; picking another type then leaves it alone.</p>

          <div className="sm-live-preview">
            <div className="sm-preview-ph">
              <p className="sm-label" style={{ margin: 0 }}>Preview of the b-roll plan</p>
              <span className="sm-preview-stat" id="stat">
                <span className="num">{count}</span> cutaways · each about <span className="num">{shotSeconds}</span> s · <span className="num">{coveragePercent}</span>% covered
              </span>
            </div>
            <div className="sm-preview-tl">
              <div className="sm-preview-ruler">
                {ticks.map((t) => (
                  <div key={t.sec} className={`sm-preview-tick ${t.major ? 'major' : ''}`} style={{ left: `${t.pct}%` }}>
                    {t.major && <span className="num">{t.label}</span>}
                  </div>
                ))}
              </div>
              <div className="sm-preview-ll">Added by Kinotta</div>
              <div className="sm-preview-lane" role="region" aria-label="Added by Kinotta">
                {cutaways.map((slot, i) => {
                  const [h, kind] = KINDS[i % KINDS.length]!;
                  const pctLeft = (slot.start / totalDuration) * 100;
                  const pctWidth = (slot.duration / totalDuration) * 100;
                  return (
                    <div
                      key={i}
                      className="sm-preview-clip"
                      style={{
                        left: `${pctLeft}%`,
                        width: `${pctWidth}%`,
                        background: `oklch(0.36 0.07 ${h})`,
                        border: `1px solid oklch(0.7 0.1 ${h})`,
                      }}
                    >
                      {shotSeconds > 2.5 ? kind : ''}
                    </div>
                  );
                })}
              </div>
              <div className="sm-preview-ll">Your video</div>
              <div className="sm-preview-lane" role="region" aria-label="Your video">
                <div className="sm-preview-clip sm-clip-talk" style={{ left: 0, width: '100%' }}>you talking</div>
              </div>
            </div>
            <div className="sm-preview-frames">
              {cutaways.slice(0, 6).map((slot, i) => {
                const [h, kind] = KINDS[i % KINDS.length]!;
                return (
                  <div key={i} className="sm-preview-frame">
                    <i style={{ background: `linear-gradient(160deg, oklch(0.58 0.1 ${h}), oklch(0.26 0.04 ${h + 40}))` }} />
                    <span className="num">{formatClock(Math.round(slot.start))} {kind}</span>
                  </div>
                );
              })}
            </div>
            <p className="sm-preview-note">
              The real result is built by the agent and will differ; this shows the target it is given. Your notes can still override it (&ldquo;hold the lab shot longer&rdquo;).
            </p>
          </div>

          <form className="sm-make-form" onSubmit={handleSubmit}>
            <label>
              Reel name
              <input required disabled={busy} value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <label>
              Notes (optional)
              <input
                className="sm-notes-input"
                placeholder="Anything else? e.g. keep the jokes, use my logo at the end (optional)"
                maxLength={4000}
                disabled={busy}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </label>
            <div className="sm-make-actions">
              <button className="btn" type="submit" disabled={busy || !picked || !title.trim()}>
                {busy ? 'Making…' : 'Make'}
              </button>
            </div>
          </form>
        </div>
      )}

      {busy && <p role="status">Starting your reel. The preview opens while the words are prepared.</p>}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}

export function SimpleMode({
  listing,
  reel,
  version,
  state,
  message,
  creating,
  comments,
  edits,
  onOpen,
  onNew,
  onStarted,
  onEditor,
  onRefresh,
}: {
  listing: ReelListing;
  reel: ReelSummary | undefined;
  version: Version | undefined;
  state: 'loading' | 'error' | 'none' | 'ready';
  message?: string;
  creating: boolean;
  comments: CommentsState;
  edits: EditsState;
  onOpen(slug: string): void;
  onNew(): void;
  onStarted(slug: string): void;
  onEditor(): void;
  onRefresh(): void;
}) {
  const [agentProvider, setAgentProvider] = useState<AgentProvider>('copy');
  const [agentJob, setAgentJob] = useState<AgentJob | null>(null);
  const [draft, setDraft] = useState<NewComment['pin'] | null>(null);
  const [text, setText] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [jump, setJump] = useState<{ time: number; seq: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [request, setRequest] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  useEffect(() => {
    void fetchAgentSettings().then((settings) => {
      if (settings?.provider) setAgentProvider(settings.provider);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setDraft(null);
    setSelected(null);
    setJump(null);
    setStatus('');
    setError('');
    setRequest('');
    setEditing(null);
    setAgentJob(null);
  }, [reel?.slug, creating]);

  useEffect(() => {
    if (!reel || creating) return;
    void fetchReelAgentJob(reel.slug).then((job) => setAgentJob(job)).catch(() => {});
  }, [reel?.slug, creating]);

  useEffect(() => {
    if (!reel || creating) return;
    return subscribe((event) => {
      if (event.type === 'agent-progress' && event.reel === reel.slug) {
        setAgentJob(event.job);
        if (event.job.state === 'succeeded') {
          onRefresh();
        }
      }
    });
  }, [reel?.slug, creating, onRefresh]);

  useEffect(() => {
    if (!reel || creating || !agentJob || !['queued', 'running', 'validating', 'cancelling'].includes(agentJob.state)) {
      return;
    }
    const timer = setInterval(() => {
      void fetchReelAgentJob(reel.slug).then((job) => {
        if (job) setAgentJob(job);
      }).catch(() => {});
    }, 3000);
    return () => clearInterval(timer);
  }, [reel?.slug, creating, agentJob?.state]);

  const pins = comments.comments;
  const jumpTo = (index: number) => {
    if (!pins.length) return;
    const pin = pins[(index + pins.length) % pins.length]!;
    setSelected(pin.id);
    setJump((previous) => ({ time: pin.pin.time, seq: (previous?.seq ?? 0) + 1 }));
  };

  const stepPin = (direction: -1 | 1) => {
    const current = pins.findIndex((pin) => pin.id === selected);
    jumpTo(current < 0 ? (direction === 1 ? 0 : pins.length - 1) : current + direction);
  };

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        (event.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')
      ) {
        return;
      }
      if (event.key === '[' || event.key === ']') {
        event.preventDefault();
        stepPin(event.key === ']' ? 1 : -1);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [pins, selected]);

  const problem = (err: unknown) => setError(err instanceof Error ? err.message : 'Could not complete that action. Try again.');

  const regenerate = async () => {
    if (!reel || !version || busy) return;
    setBusy(true);
    setError('');
    setStatus('Saving the request…');
    setRequest('');
    try {
      const sections =
        version.sections.length > 1
          ? version.sections.filter((section) => pins.some((pin) => pin.pin.section === section.id && !pin.state))
          : [null];
      const batches: string[] = [];
      let current = version.number;
      for (const section of sections) {
        const saved = await copyBatch(reel.slug, current, section ? { section: section.id } : {});
        batches.push(saved.text);
        current = (await fetchWorkingVersion(reel.slug)).number;
      }
      const body = batches.join('\n\n');
      if (!body) throw new Error('No pins are ready to copy.');
      setRequest(body);
      onRefresh();
      try {
        await navigator.clipboard.writeText(body);
        setStatus('Request copied. Paste it into your agent to regenerate.');
      } catch {
        setStatus('Request saved. Copy the request below and paste it into your agent.');
      }
    } catch (err) {
      problem(err);
      setStatus('');
    } finally {
      setBusy(false);
    }
  };

  const isJobActive = Boolean(agentJob && ['queued', 'running', 'validating', 'cancelling'].includes(agentJob.state));
  const isJobFailed = Boolean(agentJob && (agentJob.state === 'failed' || agentJob.state === 'interrupted'));
  const isJobCopyReady = Boolean(agentJob && agentJob.state === 'copy-ready');
  const showAgentBanner = Boolean(agentJob);

  return (
    <div className="app sm-app">
      <header className="sm-top">
        <span className="brand">KINOTTA</span>
        <span>Simple mode</span>
        <div className="sm-top-actions">
          <label className="sm-agent-control">
            Agent
            <select
              aria-label="Agent provider"
              value={agentProvider}
              disabled={busy}
              onChange={(event) => {
                const next = event.target.value as AgentProvider;
                setAgentProvider(next);
                void saveAgentSettings(next).catch(problem);
              }}
            >
              <option value="copy">Copy request</option>
              <option value="claude">Claude Code</option>
              <option value="codex">Codex</option>
            </select>
          </label>
          <button type="button" className="c-act" onClick={onEditor}>Open in editor</button>
        </div>
      </header>

      <div className="sm-heading">
        <div>
          <h1>{creating || !reel ? 'Your next reel' : reel.title}</h1>
          <p>{creating || !reel ? 'One video in. A reel you can make your own.' : 'Watch, pin a moment, and say what should change.'}</p>
        </div>
        <div className="sm-heading-actions">
          <label>
            Reel
            <select
              aria-label="Choose reel"
              value={creating ? '' : reel?.slug ?? ''}
              disabled={busy}
              onChange={(event) => (event.target.value ? onOpen(event.target.value) : onNew())}
            >
              <option value="">New reel</option>
              {listing.reels.map((r) => (
                <option key={r.slug} value={r.slug}>{r.title}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {creating || !reel ? (
        <SimpleMake onStarted={onStarted} />
      ) : (
        <div className="sm-studio">
          <div className="sm-preview">
            {showAgentBanner && agentJob && (
              <div className="sm-agent-banner" role="status">
                <div className="sm-agent-status">
                  <span className="sm-agent-title">
                    {isJobActive
                      ? 'Adding b-roll…'
                      : isJobCopyReady
                      ? 'B-roll request ready'
                      : agentJob.state === 'succeeded'
                      ? 'B-roll added'
                      : `Adding b-roll ${agentJob.state}`}
                  </span>
                  <AgentRunTimer job={agentJob} active={isJobActive} />
                  {agentJob.quiet && isJobActive && (
                    <span className="sm-agent-quiet">Running, no recent output</span>
                  )}
                  {agentJob.error && (
                    <span className="sm-agent-error" role="alert">{agentJob.error}</span>
                  )}
                </div>
                <div className="sm-agent-actions">
                  {isJobActive && (
                    <button
                      type="button"
                      className="c-act"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          const updated = await cancelReelAgentJob(reel.slug);
                          setAgentJob(updated);
                          setStatus('Cancelled b-roll agent run.');
                        } catch (err) {
                          problem(err);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Cancel
                    </button>
                  )}
                  {(agentJob.canRetry || isJobFailed) && (
                    <button
                      type="button"
                      className="c-act"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          const retried = await retryReelAgentJob(reel.slug);
                          setAgentJob(retried);
                          setStatus('Retrying b-roll agent run…');
                        } catch (err) {
                          problem(err);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Retry
                    </button>
                  )}
                  {(agentJob.canCopy || isJobCopyReady || agentJob.provider === 'copy') && (
                    <button
                      type="button"
                      className="c-act"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          const { request: promptText } = await copyReelAgentJob(reel.slug);
                          setRequest(promptText);
                          try {
                            await navigator.clipboard.writeText(promptText);
                            setStatus('Agent request copied.');
                          } catch {
                            setStatus('Agent request saved. Copy it below.');
                          }
                        } catch (err) {
                          problem(err);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Copy request
                    </button>
                  )}
                </div>
              </div>
            )}

            <Review
              reel={reel}
              state={state}
              version={version}
              message={message}
              comments={pins}
              edits={edits}
              simple={{
                onPin: (pin) => {
                  setDraft(pin);
                  setText('');
                  setError('');
                },
                jump,
              }}
            />
            {draft && (
              <form
                className="sm-composer"
                aria-label="New timeline pin"
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setDraft(null);
                }}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!text.trim() || busy) return;
                  setBusy(true);
                  setError('');
                  void comments
                    .save({ pin: draft, text: text.trim() })
                    .then(() => {
                      setDraft(null);
                      setText('');
                      setStatus('Pin saved.');
                    }, problem)
                    .finally(() => setBusy(false));
                }}
              >
                <h2>Pin at <span className="num">{formatClock(draft.time ?? 0)}</span></h2>
                <label>
                  What should change here? (required)
                  <textarea
                    autoFocus
                    required
                    maxLength={4000}
                    value={text}
                    disabled={busy}
                    onChange={(event) => setText(event.target.value)}
                  />
                </label>
                <div className="sm-form-actions">
                  <button type="button" className="c-act" disabled={busy} onClick={() => setDraft(null)}>
                    Cancel pin
                  </button>
                  <button type="submit" className="btn" disabled={busy || !text.trim()}>
                    Add pin
                  </button>
                </div>
              </form>
            )}
          </div>

          <aside className="sm-pins" aria-label="Your pins">
            <div className="sm-pins-heading">
              <h2>Your pins <span className="num">{pins.length}</span></h2>
              <button className="c-act" type="button" disabled={!pins.length} onClick={() => stepPin(-1)}>
                Previous pin
              </button>
              <button className="c-act" type="button" disabled={!pins.length} onClick={() => stepPin(1)}>
                Next pin
              </button>
            </div>
            <p className="meta">
              Jump between pins with <kbd className="sm-kbd">[</kbd> and <kbd className="sm-kbd">]</kbd>
            </p>
            {pins.length === 0 && (
              <div className="empty">
                <h3>What would you change?</h3>
                <p>Click the timeline, then describe it.</p>
                <span className="terrain" aria-hidden="true" />
              </div>
            )}
            <ol className="sm-pin-list">
              {pins.map((pin, index) => (
                <li key={pin.id} data-selected={pin.id === selected}>
                  <button
                    type="button"
                    className="sm-pin-jump"
                    aria-label={`Pin ${pin.number} at ${formatClock(pin.pin.time)}: ${pin.text}`}
                    onClick={() => jumpTo(index)}
                  >
                    <span className="num">{pin.number} · {formatClock(pin.pin.time)}</span>
                    <span>{pin.state ? 'Needs attention' : pin.sent ? 'Copied' : 'New'}</span>
                    <span>{pin.text}</span>
                  </button>
                  {pin.stateReason && <p className="meta">{pin.stateReason}</p>}
                  {editing === pin.id ? (
                    <form
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') setEditing(null);
                      }}
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (!editText.trim() || busy) return;
                        setBusy(true);
                        void comments
                          .edit(pin.id, editText.trim())
                          .then(() => setEditing(null), problem)
                          .finally(() => setBusy(false));
                      }}
                    >
                      <label>
                        Edit pin note
                        <textarea
                          required
                          autoFocus
                          value={editText}
                          onChange={(event) => setEditText(event.target.value)}
                        />
                      </label>
                      <button className="c-act" type="submit" disabled={busy || !editText.trim()}>
                        Save note
                      </button>
                      <button className="c-act" type="button" onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <div className="sm-pin-actions">
                      <button
                        className="c-act"
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setEditing(pin.id);
                          setEditText(pin.text);
                        }}
                      >
                        Edit note
                      </button>
                      <button
                        className="c-act"
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setBusy(true);
                          void comments.remove(pin.id).catch(problem).finally(() => setBusy(false));
                        }}
                      >
                        Delete pin
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ol>
            <div className="sm-regenerate">
              <button
                type="button"
                className="btn"
                disabled={busy || !version || !pins.some((pin) => !pin.state)}
                onClick={() => void regenerate()}
              >
                Regenerate (<span className="num">{pins.filter((pin) => !pin.state).length}</span> pins)
              </button>
              <p className="meta">Copies the request for your agent.</p>
            </div>
          </aside>
        </div>
      )}

      {(error || comments.error || edits.error) && (
        <p className="sm-message" role="alert">{error || comments.error || edits.error}</p>
      )}
      <p className="sm-message" role="status">{status}</p>
      {request && (
        <details className="sm-request">
          <summary>Request to copy</summary>
          <textarea
            aria-label="Request to copy"
            readOnly
            value={request}
            onFocus={(event) => event.target.select()}
          />
        </details>
      )}
    </div>
  );
}
