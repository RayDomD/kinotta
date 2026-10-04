import type { Span } from './model.ts';

export type Tool = 'select' | 'snip';

export interface ToolsProps {
  tool: Tool;
  onTool(tool: Tool): void;
  /** The stretch the Snip tool has selected. */
  selection: Span | null;
  busy: boolean;
  onSnip(): void;
}

/** Select and Snip, and, once a stretch is selected, the button that removes it. */
export function Tools({ tool, onTool, selection, busy, onSnip }: ToolsProps) {
  return (
    <div className="rv-tools" role="toolbar" aria-label="Edit tools">
      <button type="button" className="rv-tool" aria-pressed={tool === 'select'} onClick={() => onTool('select')}>
        Select <kbd>V</kbd>
      </button>
      <button type="button" className="rv-tool" aria-pressed={tool === 'snip'} onClick={() => onTool('snip')}>
        Snip <kbd>S</kbd>
      </button>
      {selection !== null && (
        <button type="button" className="rv-snip-go" disabled={busy} onClick={onSnip}>
          {`Snip ${(selection.end - selection.start).toFixed(1)}s`}
        </button>
      )}
    </div>
  );
}
