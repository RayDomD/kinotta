import { useCallback, useEffect, useRef, useState } from 'react';
import { MEDIA_AUDIO_RATE } from '../../../../server/core/model.ts';
import type { MediaPlan } from '../../../../server/core/model.ts';
import { mediaBytes } from '../../api/index.ts';
import { INITIAL_PLAYBACK, MediaPlaybackEngine } from './MediaPlaybackEngine.ts';

const NO_TRACK_SOLOS: readonly string[] = [];

/** Local contract adapter until agy's mediaAudioUrl helper is merged. */
export async function audioRouteBytesUntilHelperAvailable(source: string): Promise<ArrayBuffer> {
  const url = new URL(source, window.location.origin);
  const segments = url.pathname.split('/').filter(Boolean);
  let audio: URL | null = null;
  if (segments[0] === 'media' && (segments.length === 2 || segments.length === 4)) {
    audio = new URL(`/api/media/${segments.at(-1)}/audio`, url.origin);
    if (segments.length === 4) { audio.searchParams.set('reel', decodeURIComponent(segments[1]!)); audio.searchParams.set('version', segments[2]!); }
  } else if (segments[0] === 'api' && segments[1] === 'media' && segments.length === 3) {
    audio = new URL(url); audio.pathname += '/audio';
  }
  if (!audio) return mediaBytes(source);
  const response = await fetch(audio.href);
  if (response.status === 404) return mediaBytes(source);
  if (!response.ok) throw new Error('The sound could not be loaded. Check the source and retry.');
  return response.arrayBuffer();
}

/** React observes the engine; renders and plan updates do not own its clock or decoded buffers. */
export function useMediaPlayback(media: MediaPlan, duration: number, sourceUrl: (id: string) => string, solo: readonly string[] = NO_TRACK_SOLOS, soloTracks: readonly string[] = NO_TRACK_SOLOS, skip?: { from: number; to: number } | null) {
  const engine = useRef<MediaPlaybackEngine | null>(null);
  const [state, setState] = useState(INITIAL_PLAYBACK);
  useEffect(() => {
    const current = new MediaPlaybackEngine(new AudioContext({ sampleRate: MEDIA_AUDIO_RATE }), audioRouteBytesUntilHelperAvailable);
    engine.current = current;
    const unsubscribe = current.subscribe(setState);
    return () => { unsubscribe(); current.dispose(); if (engine.current === current) engine.current = null; };
  }, []);
  useEffect(() => { void engine.current?.update(media, duration, sourceUrl, solo, soloTracks, skip); }, [media, duration, sourceUrl, solo, soloTracks, skip]);
  const seek = useCallback((at: number) => engine.current?.seek(at), []);
  const toggle = useCallback(async () => { await engine.current?.toggle(); }, []);
  const retry = useCallback((id: string) => { void engine.current?.retry(id); }, []);
  return { ...state, seek, toggle, retry };
}
