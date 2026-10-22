import { useCallback, useEffect, useRef, useState } from 'react';
import { MEDIA_AUDIO_RATE } from '../../../../server/core/model.ts';
import type { MediaPlan } from '../../../../server/core/model.ts';
import { mediaAudioBytes } from '../../api/index.ts';
import { INITIAL_PLAYBACK, MediaPlaybackEngine } from './MediaPlaybackEngine.ts';

const NO_TRACK_SOLOS: readonly string[] = [];

/** React observes the engine; renders and plan updates do not own its clock or decoded buffers. */
export function useMediaPlayback(media: MediaPlan, duration: number, sourceUrl: (id: string) => string, solo: readonly string[] = NO_TRACK_SOLOS, soloTracks: readonly string[] = NO_TRACK_SOLOS, skip?: { from: number; to: number } | null) {
  const engine = useRef<MediaPlaybackEngine | null>(null);
  const [state, setState] = useState(INITIAL_PLAYBACK);
  useEffect(() => {
    const current = new MediaPlaybackEngine(new AudioContext({ sampleRate: MEDIA_AUDIO_RATE }), mediaAudioBytes);
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
