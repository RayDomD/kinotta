import { useEffect, useState } from 'react';
import { fetchProject, fetchReels } from './api/index.ts';
import type { ReelListing, ReelSummary } from './api/index.ts';

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; project: string; listing: ReelListing };

const PHASES = ['Storyboard', 'Review', 'Picker'] as const;

function HexMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 28 28" aria-hidden="true">
      <path d="M14 3l9.5 5.5v11L14 25 4.5 19.5v-11z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M4.5 8.5L14 14l9.5-5.5M14 14v11" fill="none" stroke="currentColor" strokeWidth="1.4" opacity=".6" />
    </svg>
  );
}

function Empty({ children }: { children: string }) {
  return (
    <div className="empty" role="status">
      {children}
      <div className="terrain" aria-hidden="true" />
    </div>
  );
}

function TopBar({ reel }: { reel: ReelSummary | undefined }) {
  return (
    <header className="top">
      <div className="brand"><HexMark />KINOTTA</div>
      <div className="reelname">{reel?.title}</div>
      <nav className="modes" aria-label="Phase">
        {PHASES.map((phase) =>
          phase === 'Storyboard' ? (
            <span key={phase} aria-current="page">{phase}</span>
          ) : (
            <span key={phase} aria-disabled="true">{phase}</span>
          ),
        )}
      </nav>
    </header>
  );
}

function Rail(props: { project: string; listing: ReelListing; current: string | undefined; onOpen(slug: string): void }) {
  const { project, listing, current, onOpen } = props;
  return (
    <aside className="rail" aria-label="Project">
      <div>
        <div className="label">Reels in {project}/reels</div>
        {listing.reels.length > 0 ? (
          <nav className="reels" aria-label="Reels">
            {listing.reels.map((reel) => (
              <button key={reel.slug} type="button" aria-current={reel.slug === current ? 'true' : undefined} onClick={() => onOpen(reel.slug)}>
                {reel.title}
              </button>
            ))}
          </nav>
        ) : (
          <div className="meta rail-none">None</div>
        )}
      </div>
    </aside>
  );
}

function Main(props: { project: string; listing: ReelListing; reel: ReelSummary | undefined }) {
  const { project, listing, reel } = props;
  if (listing.state === 'no-reels-folder') {
    return <main className="main"><Empty>{`No reels folder in ${project}. Ask Claude for a storyboard to create one.`}</Empty></main>;
  }
  if (listing.state === 'no-reels' || !reel) {
    return <main className="main"><Empty>{`The reels folder in ${project} has no reels yet. Ask Claude for a storyboard to add one.`}</Empty></main>;
  }
  return (
    <main className="main">
      <div className="head">
        <h1>{reel.title}</h1>
        {reel.newestVersion !== null && <span className="meta num">v{reel.newestVersion}</span>}
      </div>
      <Empty>The storyboard grid appears here.</Empty>
    </main>
  );
}

function Comments() {
  return (
    <aside className="comments" aria-label="Comments">
      <header><h2>Comments</h2></header>
      <Empty>No comments yet.</Empty>
    </aside>
  );
}

export function App() {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [selected, setSelected] = useState<string | undefined>();

  useEffect(() => {
    Promise.all([fetchProject(), fetchReels()])
      .then(([project, listing]) => {
        setLoad({ status: 'ready', project: project.name, listing });
        setSelected(listing.reels[0]?.slug);
      })
      .catch((err: unknown) => setLoad({ status: 'error', message: err instanceof Error ? err.message : 'Could not reach the server' }));
  }, []);

  if (load.status !== 'ready') {
    return (
      <div className="app">
        <TopBar reel={undefined} />
        <div className="state">{load.status === 'loading' ? 'Loading…' : `Could not load reels. ${load.message}`}</div>
      </div>
    );
  }

  const reel = load.listing.reels.find((r) => r.slug === selected);
  return (
    <div className="app">
      <TopBar reel={reel} />
      <div className="body">
        <Rail project={load.project} listing={load.listing} current={reel?.slug} onOpen={setSelected} />
        <Main project={load.project} listing={load.listing} reel={reel} />
        <Comments />
      </div>
    </div>
  );
}
