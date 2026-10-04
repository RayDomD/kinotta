import type { Span } from './model.ts';

export type Tool = 'select' | 'blade' | 'snip';

export interface ToolsProps {
  tool: Tool;
  onTool(tool: Tool): void;
  /** The stretch the Snip tool has selected. */
  selection: Span | null;
  busy: boolean;
  onSnip(): void;
  /** Cuts the footage at the playhead (shown with the Blade tool). */
  onCutAtPlayhead(): void;
}

/** Select, Blade and Snip, and, once a stretch is selected, the button that removes it. */
export function Tools({ tool, onTool, selection, busy, onSnip, onCutAtPlayhead }: ToolsProps) {
  return (
    <div className="rv-tools" role="toolbar" aria-label="Edit tools">
      <button type="button" className="rv-tool" aria-pressed={tool === 'select'} onClick={() => onTool('select')}>
        Select <kbd>V</kbd>
      </button>
      <button type="button" className="rv-tool" aria-pressed={tool === 'blade'} onClick={() => onTool('blade')}>
        Blade <kbd>B</kbd>
      </button>
      <button type="button" className="rv-tool" aria-pressed={tool === 'snip'} onClick={() => onTool('snip')}>
        Snip <kbd>S</kbd>
      </button>
      {tool === 'blade' && (
        <button type="button" className="rv-snip-go" disabled={busy} onClick={onCutAtPlayhead}>
          Cut at playhead <kbd>Enter</kbd>
        </button>
      )}
      {selection !== null && (
        <button type="button" className="rv-snip-go" disabled={busy} onClick={onSnip}>
          {`Snip ${(selection.end - selection.start).toFixed(1)}s`}
        </button>
      )}
    </div>
  );
}
