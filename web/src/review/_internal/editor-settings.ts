/** One registry drives the toolbar, keyboard handling and viewer key bindings. */
export const EDITOR_ACTIONS = [
  { id: 'select', label: 'Select', key: 'V' },
  { id: 'blade', label: 'Blade', key: 'B' },
  { id: 'snip', label: 'Snip', key: 'S' },
  { id: 'split', label: 'Split at playhead', key: 'Ctrl+K' },
  { id: 'gap', label: 'Insert gap', key: '' },
  { id: 'duplicate', label: 'Duplicate', key: 'Ctrl+D' },
  { id: 'snap', label: 'Snap', key: '' },
  { id: 'pin', label: 'Pin', key: 'P' },
  { id: 'rail', label: 'Toggle Media rail', key: 'M' },
  { id: 'play', label: 'Play or pause', key: 'Space' },
  { id: 'trimStart', label: 'Trim start to playhead', key: '[' },
  { id: 'trimEnd', label: 'Trim end to playhead', key: ']' },
  { id: 'left', label: 'Move or step left', key: 'ArrowLeft' },
  { id: 'right', label: 'Move or step right', key: 'ArrowRight' },
  { id: 'up', label: 'Move up', key: 'ArrowUp' },
  { id: 'down', label: 'Move down', key: 'ArrowDown' },
  { id: 'start', label: 'Go to start', key: 'Home' },
  { id: 'end', label: 'Go to end', key: 'End' },
  { id: 'undo', label: 'Undo', key: 'Ctrl+Z' },
  { id: 'redo', label: 'Redo', key: 'Ctrl+Y' },
  { id: 'remove', label: 'Remove selected clip', key: 'Delete' },
  { id: 'apply', label: 'Apply cut or snip', key: 'Enter' },
  { id: 'cancel', label: 'Clear selection', key: 'Escape' },
  { id: 'settings', label: 'Open Settings', key: '' },
  { id: 'zoomIn', label: 'Zoom in timeline', key: '=' },
  { id: 'zoomOut', label: 'Zoom out timeline', key: '-' },
  { id: 'fit', label: 'Fit timeline', key: 'F' },
] as const;

export type EditorAction = (typeof EDITOR_ACTIONS)[number]['id'];
export interface EditorSettings {
  keys: Record<EditorAction, string>;
  snap: boolean;
  nudge: number;
  fade: number;
  gap: number;
  railOpen: boolean;
  toolbarLabels: boolean;
  timecode: 'seconds' | 'frames';
  theme: 'dark' | 'light';
  accent: 'ice' | 'amber' | 'mint';
}
const STORAGE_KEY = 'kinotta.editor.settings';
export const DEFAULT_SETTINGS: EditorSettings = {
  keys: Object.fromEntries(EDITOR_ACTIONS.map((action) => [action.id, action.key])) as Record<EditorAction, string>,
  snap: true, nudge: 0.1, fade: 0.2, gap: 1,
  railOpen: false, toolbarLabels: false, timecode: 'seconds', theme: 'dark', accent: 'ice',
};

/** Modifiers have one spelling and order, so equivalent chords clash. */
export function normalizeKey(value: string): string {
  const parts: string[] = [];
  let raw = value === ' ' ? 'Space' : value.trim();
  let modifier = /^(ctrl|control|alt|shift|meta|cmd)\+/i.exec(raw);
  while (modifier) {
    parts.push(modifier[1]!);
    raw = raw.slice(modifier[0].length);
    modifier = /^(ctrl|control|alt|shift|meta|cmd)\+/i.exec(raw);
  }
  const aliases: Record<string, string> = { ' ': 'Space', space: 'Space', esc: 'Escape', escape: 'Escape', left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', arrowleft: 'ArrowLeft', arrowright: 'ArrowRight', arrowup: 'ArrowUp', arrowdown: 'ArrowDown', home: 'Home', end: 'End', delete: 'Delete', backspace: 'Backspace', enter: 'Enter', tab: 'Tab' };
  const key = aliases[raw.toLowerCase()] ?? (raw.length === 1 ? raw.toUpperCase() : raw);
  if (!key) return '';
  const modifiers = new Set(parts.map((part) => part.trim().toLowerCase()));
  return [...(modifiers.has('ctrl') || modifiers.has('control') ? ['Ctrl'] : []), ...(modifiers.has('alt') ? ['Alt'] : []), ...(modifiers.has('shift') ? ['Shift'] : []), ...(modifiers.has('meta') || modifiers.has('cmd') ? ['Meta'] : []), key].join('+');
}

export function keyChord(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>): string {
  const key = event.key === ' ' ? 'Space' : event.key;
  return normalizeKey([...(event.ctrlKey ? ['Ctrl'] : []), ...(event.altKey ? ['Alt'] : []), ...(event.shiftKey ? ['Shift'] : []), ...(event.metaKey ? ['Meta'] : []), key].join('+'));
}

export function keyConflicts(keys: EditorSettings['keys']): Array<{ key: string; actions: EditorAction[] }> {
  const groups = new Map<string, EditorAction[]>();
  for (const action of EDITOR_ACTIONS) {
    const key = normalizeKey(keys[action.id]);
    if (key) groups.set(key, [...(groups.get(key) ?? []), action.id]);
  }
  return [...groups].filter(([, actions]) => actions.length > 1).map(([key, actions]) => ({ key, actions }));
}

/** A conflicting chord does nothing until repaired, rather than choosing an arbitrary action. */
export function actionForKey(keys: EditorSettings['keys'], chord: string): EditorAction | null {
  const matches = EDITOR_ACTIONS.filter((action) => keys[action.id] && normalizeKey(keys[action.id]) === normalizeKey(chord));
  return matches.length === 1 ? matches[0]!.id : null;
}

function validated(value: unknown): EditorSettings {
  const defaults = { ...DEFAULT_SETTINGS, keys: { ...DEFAULT_SETTINGS.keys } };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults;
  const stored = value as Record<string, unknown>;
  const keys = stored.keys;
  if (keys && typeof keys === 'object' && !Array.isArray(keys)) {
    for (const action of EDITOR_ACTIONS) {
      const key = (keys as Record<string, unknown>)[action.id];
      if (typeof key === 'string') defaults.keys[action.id] = normalizeKey(key);
    }
  }
  for (const key of ['snap', 'railOpen', 'toolbarLabels'] as const) if (typeof stored[key] === 'boolean') defaults[key] = stored[key];
  for (const key of ['nudge', 'fade', 'gap'] as const) {
    const number = stored[key];
    if (typeof number === 'number' && Number.isFinite(number) && (key === 'fade' ? number >= 0 : number > 0)) defaults[key] = number;
  }
  if (stored.timecode === 'seconds' || stored.timecode === 'frames') defaults.timecode = stored.timecode;
  if (stored.theme === 'dark' || stored.theme === 'light') defaults.theme = stored.theme;
  if (stored.accent === 'ice' || stored.accent === 'amber' || stored.accent === 'mint') defaults.accent = stored.accent;
  return defaults;
}

export function readEditorSettings(): EditorSettings {
  try { return validated(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null')); }
  catch { return validated(null); }
}

export function saveEditorSettings(settings: EditorSettings): void {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); }
  catch { /* Blocked or full storage: settings still apply for this sitting. */ }
}
