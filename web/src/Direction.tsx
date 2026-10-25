import type { VideoEntry } from './api/_internal/client.ts';

export interface DirectionProps {
  video: VideoEntry;
  title: string;
  onBack(): void;
  onStarted(slug: string): void;
}

/** Direct: five short steps that record the reel's style before the first build. */
export function Direction({ onBack }: DirectionProps) {
  return (
    <main className="dx-wiz" aria-label="Direction">
      <button type="button" className="dx-quiet" onClick={onBack}>← Back to Make</button>
    </main>
  );
}
