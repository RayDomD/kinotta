import { useEffect, useRef, useState } from 'react';
import { fetchEffects, fetchEffectsBox, saveEffectsBox } from './api/index.ts';
import { EffectsGallery } from './EffectsGallery.tsx';
import type { Comment, EffectCatalogueEntry } from './api/index.ts';
import { PREVIEW_HTML } from './Library.tsx';
import type { CommentsState } from './useComments.ts';

export const EFFECTS_COMPUTER_QUERY = '(max-width: 600px), (pointer: coarse)';
export const EFFECT_DRAG_TYPE = 'application/x-kinotta-effect';
const NOTE_SAVE_MS = 350;
const noteFlushers = new Set<() => Promise<void>>();
/** Build waits for pin notes as well as the note on the whole reel. */
export async function flushPinnedNotes(): Promise<void> { await Promise.all([...noteFlushers].map((flush) => flush())); }

export function EffectsDrawer() {
  const [effects, setEffects] = useState<EffectCatalogueEntry[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [browsing, setBrowsing] = useState(false);
  const [error, setError] = useState('');
  const latest = useRef<string[]>([]);
  const saving = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    let active = true;
    Promise.all([fetchEffects(), fetchEffectsBox()]).then(([entries, ids]) => { if (!active) return; setEffects(entries); latest.current = ids; setChosen(ids); }, (problem: Error) => { if (active) setError(problem.message); });
    return () => { active = false; };
  }, []);
  /** Adds or removes one effect. The box shows the change at once; saves run one after another so quick clicks land in order. */
  const toggle = (id: string) => {
    const before = latest.current;
    const next = before.includes(id) ? before.filter((item) => item !== id) : [...before, id];
    latest.current = next; setChosen(next); setError('');
    saving.current = saving.current.then(() => saveEffectsBox(next)).then(() => {}, (problem: Error) => { setError(problem.message || 'Could not save the Effects box.'); });
  };
  const inBox = chosen.map((id) => effects.find((effect) => effect.id === id)).filter((effect): effect is EffectCatalogueEntry => !!effect);
  return <><p className="fx-phone-note meta">Adding effects needs a computer.</p><section className="fx-drawer" aria-label="Effects to pin">
    <h2>Effects</h2>
    <p className="meta">{inBox.length > 0 ? 'Drag an effect onto a frame.' : 'Your box is empty. Browse effects and click the ones you want here, then drag them onto a frame.'}</p>
    {error && <p role="alert">{error}</p>}
    {inBox.length > 0 && <div className="fx-choices">{inBox.map((effect) => <div key={effect.id} className="fx-choice" draggable data-effect={effect.id}
      onDragStart={(event) => { event.dataTransfer.setData(EFFECT_DRAG_TYPE, effect.id); event.dataTransfer.effectAllowed = 'copy'; }}>
      <div className="still" aria-hidden="true" dangerouslySetInnerHTML={{ __html: PREVIEW_HTML[effect.id] ?? '' }} />
      <strong>{effect.name}</strong><span>{effect.instant ? 'Instant · free' : 'Needs the agent'}</span><small>{effect.needs}</small>
    </div>)}</div>}
    <button type="button" className="c-act fx-browse" onClick={() => setBrowsing(true)}>Browse effects</button>
    <EffectsGallery open={browsing} effects={effects} chosen={chosen} toggle={toggle} onClose={() => setBrowsing(false)} />
  </section></>;
}

export function PinnedCommentCard({ comment, state, editable, remove }: { comment: Comment; state: CommentsState; editable: boolean; remove(): void }) {
  const [text, setText] = useState(comment.text);
  const [problem, setProblem] = useState('');
  const [saving, setSaving] = useState(false);
  const mounted = useRef(true);
  const saved = useRef(comment.text);
  const pending = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(text);
  latest.current = text;
  const persist = () => {
    clearTimeout(timer.current);
    const value = latest.current;
    pending.current = pending.current.catch(() => {}).then(async () => {
      if (mounted.current) setSaving(true);
      try { if (value !== saved.current) { await state.edit(comment.id, value); saved.current = value; } if (mounted.current) setProblem(''); }
      catch (error) { if (mounted.current) setProblem(error instanceof Error ? error.message : 'Could not save this note.'); throw error; }
      finally { if (mounted.current) setSaving(false); }
    });
    return pending.current;
  };
  const persistRef = useRef(persist);
  persistRef.current = persist;
  useEffect(() => {
    mounted.current = true;
    const flush = () => persistRef.current(); noteFlushers.add(flush);
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
      void flush().catch(() => {}).finally(() => noteFlushers.delete(flush));
    };
  }, []);
  useEffect(() => { if (latest.current === saved.current) { setText(comment.text); saved.current = comment.text; } }, [comment.text]);
  const instant = !!comment.instant && !text.trim();
  return <li className="card fx-pin-card" data-pin-card={comment.id} tabIndex={0}
    onKeyDown={(event) => { if (event.target === event.currentTarget && editable && (event.key === 'Delete' || event.key === 'Backspace')) { event.preventDefault(); remove(); } }}>
    <div className="fx-pin-heading"><span className="num">{String(comment.number).padStart(2, '0')}</span><strong>{comment.effectName ?? 'Inserted shot'}</strong><span className="meta">Shot {comment.pin.shot}{comment.pin.kind === 'frame' && comment.pin.alternate ? ` · ${comment.pin.alternate}` : ''}</span></div>
    <p className="fx-pin-status">{comment.sent ? 'Sent to your agent' : instant ? 'Instant · free · Done' : 'Needs the agent · Waiting for Build'}</p>
    <label> {comment.insertShot ? 'Describe the new shot' : 'Note (optional)'}
      <textarea aria-label={`${comment.insertShot ? 'New shot description' : 'Note for'} ${comment.effectName ?? 'inserted shot'} ${comment.number}`} value={text} readOnly={!editable || comment.sent}
        placeholder={comment.insertShot ? "Describe what the new shot shows." : "Writing a note sends this pin to the agent."}
        onChange={(event) => { setText(event.target.value); latest.current = event.target.value; clearTimeout(timer.current); timer.current = setTimeout(() => { void persist().catch(() => {}); }, NOTE_SAVE_MS); }}
        onBlur={() => { void persist().catch(() => {}); }} />
    </label>
    {saving && <p className="meta" role="status">Saving…</p>}{problem && <p role="alert">{problem}</p>}
    {editable && <button className="c-act" type="button" aria-label={`Delete pin ${comment.number}`} onClick={remove}>Delete</button>}
  </li>;
}
