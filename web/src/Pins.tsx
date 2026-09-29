/** A saved pin: an ice-blue filled hex with its comment number, placed at fractions of the frame. */
export function HexPin({ number, x, y }: { number: number; x: number; y: number }) {
  return (
    <span className="hexpin" style={{ left: `${x * 100}%`, top: `${y * 100}%` }} role="img" aria-label={`Comment ${number}`}>
      <svg viewBox="0 0 28 28" aria-hidden="true">
        <path d="M14 3l9.5 5.5v11L14 25 4.5 19.5v-11z" fill="var(--light)" stroke="var(--ground)" strokeWidth="2.2" strokeLinejoin="round" />
      </svg>
      <b aria-hidden="true">{number}</b>
    </span>
  );
}

/** The count of pins on a shot, shown beside its title in the grid. */
export function PinsBadge({ count }: { count: number }) {
  return (
    <span className="pins-badge">
      <svg width="10" height="10" viewBox="0 0 28 28" aria-hidden="true">
        <path d="M14 3l9.5 5.5v11L14 25 4.5 19.5v-11z" fill="var(--light)" />
      </svg>
      {count}
      <span className="sr-only"> {count === 1 ? 'pin' : 'pins'}</span>
    </span>
  );
}
