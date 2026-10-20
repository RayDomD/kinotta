import { useEffect, useMemo, useState } from 'react';
import { copyBatch, fetchWorkingVersion, listVideos, startReel } from './api/index.ts';
import type { NewComment, ReelListing, ReelSummary, Version, VideoEntry } from './api/_internal/client.ts';
import { DropZone } from './DropZone.tsx';
import { Review } from './review/index.ts';
import type { EditsState } from './review/index.ts';
import type { CommentsState } from './useComments.ts';
import { formatClock } from './timecode.ts';
import { SimpleCutsContext } from './SimpleTimeline.tsx';
import type { CutBlock, SimpleCutsValue } from './SimpleTimeline.tsx';
import { pieceMap, snipPieces, MIN_SNIP } from '../../server/core/model.ts';
import type { Piece, SnipOperation } from '../../server/core/model.ts';
import './simple.css';

const PROFILE_KEY = 'kinotta-simple-profile-v1';
const PROFILE_FIELDS = [
  ['name', 'Your name'], ['handle', 'Your handle'], ['makes', 'What do you make?'],
  ['language', 'Language on camera'], ['destination', 'Where it goes'],
  ['finish', 'How you finish'], ['music', 'Music'],
] as const;
type Profile = Record<(typeof PROFILE_FIELDS)[number][0], string>;
const DEFAULT_PROFILE: Profile = { name: '', handle: '', makes: '', language: 'English', destination: 'Instagram Reels + TikTok', finish: 'Editable CapCut project + MP4', music: 'Pick something that fits' };

function readProfile(): Profile | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null');
    if (!value || typeof value !== 'object' || !PROFILE_FIELDS.every(([key]) => typeof (value as Profile)[key] === 'string' && (value as Profile)[key].trim())) return null;
    return value as Profile;
  } catch { return null; }
}

/** Simple mode is the default on each new browser tab; an explicit editor switch survives reload. */
export function startsInSimpleMode(): boolean {
  try { return sessionStorage.getItem('kinotta-mode') !== 'editor'; } catch { return true; }
}

function AboutYou({ profile, onSave, onCancel }: { profile: Profile | null; onSave(profile: Profile): void; onCancel?(): void }) {
  const [draft, setDraft] = useState(profile ?? DEFAULT_PROFILE);
  return <main className="sm-about"><h1>About you</h1><p>Set your defaults once. You can change them in Your profile.</p>
    <form aria-label="About you" onSubmit={(event) => { event.preventDefault(); if (PROFILE_FIELDS.every(([key]) => draft[key].trim())) onSave(draft); }}>
      {PROFILE_FIELDS.map(([key, label]) => <label key={key}>{label}<input required maxLength={200} value={draft[key]} autoComplete={key === 'name' ? 'name' : 'off'} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} /></label>)}
      <div className="sm-form-actions">{onCancel && <button type="button" className="c-act" onClick={onCancel}>Cancel</button>}<button type="submit" className="btn">{profile ? 'Save profile' : 'Let’s make something'}</button></div>
    </form>
  </main>;
}

function SimpleMake({ onStarted }: { onStarted(slug: string): void }) {
  const [videos, setVideos] = useState<VideoEntry[]>([]);
  const [picked, setPicked] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = (path?: string) => listVideos().then((found) => {
    setVideos(found);
    if (path) { setPicked(path); setTitle(found.find((video) => video.path === path)?.suggestedTitle ?? 'My reel'); }
  }, (error: unknown) => setError(error instanceof Error ? error.message : 'Could not list videos.'));
  useEffect(() => { void load(); }, []);
  return <main className="sm-make"><h1>Drop a video. Make it yours.</h1><p>Watch your reel, then pin the moments you want to change.</p>
    <DropZone onImported={(path) => { setError(''); void load(path); }} />
    {videos.length > 0 && <label>Or use a video in this project<select value={picked} disabled={busy} onChange={(event) => { const video = videos.find((video) => video.path === event.target.value); setPicked(video?.path ?? ''); setTitle(video?.suggestedTitle ?? ''); }}><option value="">Choose a video</option>{videos.map((video) => <option key={video.path} value={video.path}>{video.path}</option>)}</select></label>}
    <form className="sm-make-actions" onSubmit={(event) => {
      event.preventDefault(); if (!picked || busy || !title.trim()) return;
      setBusy(true); setError('');
      void startReel({ video: picked, title: title.trim(), deadAir: 'normal' }).then(({ slug }) => onStarted(slug), (error: unknown) => { setError(error instanceof Error ? error.message : 'Could not make the reel. Try again.'); setBusy(false); });
    }}><label>Reel name<input required disabled={busy} value={title} onChange={(event) => setTitle(event.target.value)} /></label><button className="btn" type="submit" disabled={busy || !picked || !title.trim()}>{busy ? 'Making…' : 'Make'}</button></form>
    {busy && <p role="status">Starting your reel. The preview opens while the words are prepared.</p>}
    {error && <p role="alert">{error}</p>}
  </main>;
}

