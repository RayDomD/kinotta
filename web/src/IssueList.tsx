import { useId, useState } from 'react';

/** A list longer than this starts collapsed to one line, so the grid and lanes stay in view (D26). */
const FULL_ROWS = 3;

function WarnMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 1.8L14.8 13.6H1.2z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="miter" />
      <path d="M8 6.2v3.4M8 11v1.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

/** What is wrong with a version that breaks the timing contract, one plain-word row per issue. */
export function IssueList({ issues }: { issues: string[] }) {
  const titleId = useId();
  const listId = useId();
  const [expanded, setExpanded] = useState(false);
  if (issues.length === 0) return null;
  const long = issues.length > FULL_ROWS;
  const collapsed = long && !expanded;
  return (
    <section className="issues" aria-labelledby={titleId}>
      <h2 id={titleId}>
        <WarnMark />
        This version breaks the timing contract
        <span className="num">{issues.length === 1 ? '1 issue' : `${issues.length} issues`}</span>
      </h2>
      {/* The toggle keeps one place in the tree in both states, so keyboard focus stays on it when it flips. */}
      <div className={collapsed ? 'issues-body collapsed' : 'issues-body'}>
        {collapsed ? (
          <p id={listId} className="issues-line">
            <span className="first">{issues[0]}</span>{' '}
            <span className="more">and {issues.length - 1} more</span>
          </p>
        ) : (
          <ul id={listId}>
            {issues.map((issue, i) => (
              <li key={`${i}:${issue}`}>{issue}</li>
            ))}
          </ul>
        )}
        {long && (
          <button type="button" className="issues-toggle" aria-expanded={expanded} aria-controls={listId} onClick={() => setExpanded((open) => !open)}>
            {expanded ? 'Show fewer' : `Show all ${issues.length}`}
          </button>
        )}
      </div>
    </section>
  );
}
