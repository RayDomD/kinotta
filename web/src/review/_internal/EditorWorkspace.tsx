import { createContext, useContext, useEffect, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { actionForKey, keyChord, readEditorSettings, saveEditorSettings } from './editor-settings.ts';
import type { EditorSettings } from './editor-settings.ts';
import { EditorSettingsSheet } from './EditorSettingsSheet.tsx';
import { ShortcutSheet } from './ShortcutSheet.tsx';

interface Workspace {
  focus: boolean;
  setFocus: Dispatch<SetStateAction<boolean>>;
  shortcutsOpen: boolean;
  setShortcutsOpen: Dispatch<SetStateAction<boolean>>;
  settings: EditorSettings;
  setSettings: Dispatch<SetStateAction<EditorSettings>>;
  railOpen: boolean;
  setRailOpen: Dispatch<SetStateAction<boolean>>;
  panelOpen: boolean;
  setPanelOpen: Dispatch<SetStateAction<boolean>>;
  railTab: 'reel' | 'media';
  setRailTab: Dispatch<SetStateAction<'reel' | 'media'>>;
  settingsOpen: boolean;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  mediaHost: HTMLDivElement | null;
  setMediaHost: Dispatch<SetStateAction<HTMLDivElement | null>>;
  clipHost: HTMLDivElement | null;
  setClipHost: Dispatch<SetStateAction<HTMLDivElement | null>>;
  soundHost: HTMLDivElement | null;
  setSoundHost: Dispatch<SetStateAction<HTMLDivElement | null>>;
  pinHost: HTMLDivElement | null;
  setPinHost: Dispatch<SetStateAction<HTMLDivElement | null>>;
  sectionHost: HTMLDivElement | null;
  setSectionHost: Dispatch<SetStateAction<HTMLDivElement | null>>;
  panelTab: 'edits' | 'comments' | 'clip' | 'sound';
  setPanelTab: Dispatch<SetStateAction<'edits' | 'comments' | 'clip' | 'sound'>>;
  /** An edit something outside the panel asked to show: its row is scrolled to and lit, and the playhead moves to `time`. `seq` makes a repeat request count. */
  editFocus: EditFocus | null;
  setEditFocus: Dispatch<SetStateAction<EditFocus | null>>;
}

export interface EditFocus {
  id: string;
  /** Seconds on the open version's timeline, when the edit has a place on it. */
  time?: number;
  seq: number;
}
const Context = createContext<Workspace | null>(null);

export function useEditorWorkspace(): Workspace {
  const state = useContext(Context);
  if (!state) throw new Error('The Review editor needs its workspace.');
  return state;
}

function verifyAttrs(settings: EditorSettings, railOpen: boolean, railTab: string, settingsOpen: boolean) {
  return { 'data-verify-unit': 'EditorWorkspace', 'data-verify-theme': settings.theme, 'data-verify-accent': settings.accent, 'data-verify-rail-open': String(railOpen), 'data-verify-rail-tab': railTab, 'data-verify-settings-open': String(settingsOpen) };
}

export function EditorWorkspace({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(readEditorSettings);
  const [railOpen, setRailOpen] = useState(settings.railOpen);
  const [panelOpen, setPanelOpen] = useState(settings.panelOpen);
  const [railTab, setRailTab] = useState<'reel' | 'media'>('reel');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [focus, setFocus] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [mediaHost, setMediaHost] = useState<HTMLDivElement | null>(null);
  const [clipHost, setClipHost] = useState<HTMLDivElement | null>(null);
  const [soundHost, setSoundHost] = useState<HTMLDivElement | null>(null);
  const [pinHost, setPinHost] = useState<HTMLDivElement | null>(null);
  const [sectionHost, setSectionHost] = useState<HTMLDivElement | null>(null);
  const [panelTab, setPanelTab] = useState<'edits' | 'comments' | 'clip' | 'sound'>('edits');
  const [editFocus, setEditFocus] = useState<EditFocus | null>(null);
  // Both panels remember how the owner left them.
  useEffect(() => { setSettings((state) => state.railOpen === railOpen && state.panelOpen === panelOpen ? state : { ...state, railOpen, panelOpen }); }, [railOpen, panelOpen]);
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.dataset.accent = settings.accent;
    saveEditorSettings(settings);
  }, [settings]);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.defaultPrevented || settingsOpen || shortcutsOpen || target.closest('input, textarea, select, [contenteditable="true"], dialog') || !document.querySelector('[data-review-shell="true"]')) return;
      const action = actionForKey(settings.keys, keyChord(event));
      if (event.key === 'Escape' && focus) { event.preventDefault(); setFocus(false); return; }
      if (!['focus', 'shortcuts', 'rail', 'settings'].includes(action ?? '')) return;
      if (target.closest('button, a, summary, [role="tab"]') && !target.closest('[data-review-shell="true"]')) return;
      event.preventDefault();
      if (action === 'focus') setFocus((value) => !value);
      if (action === 'shortcuts') setShortcutsOpen(true);
      if (action === 'rail') { setRailTab('media'); setRailOpen((open) => !open); }
      if (action === 'settings') setSettingsOpen(true);
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [focus, settings.keys, settingsOpen, shortcutsOpen]);
  return <Context.Provider value={{ focus, setFocus, shortcutsOpen, setShortcutsOpen, settings, setSettings, railOpen, setRailOpen, panelOpen, setPanelOpen, railTab, setRailTab, settingsOpen, setSettingsOpen, mediaHost, setMediaHost, clipHost, setClipHost, soundHost, setSoundHost, pinHost, setPinHost, sectionHost, setSectionHost, panelTab, setPanelTab, editFocus, setEditFocus }}>
    <div className="editor-workspace" {...verifyAttrs(settings, railOpen, railTab, settingsOpen)} onKeyDown={(event) => {
      const target = event.target as HTMLElement;
      if (event.defaultPrevented || settingsOpen || target.closest('input, textarea, select, [contenteditable="true"]') || !target.closest('[data-review-shell="true"]')) return;
      const action = actionForKey(settings.keys, keyChord(event.nativeEvent));
      if (action === 'rail') { event.preventDefault(); setRailTab('media'); setRailOpen((open) => !open); }
      if (action === 'settings') { event.preventDefault(); setSettingsOpen(true); }
    }}>
      {children}
      <EditorSettingsSheet open={settingsOpen} settings={settings} onChange={setSettings} onClose={() => setSettingsOpen(false)} />
      <ShortcutSheet open={shortcutsOpen} settings={settings} onClose={() => setShortcutsOpen(false)} />
    </div>
  </Context.Provider>;
}
