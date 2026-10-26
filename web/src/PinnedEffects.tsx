import { useEffect, useRef, useState } from 'react';
import { fetchEffects } from './api/index.ts';
import type { Comment, EffectCatalogueEntry } from './api/index.ts';
import { PREVIEW_HTML } from './Library.tsx';
import type { CommentsState } from './useComments.ts';

export const EFFECT_DRAG_TYPE = 'application/x-kinotta-effect';
const NOTE_SAVE_MS = 350;
const noteFlushers = new Set<() => Promise<void>>();
/** Build waits for pin notes as well as the note on the whole reel. */
export async function flushPinnedNotes(): Promise<void> { await Promise.all([...noteFlushers].map((flush) => flush())); }

export function EffectsDrawer() {
  const [effects, setEffects] = useState<EffectCatalogueEntry[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { let active = true; fetchEffects().then((entries) => { if (active) setEffects(entries); }, (error: Error) => { if (active) setError(error.message); }); return () => { active = false; }; }, []);
  return <section className="fx-drawer" aria-label="Effects to pin">
    <h2>Effects</h2><p className="meta">Drag an effect onto a frame. Adding effects needs a computer.</p>
    {error && <p role="alert">{error}</p>}
    <div className="fx-choices">{effects.map((effect) => <div key={effect.id} className="fx-choice" draggable data-effect={effect.id}
      onDragStart={(event) => { event.dataTransfer.setData(EFFECT_DRAG_TYPE, effect.id); event.dataTransfer.effectAllowed = 'copy'; }}>
      <div className="still" aria-hidden="true" dangerouslySetInnerHTML={{ __html: PREVIEW_HTML[effect.id] ?? '' }} />
      <strong>{effect.name}</strong><span>{effect.instant ? 'Instant · free' : 'Needs the agent'}</span><small>{effect.needs}</small>
    </div>)}</div>
  </section>;
}

export function PinnedCommentCard({ comment, state, editable, remove }: { comment: Comment; state: CommentsState; editable: boolean; remove(): void }) {
  const [text, setText] = useState(comment.text);
  const [problem, setProblem] = useState('');
  const [saving, setSaving] = useState(false);
  const saved = useRef(comment.text);
  const pending = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(text);
  latest.current = text;
  const persist = () => {
    clearTimeout(timer.current);
    const value = latest.current;
    pending.current = pending.current.catch(() => {}).then(async () => {
      setSaving(true);
      try { if (value !== saved.current) { await state.edit(comment.id, value); saved.current = value; } setProblem(''); }
      catch (error) { setProblem(error instanceof Error ? error.message : 'Could not save this note.'); throw error; }
      finally { setSaving(false); }
    });
    return pending.current;
  };
  const persistRef = useRef(persist);
  persistRef.current = persist;
  useEffect(() => {
    const flush = () => persistRef.current(); noteFlushers.add(flush);
    return () => { clearTimeout(timer.current); noteFlushers.delete(flush); };
  }, []);
  useEffect(() => { if (latest.current === saved.current) { setText(comment.text); saved.current = comment.text; } }, [comment.text]);
  const instant = !!comment.instant && !text.trim();
  return <li className="card fx-pin-card" data-pin-card={comment.id} tabIndex={0}
    onKeyDown={(event) => { if (event.target === event.currentTarget && editable && (event.key === 'Delete' || event.key === 'Backspace')) { event.preventDefault(); remove(); } }}>
    <div className="fx-pin-heading"><span className="num">{String(comment.number).padStart(2, '0')}</span><strong>{comment.effectName ?? 'Inserted shot'}</strong><span className="meta">Shot {comment.pin.shot}{comment.pin.kind === 'frame' && comment.pin.alternate ? ` · ${comment.pin.alternate}` : ''}</span></div>
    <p className="fx-pin-status">{comment.sent ? 'Sent to your agent' : instant ? 'Instant · free · Done' : 'Needs the agent · Waiting for Build'}</p>
    <label> {comment.insertShot ? 'Describe the new shot' : 'Note (optional)'}
      <textarea aria-label={`${comment.insertShot ? 'New shot description' : 'Note for'} ${comment.effectName ?? 'inserted shot'} ${comment.number}`} value={text} readOnly={!editable || comment.sent}
        placeholder="Writing a note sends this pin to the agent."
        onChange={(event) => { setText(event.target.value); latest.current = event.target.value; clearTimeout(timer.current); timer.current = setTimeout(() => { void persist().catch(() => {}); }, NOTE_SAVE_MS); }}
        onBlur={() => { void persist().catch(() => {}); }} />
    </label>
    {saving && <p className="meta" role="status">Saving…</p>}{problem && <p role="alert">{problem}</p>}
    {editable && <button className="c-act" type="button" aria-label={`Delete pin ${comment.number}`} onClick={remove}>Delete</button>}
  </li>;
}
