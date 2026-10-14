import { useEffect, useRef } from 'react';
import { EDITOR_ACTIONS } from './editor-settings.ts';
import type { EditorSettings } from './editor-settings.ts';

const VIEW = new Set(['play', 'left', 'right', 'prevShot', 'nextShot', 'start', 'end', 'focus', 'fit', 'zoomIn', 'zoomOut', 'rail', 'settings', 'shortcuts']);
export function ShortcutSheet({ open, settings, onClose }: { open: boolean; settings: EditorSettings; onClose(): void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (open && !dialog.current!.open) dialog.current!.showModal(); if (!open && dialog.current!.open) dialog.current!.close(); }, [open]);
  return <dialog ref={dialog} className="editor-settings editor-shortcuts" aria-labelledby="shortcut-title" onCancel={onClose} onClose={onClose}>
    <header><h2 id="shortcut-title">Keyboard shortcuts</h2><button type="button" className="rv-tool" aria-label="Close shortcuts" onClick={onClose}>Close · Esc</button></header>
    {['Playback and view', 'Editing and review'].map((group, index) => <section key={group}><h3>{group}</h3><dl>{EDITOR_ACTIONS.filter((action) => VIEW.has(action.id) === (index === 0)).map((action) => <div key={action.id}><dt>{action.label}</dt><dd><kbd>{settings.keys[action.id] || 'Unbound'}</kbd></dd></div>)}</dl></section>)}
    <p>Change bindings in Settings.</p>
  </dialog>;
}
