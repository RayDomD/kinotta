import { afterEach, describe, expect, it, vi } from 'vitest';
import { actionForKey, DEFAULT_SETTINGS, keyChord, keyConflicts, normalizeKey, readEditorSettings, saveEditorSettings } from '../../web/src/review/_internal/editor-settings.ts';

afterEach(() => vi.unstubAllGlobals());

describe('viewer editor settings', () => {
  it('keeps Snip, Split, Media and trim keys distinct and identifies equivalent rebindings', () => {
    expect(keyConflicts(DEFAULT_SETTINGS.keys)).toEqual([]);
    expect(actionForKey(DEFAULT_SETTINGS.keys, 's')).toBe('snip');
    expect(actionForKey(DEFAULT_SETTINGS.keys, 'Control+k')).toBe('split');
    expect(actionForKey(DEFAULT_SETTINGS.keys, 'M')).toBe('rail');
    expect(actionForKey(DEFAULT_SETTINGS.keys, '[')).toBe('trimStart');
    expect(normalizeKey('shift+ctrl+x')).toBe('Ctrl+Shift+X');
    expect(normalizeKey('Ctrl++')).toBe('Ctrl++');
    const keys = { ...DEFAULT_SETTINGS.keys, blade: 'Control+k' };
    expect(keyConflicts(keys)).toEqual([{ key: 'Ctrl+K', actions: ['blade', 'split'] }]);
    expect(actionForKey(keys, 'Ctrl+K')).toBeNull();
  });
  it('captures actual event modifiers without swallowing unknown keys', () => {
    expect(keyChord({ key: 'k', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false })).toBe('Ctrl+K');
    expect(keyChord({ key: ' ', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false })).toBe('Space');
    expect(actionForKey(DEFAULT_SETTINGS.keys, 'Ctrl+Q')).toBeNull();
  });
  it('restores persisted viewer choices and rejects malformed defaults field by field', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('window', { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } });
    const settings = { ...DEFAULT_SETTINGS, keys: { ...DEFAULT_SETTINGS.keys, split: 'Ctrl+J' }, theme: 'light' as const, railOpen: true, nudge: 0.25 };
    saveEditorSettings(settings);
    expect(readEditorSettings()).toEqual(settings);
    values.set('kinotta.editor.settings', JSON.stringify({ ...settings, gap: -1, fade: 'bad', theme: 'unknown', keys: { split: 'control+j' } }));
    expect(readEditorSettings()).toMatchObject({ gap: 1, fade: 0.2, theme: 'dark', nudge: 0.25 });
    expect(readEditorSettings().keys.split).toBe('Ctrl+J');
    expect(readEditorSettings().keys.snip).toBe('S');
  });
  it('works when browser storage is blocked, full or corrupted and returns independent defaults', () => {
    vi.stubGlobal('window', { get localStorage() { throw new Error('blocked'); } });
    expect(readEditorSettings()).toEqual(DEFAULT_SETTINGS);
    expect(() => saveEditorSettings(DEFAULT_SETTINGS)).not.toThrow();
    vi.stubGlobal('window', { localStorage: { getItem: () => '{invalid' } });
    const settings = readEditorSettings();
    settings.keys.snip = 'X';
    expect(DEFAULT_SETTINGS.keys.snip).toBe('S');
    expect(readEditorSettings().keys.snip).toBe('S');
  });
});