export function SimpleMode({ listing, reel, version, state, message, creating, comments, edits, onOpen, onNew, onStarted, onEditor, onRefresh }: {
  listing: ReelListing; reel: ReelSummary | undefined; version: Version | undefined;
  state: 'loading' | 'error' | 'none' | 'ready'; message?: string; creating: boolean;
  comments: CommentsState; edits: EditsState;
  onOpen(slug: string): void; onNew(): void; onStarted(slug: string): void; onEditor(): void; onRefresh(): void;
}) {
  const [profile, setProfile] = useState(readProfile);
  const [editingProfile, setEditingProfile] = useState(false);
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
  useEffect(() => { setDraft(null); setSelected(null); setJump(null); setStatus(''); setError(''); setRequest(''); setEditing(null); }, [reel?.slug, creating]);
  const cutsValue = useMemo<SimpleCutsValue | null>(() => {
    if (!version?.pieces || version.pieces.length === 0 || !version.isNewest || !edits.list || edits.list.stale || edits.list.handedOff) {
      return null;
    }
    const basePieces: Piece[] = version.pieces.map((p) => ({ in: p.in, out: p.out }));
    const liveSnips = edits.list.operations.filter(
      (op): op is SnipOperation =>
        op.kind === 'snip' && !(edits.list?.flagged && edits.list.flagged[op.id]),
    );
    const baseMaxOut = Math.max(0, ...basePieces.map((p) => p.out));
    const snipMaxTo = Math.max(0, ...liveSnips.map((s) => s.to));
    const sourceDuration = Math.max(baseMaxOut, snipMaxTo);
    if (sourceDuration <= 0) return null;

    let keptPieces: Piece[] = basePieces;
    for (const snip of liveSnips) {
      try {
        keptPieces = snipPieces(keptPieces, snip.from, snip.to);
      } catch {
        // Ignored if snip cannot be applied to current pieces
      }
    }

    const keptMap = pieceMap(keptPieces, sourceDuration);

    const cuts: CutBlock[] = [];
    let prevEnd = 0;
    for (const piece of keptPieces) {
      if (piece.in - prevEnd > MIN_SNIP) {
        const from = prevEnd;
        const to = piece.in;
        const ops = liveSnips.filter((s) => s.from < to + MIN_SNIP && s.to > from - MIN_SNIP);
        const isDeadAir = ops.length > 0 && ops.every((s) => s.by === 'dead-air');
        cuts.push({ from, to, ops, isDeadAir });
      }
      prevEnd = piece.out;
    }
    if (sourceDuration - prevEnd > MIN_SNIP) {
      const from = prevEnd;
      const to = sourceDuration;
      const ops = liveSnips.filter((s) => s.from < to + MIN_SNIP && s.to > from - MIN_SNIP);
      const isDeadAir = ops.length > 0 && ops.every((s) => s.by === 'dead-air');
      cuts.push({ from, to, ops, isDeadAir });
    }

    return {
      sourceDuration,
      basePieces,
      keptPieces,
      keptMap,
      cuts,
      busy: edits.busy,
      restoreCut: async (cut: CutBlock) => {
        for (const op of cut.ops) {
          await edits.remove(op.id);
        }
      },
      replaceCut: async (oldOp: SnipOperation, from: number, to: number) => {
        await edits.remove(oldOp.id);
        const ok = await edits.add({ kind: 'snip', from, to, by: oldOp.by });
        if (!ok) {
          await edits.add({ kind: 'snip', from: oldOp.from, to: oldOp.to, by: oldOp.by });
          return false;
        }
        return true;
      },
    };
  }, [version, edits]);
  const pins = comments.comments;
  const jumpTo = (index: number) => {
    if (!pins.length) return;
    const pin = pins[(index + pins.length) % pins.length]!;
    setSelected(pin.id); setJump((previous) => ({ time: pin.pin.time, seq: (previous?.seq ?? 0) + 1 }));
  };
  const stepPin = (direction: -1 | 1) => {
    const current = pins.findIndex((pin) => pin.id === selected);
    jumpTo(current < 0 ? (direction === 1 ? 0 : pins.length - 1) : current + direction);
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || (event.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === '[' || event.key === ']') { event.preventDefault(); stepPin(event.key === ']' ? 1 : -1); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [pins, selected]);
  const problem = (error: unknown) => setError(error instanceof Error ? error.message : 'Could not complete that action. Try again.');
  const regenerate = async () => {
    if (!reel || !version || busy) return;
    setBusy(true); setError(''); setStatus('Saving the request…'); setRequest('');
    try {
      const sections = version.sections.length > 1 ? version.sections.filter((section) => pins.some((pin) => pin.pin.section === section.id && !pin.state)) : [null];
      const batches: string[] = [];
      let current = version.number;
      for (const section of sections) {
        const saved = await copyBatch(reel.slug, current, section ? { section: section.id } : {});
        batches.push(saved.text);
        current = (await fetchWorkingVersion(reel.slug)).number;
      }
      const body = batches.join('\n\n');
      if (!body) throw new Error('No pins are ready to copy.');
      setRequest(body); onRefresh();
      try { await navigator.clipboard.writeText(body); setStatus('Request copied. Paste it into your agent to regenerate.'); }
      catch { setStatus('Request saved. Copy the request below and paste it into your agent.'); }
    } catch (error) { problem(error); setStatus(''); }
    finally { setBusy(false); }
  };
  return <div className="app sm-app">
    <header className="sm-top"><span className="brand">KINOTTA</span><span>Simple mode</span><div className="sm-top-actions">
      {profile && <button type="button" className="c-act" onClick={() => setEditingProfile(true)}>Your profile</button>}
      <button type="button" className="c-act" onClick={onEditor}>Open in editor</button>
    </div></header>
    {(!profile || editingProfile) ? <AboutYou profile={profile} onCancel={profile ? () => setEditingProfile(false) : undefined} onSave={(next) => {
      try { localStorage.setItem(PROFILE_KEY, JSON.stringify(next)); setStatus('Profile saved on this browser.'); }
      catch { setStatus('Profile is available for this visit. Browser storage is unavailable.'); }
      setProfile(next); setEditingProfile(false);
    }} /> : <>
      <div className="sm-heading"><div><h1>{creating || !reel ? `Your next reel, ${profile.name}` : reel.title}</h1><p>{creating || !reel ? 'One video in. A reel you can make your own.' : 'Watch, pin a moment, and say what should change.'}</p></div>
        <div className="sm-heading-actions"><label>Reel<select aria-label="Choose reel" value={creating ? '' : reel?.slug ?? ''} disabled={busy} onChange={(event) => event.target.value ? onOpen(event.target.value) : onNew()}><option value="">New reel</option>{listing.reels.map((reel) => <option key={reel.slug} value={reel.slug}>{reel.title}</option>)}</select></label><button type="button" className="btn quiet" disabled={busy} onClick={onNew}>New reel</button></div>
      </div>
      {creating || !reel ? <SimpleMake onStarted={onStarted} /> : <div className="sm-studio">
        <div className="sm-preview"><SimpleCutsContext.Provider value={cutsValue}><Review reel={reel} state={state} version={version} message={message} comments={pins} edits={edits} simple={{ onPin: (pin) => { setDraft(pin); setText(''); setError(''); }, jump }} /></SimpleCutsContext.Provider>
          {draft && <form className="sm-composer" aria-label="New timeline pin" onSubmit={(event) => {
            event.preventDefault(); if (!text.trim() || busy) return;
            setBusy(true); setError('');
            void comments.save({ pin: draft, text: text.trim() }).then(() => { setDraft(null); setText(''); setStatus('Pin saved.'); }, problem).finally(() => setBusy(false));
          }}><h2>Pin at <span className="num">{formatClock(draft.time ?? 0)}</span></h2><label>What should change here? (required)<textarea autoFocus required maxLength={4000} value={text} disabled={busy} onChange={(event) => setText(event.target.value)} /></label><div className="sm-form-actions"><button type="button" className="c-act" disabled={busy} onClick={() => setDraft(null)}>Cancel pin</button><button type="submit" className="btn" disabled={busy || !text.trim()}>Add pin</button></div></form>}
        </div>
        <aside className="sm-pins" aria-label="Your pins"><div className="sm-pins-heading"><h2>Your pins <span className="num">{pins.length}</span></h2><button className="c-act" type="button" disabled={!pins.length} onClick={() => stepPin(-1)}>Previous pin</button><button className="c-act" type="button" disabled={!pins.length} onClick={() => stepPin(1)}>Next pin</button></div>
          <p className="meta">Jump between pins with <span className="num">[</span> and <span className="num">]</span></p>
          {pins.length === 0 && <div className="empty"><h3>What would you change?</h3><p>Click the timeline, then describe it.</p><span className="terrain" aria-hidden="true" /></div>}
          <ol className="sm-pin-list">{pins.map((pin, index) => <li key={pin.id} data-selected={pin.id === selected}>
            <button type="button" className="sm-pin-jump" aria-label={`Pin ${pin.number} at ${formatClock(pin.pin.time)}`} onClick={() => jumpTo(index)}><span className="num">{pin.number} · {formatClock(pin.pin.time)}</span><span>{pin.state ? 'Needs attention' : pin.sent ? 'Copied' : 'New'}</span><span>{pin.text}</span></button>
            {pin.stateReason && <p className="meta">{pin.stateReason}</p>}
            {editing === pin.id ? <form onSubmit={(event) => { event.preventDefault(); if (!editText.trim() || busy) return; setBusy(true); void comments.edit(pin.id, editText.trim()).then(() => setEditing(null), problem).finally(() => setBusy(false)); }}><label>Edit pin note<textarea required autoFocus value={editText} onChange={(event) => setEditText(event.target.value)} /></label><button className="c-act" type="submit" disabled={busy || !editText.trim()}>Save note</button><button className="c-act" type="button" onClick={() => setEditing(null)}>Cancel</button></form> : <div className="sm-pin-actions"><button className="c-act" type="button" disabled={busy} onClick={() => { setEditing(pin.id); setEditText(pin.text); }}>Edit note</button><button className="c-act" type="button" disabled={busy} onClick={() => { setBusy(true); void comments.remove(pin.id).catch(problem).finally(() => setBusy(false)); }}>Delete pin</button></div>}
          </li>)}</ol>
          <div className="sm-regenerate"><button type="button" className="btn" disabled={busy || !version || !pins.some((pin) => !pin.state)} onClick={() => void regenerate()}>Regenerate (<span className="num">{pins.filter((pin) => !pin.state).length}</span> pins)</button><p className="meta">Copies the request for your agent.</p></div>
        </aside>
      </div>}
    </>}
    {(error || comments.error || edits.error) && <p className="sm-message" role="alert">{error || comments.error || edits.error}</p>}
    <p className="sm-message" role="status">{status}</p>
    {request && <details className="sm-request"><summary>Request to copy</summary><textarea aria-label="Request to copy" readOnly value={request} onFocus={(event) => event.target.select()} /></details>}
  </div>;
}
