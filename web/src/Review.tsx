import { footageUrl } from './api/index.ts';
import type { ReelSummary, Version } from './api/index.ts';
import { formatDuration } from './timecode.ts';

interface ReviewProps {
  reel: ReelSummary;
  /** The reel's newest version, when it has one and it has loaded. */
  version: Version | undefined;
}

/** The Review tab. A placeholder until T31 puts the player and lanes here; the tab switch and the reel it shows are real. */
export function Review({ reel, version }: ReviewProps) {
  return (
    <main className="main" aria-label="Review">
      <section className="rv-review">
        <h2>{reel.title}</h2>
        <p className="rv-lede">
          {version ? `v${version.number} · ${formatDuration(version.duration)}` : 'No version yet. The footage plays alone.'}
        </p>
        {version?.footage?.exists && <video className="rv-footage" src={footageUrl(reel.slug)} controls preload="metadata" aria-label={`${reel.title} footage`} />}
      </section>
    </main>
  );
}
