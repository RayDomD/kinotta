import { versionPageUrl } from './api/index.ts';
import type { Shot, Version } from './api/index.ts';
import { PageStill } from './stage/index.ts';
import { formatTimecode } from './timecode.ts';

function ShotCard({ shot, pageUrl }: { shot: Shot; pageUrl: string }) {
  return (
    <button type="button" className="shot">
      <PageStill pageUrl={pageUrl} time={shot.start} title={`Shot ${shot.number} still`} />
      <div className="lbl">
        <span>
          <span className="dot">{shot.number}</span>
          {shot.title}
        </span>
        <span className="t">{formatTimecode(shot.start)}</span>
      </div>
      <div className="desc">{shot.description}</div>
    </button>
  );
}

export function Storyboard({ slug, version }: { slug: string; version: Version }) {
  const pageUrl = versionPageUrl(slug, version.number);
  return (
    <>
      <div className="head">
        <h1>Storyboard, v{version.number}</h1>
        <span className="meta">Click a shot to enlarge it and pin comments</span>
      </div>
      <div className="grid">
        {version.shots.map((shot) => (
          <ShotCard key={shot.number} shot={shot} pageUrl={pageUrl} />
        ))}
      </div>
    </>
  );
}
