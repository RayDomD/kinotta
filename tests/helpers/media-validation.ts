/** Invalid persisted models shared by the editor and engine contract tests. */
export function malformedMediaCases() {
  const source = { id: 'a', kind: 'video', path: 'a.mp4', duration: 3 };
  const placement = { id: 'take', role: 'main', source: 'a', in: 0, out: 3 };
  const media = { schema: 1, sources: [source], placements: [placement], sequence: ['take'] };
  const withSource = (changes: object) => ({ ...media, sources: [{ ...source, ...changes }] });
  const withPlacement = (changes: object) => ({ ...media, placements: [{ ...placement, ...changes }] });
  const track = { id: 'speech', name: 'Speech', order: 0, gain: 1, mute: false };
  const withTrack = (changes: object) => ({ ...media, tracks: [{ ...track, ...changes }], placements: [{ ...placement, track: 'speech' }] });
  return [
    { name: 'null tracks', value: { ...media, tracks: null }, error: 'tracks' },
    { name: 'null track', value: { ...media, tracks: [null] }, error: 'track' },
    { name: 'numeric track identity', value: withTrack({ id: 1 }), error: 'track' },
    { name: 'blank track name', value: withTrack({ name: ' ' }), error: 'track' },
    { name: 'negative track order', value: withTrack({ order: -1 }), error: 'track' },
    { name: 'fractional track order', value: withTrack({ order: 0.5 }), error: 'track' },
    { name: 'boolean track order', value: withTrack({ order: true }), error: 'track' },
    { name: 'negative track gain', value: withTrack({ gain: -1 }), error: 'track' },
    { name: 'excess track gain', value: withTrack({ gain: 3 }), error: 'track' },
    { name: 'boolean track gain', value: withTrack({ gain: true }), error: 'track' },
    { name: 'string track mute', value: withTrack({ mute: 'false' }), error: 'track' },
    { name: 'duplicate track identity', value: { ...media, tracks: [track, { ...track, order: 1 }] }, error: 'track' },
    { name: 'duplicate track order', value: { ...media, tracks: [track, { ...track, id: 'other' }] }, error: 'track' },
    { name: 'missing placement track', value: { ...media, tracks: [track], placements: [{ ...placement, track: 'missing' }] }, error: 'track' },
    { name: 'numeric placement track', value: { ...media, tracks: [track], placements: [{ ...placement, track: 1 }] }, error: 'track' },
    { name: 'insert track', value: { ...media, tracks: [track], placements: [{ ...placement, role: 'insert', at: 0, track: 'speech' }], sequence: [] }, error: 'track' },
    { name: 'gap track', value: { ...media, tracks: [track], placements: [{ id: 'gap', role: 'gap', duration: 3, track: 'speech' }], sequence: ['gap'] }, error: 'track' },
    { name: 'unassigned footage sound', value: { ...media, tracks: [track] }, error: 'track' },
    { name: 'unassigned audio', value: { ...media, sources: [{ ...source, kind: 'audio' }], tracks: [track], placements: [{ ...placement, role: 'audio', at: 0 }], sequence: [] }, error: 'track' },
    { name: 'silent picture track', value: { ...withTrack({}), sources: [{ ...source, audio: false }] }, error: 'track' },
    { name: 'null model', value: null, error: 'schema' },
    { name: 'boolean schema', value: { ...media, schema: true }, error: 'schema' },
    { name: 'missing collections', value: { schema: 1 }, error: 'lists' },
    { name: 'object sources', value: { ...media, sources: {} }, error: 'lists' },
    { name: 'null placements', value: { ...media, placements: null }, error: 'lists' },
    { name: 'string sequence', value: { ...media, sequence: 'take' }, error: 'lists' },
    { name: 'null source', value: { ...media, sources: [null] }, error: 'source' },
    { name: 'numeric source identity', value: withSource({ id: 1 }), error: 'identity' },
    { name: 'array source identity', value: withSource({ id: [] }), error: 'identity' },
    { name: 'boolean source path', value: withSource({ path: true }), error: 'path' },
    { name: 'unknown source kind', value: withSource({ kind: 'document' }), error: 'kind' },
    { name: 'string audio flag', value: withSource({ audio: 'false' }), error: 'boolean' },
    { name: 'null source words', value: withSource({ words: null }), error: 'words' },
    { name: 'numeric word text', value: withSource({ words: [{ text: 2, start: 0, end: 1 }] }), error: 'words' },
    { name: 'reversed word range', value: withSource({ words: [{ text: 'hello', start: 1, end: 0 }] }), error: 'words' },
    { name: 'null placement', value: { ...media, placements: [null] }, error: 'placement' },
    { name: 'numeric placement identity', value: withPlacement({ id: 1 }), error: 'identity' },
    { name: 'unknown placement role', value: withPlacement({ role: 'other', at: 0 }), error: 'role' },
    { name: 'numeric sequence identity', value: { ...media, sequence: [1] }, error: 'sequence' },
    { name: 'array sequence identity', value: { ...media, sequence: [[]] }, error: 'sequence' },
    { name: 'string mute flag', value: withPlacement({ mute: 'false' }), error: 'boolean' },
    { name: 'numeric speech flag', value: withPlacement({ speech: 1 }), error: 'boolean' },
    { name: 'string loop flag', value: withPlacement({ loop: 'false' }), error: 'boolean' },
    { name: 'main looping flag', value: withPlacement({ loop: true }), error: 'Loop' },
    { name: 'negative main duration', value: withPlacement({ duration: -1 }), error: 'duration' },
    { name: 'conflicting main duration', value: withPlacement({ duration: 1 }), error: 'duration' },
    { name: 'object volume points', value: withPlacement({ volume: {} }), error: 'Volume' },
    { name: 'null volume point', value: withPlacement({ volume: [null] }), error: 'Volume' },
    { name: 'string placement words', value: withPlacement({ words: 'hello' }), error: 'words' },
    { name: 'null placement word', value: withPlacement({ words: [null] }), error: 'words' },
    { name: 'object attachment identity', value: withPlacement({ role: 'audio', at: 0, attachment: { placement: {}, time: 1 } }), error: 'attachment' },
    { name: 'array attachment', value: withPlacement({ role: 'audio', at: 0, attachment: [] }), error: 'attachment' },
    { name: 'numeric origin', value: withPlacement({ origin: 1 }), error: 'origin' },
    { name: 'audio used as picture', value: withSource({ kind: 'audio' }), error: 'role' },
    { name: 'image used as sound', value: { ...media, sources: [{ ...source, kind: 'image', duration: 0 }], placements: [{ ...placement, role: 'audio', in: 0, out: 0, at: 0, duration: 3 }], sequence: [] }, error: 'role' },
    { name: 'boolean image range', value: { ...media, sources: [{ ...source, kind: 'image', duration: 0 }], placements: [{ ...placement, in: false, out: false, duration: 3 }] }, error: 'range' },
  ];
}

