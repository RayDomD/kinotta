import { describe, expect, it, vi } from 'vitest';
import { handleSimpleUndoRedo } from '../../web/src/SimpleMode.tsx';

function mockElement(options: {
  tagName?: string;
  isContentEditable?: boolean;
  inDialog?: boolean;
  dialogOpen?: boolean;
} = {}) {
  const tagName = (options.tagName || 'div').toUpperCase();
  const isContentEditable = options.isContentEditable ?? false;
  return {
    tagName,
    isContentEditable,
    closest(selector: string) {
      const parts = selector.split(',').map((s) => s.trim().toLowerCase());
      for (const part of parts) {
        if (part === tagName.toLowerCase() || part === options.tagName?.toLowerCase()) {
          return this;
        }
        if (part === '[contenteditable="true"]' && isContentEditable) {
          return this;
        }
        if (options.inDialog) {
          if (part === 'dialog' || (part === 'dialog[open]' && options.dialogOpen)) {
            return {
              tagName: 'DIALOG',
              open: Boolean(options.dialogOpen),
              hasAttribute(attr: string) {
                return attr === 'open' && Boolean(options.dialogOpen);
              },
            };
          }
        }
      }
      return null;
    },
  };
}

describe('Simple mode undo and redo keyboard shortcuts', () => {
  it('triggers undo on Ctrl+Z or Cmd+Z when edits.list.canUndo is true', () => {
    const undo = vi.fn().mockResolvedValue(undefined);
    const redo = vi.fn().mockResolvedValue(undefined);
    const preventDefault = vi.fn();

    const eventCtrlZ = {
      key: 'z',
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      defaultPrevented: false,
      target: mockElement(),
      preventDefault,
    };

    const handled1 = handleSimpleUndoRedo(eventCtrlZ as any, {
      busy: false,
      list: { canUndo: true, canRedo: false } as any,
      undo,
      redo,
    } as any);

    expect(handled1).toBe(true);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(undo).toHaveBeenCalledTimes(1);
    expect(redo).not.toHaveBeenCalled();

    const eventCmdZ = {
      key: 'Z',
      ctrlKey: false,
      metaKey: true,
      shiftKey: false,
      altKey: false,
      defaultPrevented: false,
      target: mockElement(),
      preventDefault,
    };

    const handled2 = handleSimpleUndoRedo(eventCmdZ as any, {
      busy: false,
      list: { canUndo: true, canRedo: false } as any,
      undo,
      redo,
    } as any);

    expect(handled2).toBe(true);
    expect(preventDefault).toHaveBeenCalledTimes(2);
    expect(undo).toHaveBeenCalledTimes(2);
  });

  it('triggers redo on Ctrl+Shift+Z, Cmd+Shift+Z, or Ctrl+Y when edits.list.canRedo is true', () => {
    const undo = vi.fn().mockResolvedValue(undefined);
    const redo = vi.fn().mockResolvedValue(undefined);
    const preventDefault = vi.fn();

    const eventShiftZ = {
      key: 'Z',
      ctrlKey: true,
      metaKey: false,
      shiftKey: true,
      altKey: false,
      defaultPrevented: false,
      target: mockElement(),
      preventDefault,
    };

    const handled1 = handleSimpleUndoRedo(eventShiftZ as any, {
      busy: false,
      list: { canUndo: false, canRedo: true } as any,
      undo,
      redo,
    } as any);

    expect(handled1).toBe(true);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(redo).toHaveBeenCalledTimes(1);

    const eventCtrlY = {
      key: 'y',
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      defaultPrevented: false,
      target: mockElement(),
      preventDefault,
    };

    const handled2 = handleSimpleUndoRedo(eventCtrlY as any, {
      busy: false,
      list: { canUndo: false, canRedo: true } as any,
      undo,
      redo,
    } as any);

    expect(handled2).toBe(true);
    expect(preventDefault).toHaveBeenCalledTimes(2);
    expect(redo).toHaveBeenCalledTimes(2);
  });

  it('does not trigger or prevent default when edits is busy or cannot undo/redo', () => {
    const undo = vi.fn().mockResolvedValue(undefined);
    const preventDefault = vi.fn();

    const handledBusy = handleSimpleUndoRedo({
      key: 'z',
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      defaultPrevented: false,
      target: mockElement(),
      preventDefault,
    } as any, {
      busy: true,
      list: { canUndo: true, canRedo: false } as any,
      undo,
      redo: vi.fn(),
    } as any);

    expect(handledBusy).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(undo).not.toHaveBeenCalled();

    const handledCannotUndo = handleSimpleUndoRedo({
      key: 'z',
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      defaultPrevented: false,
      target: mockElement(),
      preventDefault,
    } as any, {
      busy: false,
      list: { canUndo: false, canRedo: false } as any,
      undo,
      redo: vi.fn(),
    } as any);

    expect(handledCannotUndo).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(undo).not.toHaveBeenCalled();
  });

  it('does not trigger if focus is inside an input, textarea, select, contenteditable, or open dialog', () => {
    const undo = vi.fn().mockResolvedValue(undefined);
    const preventDefault = vi.fn();
    const edits = {
      busy: false,
      list: { canUndo: true, canRedo: true } as any,
      undo,
      redo: vi.fn(),
    } as any;

    for (const tag of ['input', 'textarea', 'select']) {
      const handled = handleSimpleUndoRedo({
        key: 'z',
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        defaultPrevented: false,
        target: mockElement({ tagName: tag }),
        preventDefault,
      } as any, edits);
      expect(handled).toBe(false);
    }

    const handledEditable = handleSimpleUndoRedo({
      key: 'z',
      ctrlKey: true,
      shiftKey: false,
      altKey: false,
      defaultPrevented: false,
      target: mockElement({ isContentEditable: true }),
      preventDefault,
    } as any, edits);
    expect(handledEditable).toBe(false);

    const handledOpenDialog = handleSimpleUndoRedo({
      key: 'z',
      ctrlKey: true,
      shiftKey: false,
      altKey: false,
      defaultPrevented: false,
      target: mockElement({ tagName: 'button', inDialog: true, dialogOpen: true }),
      preventDefault,
    } as any, edits);
    expect(handledOpenDialog).toBe(false);

    expect(undo).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
