import { useEffect, useState } from 'react';
import { decidePinNote, fetchBuiltPinNotes, type BuiltPinNote } from './api/index.ts';

export function KeepPinNotes({ slug, version }: { slug: string; version: number }) {
  const [notes, setNotes] = useState<BuiltPinNote[]>([]);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    fetchBuiltPinNotes(slug).then((notes) => { if (current) { setNotes(notes); setProblem(''); } }, (error: Error) => { if (current) setProblem(error.message); });
    return () => { current = false; };
  }, [slug, version]);
  async function decide(note: BuiltPinNote, keep: boolean) {
    setBusy(note.id); setProblem('');
    try { await decidePinNote(slug, note.id, keep); setNotes((notes) => notes.filter((item) => item.id !== note.id)); }
    catch (error) { setProblem(error instanceof Error ? error.message : 'Could not save this choice.'); }
    finally { setBusy(null); }
  }
  return <>{notes.map((note) => <section key={note.id} className="fx-keep" aria-label="Keep this note">
    <h3>Keep this note in this reel's style?</h3>
    <blockquote>{note.text}</blockquote>
    <p>Kinotta will follow it on later versions of this reel. To use it on other reels, reuse this style or save it as yours. You can see or turn off rules in the Check step.</p>
    <div><button className="btn" type="button" disabled={busy !== null} onClick={() => void decide(note, true)}>Always for this reel</button>
      <button className="c-act" type="button" disabled={busy !== null} onClick={() => void decide(note, false)}>Only this version</button></div>
  </section>)}{problem && <p role="alert">{problem}</p>}</>;
}
