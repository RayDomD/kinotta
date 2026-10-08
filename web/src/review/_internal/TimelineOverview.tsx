import { useRef } from 'react';
import type { MediaTimeline } from '../../../../server/core/model.ts';
import { actionForKey, keyChord } from './editor-settings.ts';
import type { EditorSettings } from './editor-settings.ts';
import type { TimeWindow } from './timeline.ts';

interface Props {
  timeline: MediaTimeline;
  win: TimeWindow;
  time: number;
  keys: EditorSettings['keys'];
  nudge: number;
  onWindow: (win: TimeWindow) => void;
}
function verifyAttrs(total: number, win: TimeWindow) {
  return { 'data-verify-unit': 'TimelineOverview', 'data-verify-total': total, 'data-verify-start': win.start, 'data-verify-length': win.length };
}

/** The whole reel stays visible while one shared window pans the detailed lanes. */
export function TimelineOverview({ timeline, win, time, keys, nudge, onWindow }: Props) {
  const drag = useRef<{ x: number; start: number; width: number } | null>(null);
  const total = Math.max(timeline.duration, 1);
  const moveWindow = (start: number) => onWindow({ ...win, start: Math.max(0, Math.min(total - win.length, start)) });
  return <div className="native-lane editor-overview" {...verifyAttrs(total, win)}>
    <strong>Reel</strong>
    <div className="native-lane-bars rv-over" onPointerDown={(event) => {
      if (event.button !== 0) return;
      const box = event.currentTarget.getBoundingClientRect();
      if ((event.target as Element).closest('.editor-window')) drag.current = { x: event.clientX, start: win.start, width: box.width };
      else moveWindow((event.clientX - box.left) / box.width * total - win.length / 2);
      event.currentTarget.setPointerCapture(event.pointerId);
    }} onPointerMove={(event) => {
      if (drag.current) moveWindow(drag.current.start + (event.clientX - drag.current.x) / drag.current.width * total);
    }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      {timeline.placements.filter((p) => p.role === 'main' || p.role === 'gap').map((p) => <i key={p.id} aria-hidden="true" style={{ left: `${p.at / total * 100}%`, width: `${p.duration / total * 100}%` }} />)}
      <button type="button" className="editor-window" role="slider" aria-label="Timeline window" aria-valuemin={0} aria-valuemax={total - win.length} aria-valuenow={win.start} aria-valuetext={`${win.start.toFixed(2)} to ${(win.start + win.length).toFixed(2)} seconds`} style={{ left: `${win.start / total * 100}%`, width: `${win.length / total * 100}%` }} onKeyDown={(event) => {
        const action = actionForKey(keys, keyChord(event.nativeEvent));
        if (!action || !['left', 'right', 'start', 'end'].includes(action)) return;
        event.preventDefault(); event.stopPropagation();
        moveWindow(action === 'start' ? 0 : action === 'end' ? total - win.length : win.start + (action === 'left' ? -nudge : nudge));
      }} />
      <span className="native-playhead" style={{ left: `${time / total * 100}%` }} />
    </div>
  </div>;
}
