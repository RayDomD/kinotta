import type { Comment, Shot } from './api/index.ts';
import { formatClock } from './timecode.ts';

export function SimpleTimeline({ time, total, shots, comments, onSeek, onPin, canPin = true }: {
  canPin?: boolean;
  time: number;
  total: number;
  shots: Shot[];
  comments: Comment[];
  onSeek(time: number): void;
  onPin(time: number): void;
}) {
  const inside = (at: number) => Math.max(0, Math.min(Math.max(0, total - 0.001), at));
  return <section className="sm-timeline" aria-label="Simple timeline">
    <div className="sm-timeline-label"><span>Click the timeline to leave a note</span><span className="num">{formatClock(total)}</span></div>
    <div className="sm-pin-track">
      <button type="button" className="sm-timeline-target" aria-label="Add a timeline pin" disabled={total <= 0 || !canPin}
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          const at = inside((event.clientX - box.left) / box.width * total);
          onSeek(at); onPin(at);
        }} onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onPin(inside(time)); }
        }}>
        {shots.map((shot) => <span key={shot.number} className="sm-timeline-shot" style={{ left: `${shot.start / total * 100}%`, width: `${shot.duration / total * 100}%` }}><span className="num">{shot.number}</span> {shot.title}</span>)}
      </button>
      {comments.filter((comment) => !comment.state).map((comment) => <button type="button" key={comment.id} className="sm-pin-mark num" style={{ left: `${Math.min(98, comment.pin.time / total * 100)}%` }} aria-label={`Jump to pin ${comment.number}`} onClick={() => onSeek(comment.pin.time)}>{comment.number}</button>)}
      <span className="sm-playhead" style={{ left: `${total > 0 ? time / total * 100 : 0}%` }} />
    </div>
    <label className="sm-scrub">Playhead <input type="range" aria-label="Simple playhead" min="0" max={total} step="0.01" value={Math.min(time, total)} onChange={(event) => onSeek(Number(event.target.value))} /></label>
  </section>;
}
