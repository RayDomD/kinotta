import type { EditsState } from './review/index.ts';

/**
 * A save leaves out an edit that no longer applies instead of refusing. This names what it left out, with the shot, until
 * dismissed. Undo brings the edits back (flagged), and then the Edits panel opens on the first of them.
 */
export function SkippedNote({ edits, onShow }: { edits: EditsState; onShow(id: string, time?: number): void }) {
  const skipped = edits.list?.skipped;
  if (!skipped) return null;
  const count = skipped.edits.length;
  const first = skipped.edits[0]!;
  return (
    <div className="skipped-note" role="status" aria-label="Skipped edits">
      <p>{`Saved as v${skipped.version} without ${count === 1 ? 'one edit' : `${count} edits`} that no longer applied. Undo brings ${count === 1 ? 'it' : 'them'} back.`}</p>
      <ul>
        {skipped.edits.map((edit) => <li key={edit.id}>{`${edit.text}${edit.shot ? ` (shot ${edit.shot})` : ''}`}</li>)}
      </ul>
      <button type="button" className="c-act" disabled={edits.busy} onClick={() => { void edits.undo().then(() => onShow(first.id, first.time)); }}>Undo</button>
      <button type="button" className="c-act" disabled={edits.busy} onClick={() => void edits.dismissSkipped()}>Dismiss</button>
    </div>
  );
}
