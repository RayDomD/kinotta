import { Review } from '../../web/src/review/_internal/Review.tsx';
import { EditorWorkspace } from '../../web/src/review/_internal/EditorWorkspace.tsx';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PictureLayers } from '../../web/src/review/_internal/PictureLayers.tsx';
import { useEdits } from '../../web/src/review/_internal/useEdits.ts';
import { ReviewSide } from '../../web/src/review/_internal/EditsPanel.tsx';

const root = createRoot(document.getElementById('root')!);
const host = window as any;
host.mountPicture = (props: Record<string, unknown> = {}) => root.render(<PictureLayers
  pictures={[{ id: 'take', role: 'main', source: 'fixture', in: 0, out: 8.8, at: 0, duration: 8.8 }]}
  sources={[{ id: 'fixture', kind: 'video', path: '', duration: 8.8 }]}
  time={0} playing={false} sourceUrl={() => '/tests/fixtures/playback-stutter-4k50.mp4'}
  attempts={{}} onStatus={() => {}} onError={() => {}} {...props} />);

function EditsHarness({ slug }: { slug: string }) {
  const [refresh, setRefresh] = useState(0);
  const edits = useEdits(slug, refresh);
  host.edits = edits;
  host.refreshEdits = () => setRefresh((n) => n + 1);
  return <output>{JSON.stringify({ list: edits.list, busy: edits.busy, error: edits.error })}</output>;
}
host.mountEdits = (slug = 'test') => root.render(<EditsHarness slug={slug} />);

function ReviewEditsHarness({ version }: { version: any }) {
  const edits = useEdits('test', 0);
  host.edits = edits;
  return <EditorWorkspace><Review reel={{ slug: 'test', title: 'Test' } as any} state="ready" version={version} comments={[]} edits={edits} /></EditorWorkspace>;
}
host.mountReviewEdits = (version: any) => root.render(<ReviewEditsHarness version={version} />);

host.mountEditsPanel = (props: any) => root.render(<EditorWorkspace><ReviewSide {...props} edits={{ ...props.edits,
  undo: () => host.editActions.push('undo'), redo: () => host.editActions.push('redo'),
  remove: (id: string) => host.editActions.push(`remove:${id}`), cancelHandoff: () => host.editActions.push('handoff'),
}} /></EditorWorkspace>);
