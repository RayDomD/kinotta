import type { EditorAction } from './editor-settings.ts';

const PATHS: Partial<Record<EditorAction | 'reel' | 'media' | 'close', string>> = {
  select: 'M5 3v15l4-4 3 6 3-1-3-6h6Z', blade: 'm5 17 12-12M4 15l5 5M15 4l5 5M8 14l2 2M14 8l2 2',
  snip: 'M5 4v16M19 4v16M8 12h8m-3-3 3 3-3 3', split: 'M12 3v18M4 7h5v10H4M20 7h-5v10h5',
  gap: 'M4 6v12h5M20 6v12h-5M12 8v8m-3-4h6', duplicate: 'M8 8h12v12H8ZM4 16V4h12',
  snap: 'M6 4v8a6 6 0 0 0 12 0V4h-4v8a2 2 0 0 1-4 0V4ZM6 8h4m4 0h4',
  pin: 'm9 3 6 0-1 6 4 4H6l4-4ZM12 13v8', settings: 'M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M5.6 18.4l2.1-2.1m8.6-8.6 2.1-2.1M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  reel: 'M3 6h18v15H3ZM3 6l3-3h15v3M8 3l3 3m3-3 3 3', media: 'M3 4h18v16H3ZM5 17l5-6 3 3 3-4 3 7M8 8h.01', close: 'm6 6 12 12M6 18 18 6',
};

export function EditorIcon({ name }: { name: EditorAction | 'reel' | 'media' | 'close' }) {
  return <svg data-verify-unit="EditorIcon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={PATHS[name] ?? 'M4 12h16'} /></svg>;
}
