import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { AGENT_PROVIDER_LABELS, fetchAgentSettings, saveAgentSettings } from '../../api/_internal/client.ts';
import type { AgentProvider, AgentSettings } from '../../api/_internal/client.ts';
import { DEFAULT_SETTINGS, EDITOR_ACTIONS, keyChord, keyConflicts } from './editor-settings.ts';
import type { EditorSettings } from './editor-settings.ts';
import { EditorIcon } from './EditorIcon.tsx';

const PANES = ['Keyboard', 'Editing', 'Layout', 'Appearance', 'Agent'] as const;
function verifyAttrs(open: boolean, pane: string, conflicts: number) {
  return { 'data-verify-unit': 'EditorSettingsSheet', 'data-verify-status': open ? 'open' : 'closed', 'data-verify-pane': pane, 'data-verify-conflicts': conflicts, 'data-verify-error': String(conflicts > 0) };
}

export function EditorSettingsSheet({ open, settings, onChange, onClose }: { open: boolean; settings: EditorSettings; onChange: Dispatch<SetStateAction<EditorSettings>>; onClose(): void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [pane, setPane] = useState<(typeof PANES)[number]>('Keyboard');
  const [agent, setAgent] = useState<AgentSettings | null>(null);
  const [agentError, setAgentError] = useState('');
  const [savingAgent, setSavingAgent] = useState(false);
  const conflicts = keyConflicts(settings.keys);
  useEffect(() => {
    if (open && !dialog.current!.open) dialog.current!.showModal();
    if (!open && dialog.current!.open) dialog.current!.close();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    let current = true;
    setAgent(null);
    setAgentError('');
    void fetchAgentSettings().then(
      (settings) => { if (current) setAgent(settings); },
      (err: unknown) => { if (current) setAgentError(err instanceof Error ? err.message : 'Could not load agent settings.'); },
    );
    return () => { current = false; };
  }, [open]);
  const changeAgent = async (provider: AgentProvider) => {
    setSavingAgent(true);
    setAgentError('');
    try { setAgent(await saveAgentSettings({ provider })); }
    catch (err) { setAgentError(err instanceof Error ? err.message : 'Could not save agent settings.'); }
    finally { setSavingAgent(false); }
  };
  const change = <K extends keyof EditorSettings>(key: K, value: EditorSettings[K]) => onChange((state) => ({ ...state, [key]: value }));
  return <dialog ref={dialog} className="editor-settings" aria-labelledby="editor-settings-title" {...verifyAttrs(open, pane, conflicts.length)} onCancel={onClose} onClose={onClose}>
    <header><h2 id="editor-settings-title">Settings</h2><button type="button" className="editor-icon-button" aria-label="Close Settings" onClick={onClose}><EditorIcon name="close" /></button></header>
    <div className="editor-settings-body">
      <nav aria-label="Settings categories">{PANES.map((name) => <button type="button" key={name} aria-current={pane === name ? 'page' : undefined} onClick={() => setPane(name)}>{name}</button>)}</nav>
      <section aria-label={`${pane} settings`}>
        <h3>{pane}</h3>
        {pane === 'Agent' && <div className="editor-setting-fields">
          <label className="editor-agent-field">Agent for background builds<select value={agent?.provider ?? ''} disabled={!agent || savingAgent} onChange={(event) => void changeAgent(event.target.value as AgentProvider)}>
            {!agent && <option value="">Loading...</option>}
            {Object.entries(AGENT_PROVIDER_LABELS).map(([provider, label]) => <option key={provider} value={provider}>{label}</option>)}
          </select></label>
          {agent && <p className="editor-settings-note">{agent.usageNotice}</p>}
          {agentError && <p role="alert">{agentError}</p>}
        </div>}
        {pane === 'Keyboard' && <>
          <div className="editor-settings-note"><p>Choose a key field and press the shortcut. Backspace clears it. Escape closes Settings.</p><button type="button" className="rv-tool" onClick={() => change('keys', { ...DEFAULT_SETTINGS.keys })}>Reset all shortcuts</button></div>
          {conflicts.map((conflict) => <p role="alert" key={conflict.key}>{conflict.key} is assigned to {conflict.actions.map((id) => EDITOR_ACTIONS.find((action) => action.id === id)!.label).join(' and ')}. Reassign one to use it.</p>)}
          <div className="editor-key-list">{EDITOR_ACTIONS.map((action) => <label key={action.id}><span>{action.label}</span><input aria-label={`${action.label} shortcut`} value={settings.keys[action.id]} placeholder="Unassigned" readOnly onKeyDown={(event) => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); return; }
            if (event.key === 'Tab' || ['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return;
            event.preventDefault(); event.stopPropagation();
            const key = event.key === 'Backspace' ? '' : keyChord(event.nativeEvent);
            onChange((state) => ({ ...state, keys: { ...state.keys, [action.id]: key } }));
          }} /></label>)}</div>
        </>}
        {pane === 'Editing' && <div className="editor-setting-fields">
          <label><input type="checkbox" checked={settings.snap} onChange={(event) => change('snap', event.target.checked)} />Snap to playhead and cuts</label>
          {([['nudge', 'Nudge step'], ['fade', 'Default fade length'], ['gap', 'Gap length']] as const).map(([key, label]) => <label key={key}>{label}<span><input aria-label={label} type="number" min={key === 'fade' ? 0 : 0.01} step="0.01" defaultValue={settings[key]} onBlur={(event) => { const value = Number(event.target.value); if (Number.isFinite(value) && (key === 'fade' ? value >= 0 : value > 0)) change(key, value); else event.target.value = String(settings[key]); }} /> seconds</span></label>)}
        </div>}
        {pane === 'Layout' && <div className="editor-setting-fields">
          <label><input type="checkbox" checked={settings.railOpen} onChange={(event) => change('railOpen', event.target.checked)} />Open rail at start</label>
          <label><input type="checkbox" checked={settings.toolbarLabels} onChange={(event) => change('toolbarLabels', event.target.checked)} />Show toolbar labels</label>
          <label>Timecode<select aria-label="Timecode" value={settings.timecode} onChange={(event) => change('timecode', event.target.value as EditorSettings['timecode'])}><option value="seconds">Seconds</option><option value="frames">Frames</option></select></label>
        </div>}
        {pane === 'Appearance' && <div className="editor-setting-fields">
          <label>Theme<select aria-label="Theme" value={settings.theme} onChange={(event) => change('theme', event.target.value as EditorSettings['theme'])}><option value="dark">Neutral dark</option><option value="light">Light</option></select></label>
          <label>Accent<select aria-label="Accent" value={settings.accent} onChange={(event) => change('accent', event.target.value as EditorSettings['accent'])}><option value="ice">Ice blue</option><option value="amber">Amber</option><option value="mint">Mint</option></select></label>
        </div>}
      </section>
    </div>
  </dialog>;
}