/** Native plans whose clips, sections or caption settings are malformed, shared by the editor and engine contract tests. */
export function malformedPlanCases() {
  const media = { schema: 1, sources: [{ id: 'a', kind: 'video', path: 'a.mp4', duration: 3 }], placements: [{ id: 'take', role: 'main', source: 'a', in: 0, out: 3 }], sequence: ['take'] };
  const plan = { duration: 3, media, clips: [{ id: '01', clip: 'card.html', in: 0.5, out: 1.5, placement: 'take' }], sections: [{ id: 'all', name: 'All', start: 0, end: 3, placement: 'take' }], captions: { look: 'phrase' } };
  const clip = (changes: object) => ({ ...plan, clips: [{ ...plan.clips[0], ...changes }] });
  const section = (changes: object) => ({ ...plan, sections: [{ ...plan.sections[0], ...changes }] });
  const captions = (value: unknown) => ({ ...plan, captions: value });
  return [
    { name: 'object clips', value: { ...plan, clips: {} }, error: 'clips' },
    { name: 'null clip', value: { ...plan, clips: [null] }, error: 'clip' },
    { name: 'numeric clip identity', value: clip({ id: 1 }), error: 'clip' },
    { name: 'numeric clip placement', value: clip({ placement: 1 }), error: 'clip' },
    { name: 'string attached clip start', value: clip({ in: '0.5' }), error: 'clip' },
    { name: 'null attached clip end', value: clip({ out: null }), error: 'clip' },
    { name: 'reversed attached clip range', value: clip({ in: 1.5, out: 0.5 }), error: 'clip' },
    { name: 'fractional clip cycle', value: clip({ cycle: 0.5 }), error: 'cycle' },
    { name: 'negative section cycle', value: section({ cycle: -1 }), error: 'cycle' },
    { name: 'string sections', value: { ...plan, sections: 'all' }, error: 'sections' },
    { name: 'null section', value: { ...plan, sections: [null] }, error: 'section' },
    { name: 'numeric section identity', value: section({ id: 1 }), error: 'section' },
    { name: 'null attached section start', value: section({ start: null }), error: 'section' },
    { name: 'reversed attached section range', value: section({ start: 2, end: 1 }), error: 'section' },
    { name: 'string captions', value: captions('pill'), error: 'captions' },
    { name: 'unknown caption look', value: captions({ look: 'neon' }), error: 'captions' },
    { name: 'numeric caption color', value: captions({ color: 5 }), error: 'captions' },
    { name: 'string caption position', value: captions({ position: { x: '1', y: 0 } }), error: 'captions' },
    { name: 'object phrase positions', value: captions({ phrases: {} }), error: 'captions' },
    { name: 'null phrase position', value: captions({ phrases: [null] }), error: 'captions' },
    { name: 'string phrase position time', value: captions({ phrases: [{ at: '1', x: 0, y: 0, placement: 'take' }] }), error: 'captions' },
  ];
}
