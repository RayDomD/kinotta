import { EDITOR_ACTIONS } from './editor-settings.ts';
import type { EditorAction, EditorSettings } from './editor-settings.ts';
import { EditorIcon } from './EditorIcon.tsx';

export type EditorTool = 'select' | 'blade' | 'snip';
const GROUPS = [['select', 'blade', 'snip'], ['split', 'gap', 'duplicate'], ['snap', 'pin']] as const;
interface Props {
  tool: EditorTool;
  pinning?: boolean;
  settings: EditorSettings;
  enabled: (action: EditorAction) => boolean;
  onAction: (action: EditorAction) => void;
}
function verifyAttrs(tool: EditorTool, settings: EditorSettings) {
  return { 'data-verify-unit': 'EditorToolbar', 'data-verify-tool': tool, 'data-verify-labels': String(settings.toolbarLabels), 'data-verify-snap': String(settings.snap) };
}
export function EditorToolbar({ tool, pinning = false, settings, enabled, onAction }: Props) {
  return <div className="editor-toolbar" role="toolbar" aria-label="Timeline tools" {...verifyAttrs(tool, settings)}>
    {GROUPS.map((group, index) => <div className="editor-tool-group" key={index}>{group.map((id) => {
      const action = EDITOR_ACTIONS.find((item) => item.id === id)!;
      const key = settings.keys[id];
      const active = id === tool || id === 'snap' && settings.snap || id === 'pin' && pinning;
      return <button type="button" key={id} aria-label={action.label} title={`${id === 'pin' && pinning ? 'Cancel pin placement' : action.label}${key ? ` (${key})` : ''}`} aria-keyshortcuts={key || undefined} aria-pressed={['select', 'blade', 'snip', 'snap', 'pin'].includes(id) ? active : undefined} disabled={!enabled(id)} onClick={() => onAction(id)}>
        <EditorIcon name={id} />{settings.toolbarLabels && <span>{action.label}</span>}
      </button>;
    })}</div>)}
  </div>;
}
