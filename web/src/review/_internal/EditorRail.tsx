import type { ReactNode } from 'react';
import { EditorIcon } from './EditorIcon.tsx';
import { useEditorWorkspace } from './EditorWorkspace.tsx';

function verifyAttrs(open: boolean, tab: string) {
  return { 'data-verify-unit': 'EditorRail', 'data-verify-open': String(open), 'data-verify-tab': tab };
}

/** Reel navigation and the media library occupy one drawer, pushing the editor when opened. */
export function EditorRail({ reviewMode, children }: { reviewMode: boolean; children: ReactNode }) {
  const state = useEditorWorkspace();
  const visibleReel = !reviewMode || (state.railOpen && state.railTab === 'reel');
  return <aside className={reviewMode ? 'rail editor-rail' : 'rail'} aria-label="Project" {...verifyAttrs(!reviewMode || state.railOpen, reviewMode ? state.railTab : 'reel')}>
    {reviewMode && <div className="editor-rail-icons" role="tablist" aria-label="Reel and Media">
      {(['reel', 'media'] as const).map((tab) => <button key={tab} type="button" role="tab" aria-label={`${tab === 'reel' ? 'Reel' : 'Media'} rail`} aria-selected={state.railOpen && state.railTab === tab} title={tab === 'reel' ? 'Reel' : `Media (${state.settings.keys.rail})`} onClick={() => { state.setRailOpen((open) => state.railTab === tab ? !open : true); state.setRailTab(tab); }}><EditorIcon name={tab} /></button>)}
    </div>}
    <div className="editor-drawer" hidden={!visibleReel}>{children}{reviewMode && <div ref={state.setSectionHost} />}</div>
    {reviewMode && <div className="editor-drawer editor-media-drawer" hidden={!state.railOpen || state.railTab !== 'media'}><div ref={state.setMediaHost} /></div>}
  </aside>;
}
