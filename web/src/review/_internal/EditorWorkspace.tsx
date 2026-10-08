import { createContext, useContext, useEffect, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { actionForKey, keyChord, readEditorSettings, saveEditorSettings } from './editor-settings.ts';
import type { EditorSettings } from './editor-settings.ts';
import { EditorSettingsSheet } from './EditorSettingsSheet.tsx';

interface Workspace {
  settings: EditorSettings;
  setSettings: Dispatch<SetStateAction<EditorSettings>>;
  railOpen: boolean;
  setRailOpen: Dispatch<SetStateAction<boolean>>;
  railTab: 'reel' | 'media';
  setRailTab: Dispatch<SetStateAction<'reel' | 'media'>>;
  settingsOpen: boolean;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  mediaHost: HTMLDivElement | null;
  setMediaHost: Dispatch<SetStateAction<HTMLDivElement | null>>;
  clipHost: HTMLDivElement | null;
  setClipHost: Dispatch<SetStateAction<HTMLDivElement | null>>;
  pinHost: HTMLDivElement | null;
  setPinHost: Dispatch<SetStateAction<HTMLDivElement | null>>;
  sectionHost: HTMLDivElement | null;
  setSectionHost: Dispatch<SetStateAction<HTMLDivElement | null>>;
  panelTab: 'edits' | 'comments' | 'clip';
  setPanelTab: Dispatch<SetStateAction<'edits' | 'comments' | 'clip'>>;
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
  const [railTab, setRailTab] = useState<'reel' | 'media'>('reel');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mediaHost, setMediaHost] = useState<HTMLDivElement | null>(null);
  const [clipHost, setClipHost] = useState<HTMLDivElement | null>(null);
  const [pinHost, setPinHost] = useState<HTMLDivElement | null>(null);
  const [sectionHost, setSectionHost] = useState<HTMLDivElement | null>(null);
  const [panelTab, setPanelTab] = useState<'edits' | 'comments' | 'clip'>('edits');
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.dataset.accent = settings.accent;
    saveEditorSettings(settings);
  }, [settings]);
  return <Context.Provider value={{ settings, setSettings, railOpen, setRailOpen, railTab, setRailTab, settingsOpen, setSettingsOpen, mediaHost, setMediaHost, clipHost, setClipHost, pinHost, setPinHost, sectionHost, setSectionHost, panelTab, setPanelTab }}>
    <div className="editor-workspace" {...verifyAttrs(settings, railOpen, railTab, settingsOpen)} onKeyDown={(event) => {
      const target = event.target as HTMLElement;
      if (event.defaultPrevented || settingsOpen || target.closest('input, textarea, select, [contenteditable="true"]') || !target.closest('[data-review-shell="true"]')) return;
      const action = actionForKey(settings.keys, keyChord(event.nativeEvent));
      if (action === 'rail') { event.preventDefault(); setRailTab('media'); setRailOpen((open) => !open); }
      if (action === 'settings') { event.preventDefault(); setSettingsOpen(true); }
    }}>
      {children}
      <EditorSettingsSheet open={settingsOpen} settings={settings} onChange={setSettings} onClose={() => setSettingsOpen(false)} />
    </div>
  </Context.Provider>;
}
