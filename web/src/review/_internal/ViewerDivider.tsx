import { useEffect, useRef } from 'react';
import { useEditorWorkspace } from './EditorWorkspace.tsx';

export function ViewerDivider() {
  const { settings, setSettings } = useEditorWorkspace();
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; height: number; share: number; live: number } | null>(null);
  const set = (share: number) => setSettings((state) => ({ ...state, viewerShare: Math.round(Math.max(0.25, Math.min(0.8, share)) * 100) / 100 }));
  // A drag moves the picture height directly; settings (and the whole editor) update once, when it ends.
  const commit = () => { const state = drag.current; drag.current = null; if (state) set(state.live); };
  useEffect(() => {
    const main = ref.current?.parentElement;
    if (!main) return;
    const resize = () => main.style.setProperty('--viewer-height', `${main.clientHeight * settings.viewerShare}px`);
    resize(); const observer = new ResizeObserver(resize); observer.observe(main);
    return () => observer.disconnect();
  }, [settings.viewerShare]);
  return <div ref={ref} className="rv-divider" role="separator" tabIndex={0} aria-label="Picture and tracks" aria-orientation="horizontal" aria-valuemin={25} aria-valuemax={80} aria-valuenow={Math.round(settings.viewerShare * 100)} onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.focus(); const main = event.currentTarget.parentElement!; drag.current = { y: event.clientY, height: main.clientHeight, share: settings.viewerShare, live: settings.viewerShare }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { const state = drag.current; if (!state) return; state.live = Math.max(0.25, Math.min(0.8, state.share + (event.clientY - state.y) / state.height)); event.currentTarget.parentElement!.style.setProperty('--viewer-height', `${state.height * state.live}px`); }} onPointerUp={commit} onPointerCancel={commit} onLostPointerCapture={commit} onKeyDown={(event) => { if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); event.stopPropagation(); set(event.key === 'Home' ? 0.25 : event.key === 'End' ? 0.8 : settings.viewerShare + (event.key === 'ArrowUp' ? 0.05 : -0.05)); }}><span/></div>;
}
