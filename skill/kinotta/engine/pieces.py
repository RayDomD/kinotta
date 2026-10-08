"""A footage plan's pieces: an ordered list of { "in", "out" } stretches of the source video that make up the reel.
Source time is the video's own clock; timeline time is the reel's, with the pieces laid end to end in list order.
Whatever lies outside every piece is snipped. A plan without "pieces" is one piece covering the whole video.
Plans keep clip in/out, word times and section bounds in source time; build.py and shots.py call timeline_plan() and
timeline_words() to get them on the timeline. server/core/_internal/pieces.ts does the same mapping for Kinotta."""
import math, sys

EPS = 1e-9
ATTACHED_RANGE_TOLERANCE = 1e-6
CAPTION_LOOKS = ('highlight', 'phrase', 'words')   # the looks build.py draws; the editor checks the same list

def _number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)

def _whole(value):
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0

def _offset(value):
    return isinstance(value, dict) and _number(value.get('x')) and _number(value.get('y'))

def check_plan_parts(plan):
    """Refuses a native plan whose clips, sections or caption settings are not the shapes the builder reads, naming
    what is wrong. Mirrors checkPlanParts in server/core/_internal/edit-model.ts."""
    clips = plan.get('clips', [])
    if not isinstance(clips, list): sys.exit("A plan's clips must be a list.")
    for index, clip in enumerate(clips):
        if not isinstance(clip, dict) or not isinstance(clip.get('id'), str): sys.exit(f'The clip at position {index + 1} needs a text id.')
        if 'placement' not in clip: continue
        if not isinstance(clip['placement'], str): sys.exit(f'The clip {clip["id"]} names its placement with text.')
        if not (_number(clip.get('in')) and _number(clip.get('out')) and clip['in'] < clip['out']):
            sys.exit(f'The clip {clip["id"]} needs its source range: "in" before "out", in seconds.')
        if 'cycle' in clip and not _whole(clip['cycle']): sys.exit(f'The clip {clip["id"]} names a loop cycle that is not a whole number from 0.')
    sections = plan.get('sections', [])
    if not isinstance(sections, list): sys.exit("A plan's sections must be a list.")
    for index, section in enumerate(sections):
        if not isinstance(section, dict) or not isinstance(section.get('id'), str): sys.exit(f'The section at position {index + 1} needs a text id.')
        if 'placement' not in section: continue
        if not isinstance(section['placement'], str): sys.exit(f'The section {section["id"]} names its placement with text.')
        if not (_number(section.get('start')) and _number(section.get('end')) and section['start'] < section['end']):
            sys.exit(f'The section {section["id"]} needs its source range: "start" before "end", in seconds.')
        if 'cycle' in section and not _whole(section['cycle']): sys.exit(f'The section {section["id"]} names a loop cycle that is not a whole number from 0.')
    captions = plan.get('captions')
    if captions is None or isinstance(captions, bool): return
    if not isinstance(captions, dict): sys.exit('The captions setting must be true or an object of caption settings.')
    if 'look' in captions and captions['look'] not in CAPTION_LOOKS: sys.exit(f'The captions look must be one of {", ".join(CAPTION_LOOKS)}.')
    if 'color' in captions and not isinstance(captions['color'], str): sys.exit('The captions color must be a CSS color in text.')
    if 'position' in captions and not _offset(captions['position']): sys.exit('The captions position needs a numeric x and y.')
    if 'phrases' not in captions: return
    phrases = captions['phrases']
    if not isinstance(phrases, list) or not all(_offset(p) and _number(p.get('at')) and isinstance(p.get('placement', ''), str) for p in phrases):
        sys.exit('The captions phrase positions must be a list, each with a numeric at, x and y.')

def media_timeline(media, authored_duration=0):
    """The versioned media main sequence. Repeated source ranges retain independent placement identities."""
    if not isinstance(media, dict) or media.get('schema') != 1 or isinstance(media.get('schema'), bool): sys.exit('Unsupported media schema.')
    if not all(isinstance(media.get(key), list) for key in ('sources', 'placements', 'sequence')): sys.exit('Media sources, placements and sequence must be lists.')
    finite = lambda x: isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)
    name = lambda x: isinstance(x, str) and bool(x.strip())
    def words(value):
        if not isinstance(value, list) or any(not isinstance(w, dict) or not name(w.get('text')) or not finite(w.get('start')) or not finite(w.get('end')) or w['start'] < 0 or w['end'] < w['start'] for w in value):
            sys.exit('Speech words need text and valid source start/end times.')
    if 'tracks' in media and not isinstance(media['tracks'], list): sys.exit('Media tracks must be a list.')
    tracks, orders = set(), set()
    for track in media.get('tracks', []):
        if not isinstance(track, dict) or not name(track.get('id')) or not name(track.get('name')) or not isinstance(track.get('order'), int) or isinstance(track.get('order'), bool) or track['order'] < 0 or not finite(track.get('gain')) or not 0 <= track['gain'] <= 2 or not isinstance(track.get('mute'), bool):
            sys.exit('A track needs an identity, name, nonnegative whole order, gain between zero and two, and boolean mute.')
        if track['id'] in tracks or track['order'] in orders: sys.exit('Each track needs a unique identity and order.')
        tracks.add(track['id']); orders.add(track['order'])
    sources, placements = {}, {}
    for source in media['sources']:
        if not isinstance(source, dict): sys.exit('A source needs an identity, path and valid duration.')
        id_ = source.get('id')
        if not name(id_) or not name(source.get('path')) or not finite(source.get('duration')) or source['duration'] < 0:
            sys.exit('A source needs an identity, path and valid duration.')
        if id_ in sources: sys.exit(f'Duplicate source {id_}.')
        if source.get('kind') not in ('video', 'image', 'audio'): sys.exit('A source kind must be video, image or audio.')
        if 'audio' in source and not isinstance(source['audio'], bool): sys.exit('Source audio must be a boolean.')
        if 'words' in source: words(source['words'])
        sources[id_] = source
    for p in media['placements']:
        if not isinstance(p, dict): sys.exit('A placement needs an identity.')
        id_ = p.get('id')
        if not name(id_): sys.exit('A placement needs an identity.')
        if id_ in placements: sys.exit(f'Duplicate placement {id_}.')
        if p.get('role') not in ('main', 'insert', 'audio', 'gap'): sys.exit('A placement role must be main, insert, audio or gap.')
        if 'track' in p and (not name(p['track']) or p['track'] not in tracks or p['role'] in ('insert', 'gap')):
            sys.exit('A sound placement needs an existing track. Inserts and gaps have no track.')
        if 'origin' in p and not name(p['origin']): sys.exit('A placement origin needs an identity.')
        if p['role'] == 'gap':
            if not finite(p.get('duration')) or p['duration'] <= 0: sys.exit('A gap needs a positive duration.')
        else:
            if any(flag in p and not isinstance(p[flag], bool) for flag in ('mute', 'speech', 'loop')): sys.exit('Mute, speech and loop must be boolean flags.')
            if p.get('loop') and p['role'] != 'audio': sys.exit('Loop is available only for sound placements.')
            if 'words' in p: words(p['words'])
            level = lambda x: finite(x) and 0 <= x <= 2
            if 'gain' in p and not level(p['gain']): sys.exit('Volume must be between silence and twice the recorded level.')
            for fade in ('fadeIn', 'fadeOut'):
                if fade in p and (not finite(p[fade]) or p[fade] < 0): sys.exit('Fades need a nonnegative duration.')
            previous = -1
            if 'volume' in p and not isinstance(p['volume'], list): sys.exit('Volume points must be a list.')
            for point in p.get('volume', []):
                if not isinstance(point, dict) or not finite(point.get('at')) or point['at'] < 0 or point['at'] <= previous or not level(point.get('gain')):
                    sys.exit('Volume points need increasing nonnegative times and levels between zero and two.')
                previous = point['at']
            source = sources.get(p.get('source')) if name(p.get('source')) else None
            if not source: sys.exit(f'Source {p.get("source")} is missing.')
            sound_on_track = p['role'] != 'insert' and source['kind'] != 'image' and source.get('audio') is not False
            if 'tracks' in media and sound_on_track and 'track' not in p: sys.exit('A sound placement needs an existing track.')
            if 'track' in p and not sound_on_track: sys.exit('Only footage or audio with sound can belong to a track.')
            if (source['kind'] == 'audio' and p['role'] != 'audio') or (source['kind'] == 'image' and p['role'] == 'audio'): sys.exit('The source kind is incompatible with this placement role.')
            if 'framing' in p:
                framing = p['framing']
                if not isinstance(framing, dict) or framing.get('mode') not in ('crop', 'fit') or source['kind'] == 'audio' or p['role'] == 'audio' or any(axis in framing and (not finite(framing[axis]) or not 0 <= framing[axis] <= 1) for axis in ('x', 'y')):
                    sys.exit('Picture framing needs Crop or Fit and positions between zero and one.')
            anchor = p.get('attachment')
            if anchor is not None and (not isinstance(anchor, dict) or p['role'] == 'main' or not name(anchor.get('placement')) or not finite(anchor.get('time')) or anchor['time'] < 0 or ('offset' in anchor and not finite(anchor['offset']))):
                sys.exit('An attachment needs a footage placement and a valid source moment.')
            a, b = p.get('in'), p.get('out')
            if source['kind'] == 'image':
                if not finite(a) or not finite(b) or a != 0 or b != 0 or not finite(p.get('duration')) or p['duration'] <= 0: sys.exit(f'Image placement {id_} needs a positive duration and no source range.')
            elif not finite(a) or not finite(b) or not 0 <= a < b <= source['duration']:
                sys.exit(f'Placement {id_} has an invalid source range.')
            if p['role'] == 'main' and source['kind'] != 'image' and 'duration' in p and (not finite(p['duration']) or p['duration'] <= 0 or abs(p['duration'] - (b - a)) > ATTACHED_RANGE_TOLERANCE): sys.exit('A main video duration must match its source range. Trim its source start or end.')
            if p['role'] != 'main':
                if not finite(p.get('at')) or p['at'] < 0: sys.exit(f'Placement {id_} needs a nonnegative timeline start.')
                duration = p.get('duration', b - a)
                if not finite(duration) or duration <= 0 or (source['kind'] != 'image' and not p.get('loop') and duration > b - a): sys.exit(f'Placement {id_} has an invalid duration.')
        placements[id_] = p
    sequence = media['sequence']
    if any(not name(id_) for id_ in sequence): sys.exit('The main sequence needs placement identities.')
    if len(set(sequence)) != len(sequence): sys.exit('Each placement can appear only once in the main sequence. Duplicate it with a new identity to reuse it.')
    out, at = [], 0.0
    for id_ in sequence:
        p = placements.get(id_)
        if p is None: sys.exit(f'Placement {id_} is missing.')
        if p['role'] not in ('main', 'gap'): sys.exit(f'Placement {id_} is not a main-sequence item.')
        duration = p['duration'] if p['role'] == 'gap' or sources[p['source']]['kind'] == 'image' else p['out'] - p['in']
        out.append({**p, 'at': at, 'duration': duration}); at += duration
    duration = at if sequence else authored_duration
    if not finite(duration) or duration < 0: sys.exit('The reel needs a valid authored duration.')
    for p in media['placements']:
        if p['role'] in ('main', 'gap'): continue
        anchor = p.get('attachment')
        target = next((candidate for candidate in out if candidate['role'] == 'main' and (candidate['id'] == anchor['placement'] or candidate.get('origin') == anchor['placement']) and sources[candidate['source']]['kind'] == 'video' and candidate['in'] <= anchor['time'] < candidate['out']), None) if anchor else None
        start = target['at'] + anchor['time'] - target['in'] + anchor.get('offset', 0) if target else p['at']
        broken = bool(anchor) and (not target or start < 0)
        length = max(0, min(p.get('duration', p['out'] - p['in']), duration - start))
        out.append({**p, 'at': p['at'] if broken else start, 'duration': length, **({'attachmentBroken': True} if broken else {})})
    return {'placements': out, 'duration': duration}

def placement_time(timeline, id_, source_time):
    """Resolve only the named occurrence, never the first matching source second."""
    p = next((p for p in timeline['placements'] if p['id'] == id_), None)
    return p['at'] + source_time - p['in'] if p and p['role'] != 'gap' and p['in'] <= source_time < p['out'] else None

def media_spans(media, placement, start, end, authored_duration=0, cycle=None):
    """All surviving continuous parts of a named occurrence's source range, in reel order. A looping placement maps
    only the pass `cycle` names (from 0); without one it maps nowhere, so the attachment stays flagged."""
    if not all(isinstance(value, (int, float)) and math.isfinite(value) for value in (start, end)) or start < 0 or end <= start:
        sys.exit('An attached range needs a valid source start and end.')
    if cycle is not None and not _whole(cycle): sys.exit('A loop cycle is a whole number from 0.')
    named = next((p for p in media['placements'] if p['id'] == placement), {})
    origin = named.get('origin', placement)
    spans = []
    for p in media_timeline(media, authored_duration)['placements']:
        if p['role'] == 'gap' or p.get('attachmentBroken') or (p['role'] != 'main' and p.get('speech') is not True) or (p['id'] not in (placement, origin) and p.get('origin') != origin): continue
        passes = cycle if p.get('loop') else (0 if (cycle or 0) == 0 else None)
        if passes is None: continue
        offset = passes * (p['out'] - p['in'])
        lo, hi = max(start, p['in']), min(end, p['out'], p['in'] + p['duration'] - offset)
        if hi <= lo: continue
        first, last = p['at'] + offset + lo - p['in'], p['at'] + offset + hi - p['in']
        if spans and abs(spans[-1]['end'] - first) < ATTACHED_RANGE_TOLERANCE and abs(spans[-1]['sourceEnd'] - lo) < ATTACHED_RANGE_TOLERANCE:
            spans[-1].update(end=last, sourceEnd=hi)
        else: spans.append({'start': first, 'end': last, 'sourceStart': lo, 'sourceEnd': hi})
    return spans

def timeline_moment(timeline, time):
    """The occurrence/source playing at time, or None during a gap or outside the reel."""
    p = next((p for p in timeline['placements'] if p['role'] == 'main' and p['at'] <= time < p['at'] + p['duration']), None)
    return {'placement': p['id'], 'source': p['source'], 'time': 0 if p['in'] == p['out'] else p['in'] + time - p['at']} if p else None

def media_words(media, authored_duration=0):
    """Expand cached speech and placement-only corrections into independently targeted caption occurrences."""
    sources = {s['id']: s for s in media['sources']}
    out = []
    timeline = media_timeline(media, authored_duration)
    selected = [p for p in timeline['placements'] if not p.get('attachmentBroken') and p['role'] not in ('main', 'gap') and p.get('speech') is True]
    for p in timeline['placements']:
        if p['role'] == 'gap' or p.get('attachmentBroken'): continue
        if p.get('speech') is False or (p['role'] != 'main' and not p.get('speech')): continue
        if sources[p['source']]['kind'] == 'image' or p['duration'] <= 0: continue
        cycle = 0
        while cycle < p['duration']:
            for w in p.get('words', sources[p['source']].get('words', [])):
                if not p['in'] <= w['start'] < p['out']: continue
                start = p['at'] + cycle + w['start'] - p['in']
                end = min(p['at'] + p['duration'], p['at'] + cycle + min(w['end'], p['out']) - p['in'])
                if start >= p['at'] + p['duration'] or end <= start: continue
                if p['role'] == 'main' and any(v['at'] < end and v['at'] + v['duration'] > start for v in selected): continue
                out.append({**w, 'start': round(start, 6), 'end': round(end, 6),
                            'placement': p['id'], 'source': p['source'], 'sourceStart': w['start'], 'at': w['start'], 'piece': p['id']})
            cycle += p['out'] - p['in'] if p.get('loop') else p['duration']
    return sorted(out, key=lambda w: w['start'])

def layout(pieces):
    """The pieces with their timeline start: [(in, out, at)]. Stops on a malformed or overlapping piece."""
    if not isinstance(pieces, list): sys.exit('pieces must be a list of source ranges.')
    out, at = [], 0.0
    for i, p in enumerate(pieces):
        if not isinstance(p, dict): sys.exit(f'pieces[{i}]: needs a source range.')
        a, b = p.get('in'), p.get('out')
        if not all(isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x) for x in (a, b)) or not 0 <= a < b:
            sys.exit(f'pieces[{i}]: needs "in" and "out" in seconds, 0 <= in < out')
        out.append((a, b, at)); at += b - a
    spans = sorted((a, b) for a, b, _ in out)
    for (_, b), (a, _) in zip(spans, spans[1:]):
        if a < b - EPS: sys.exit('pieces must not overlap in the source')
    return out

def total(laid):
    return sum(b - a for a, b, _ in laid)

def span(laid, start, end):
    """A source range on the timeline as (start, end), or None when it lies in a snip. A range that crosses a
    snip is trimmed to what remains and closed up; when reordering leaves it in separate places, the longest
    stretch wins."""
    runs = []
    for a, b, at in laid:
        lo, hi = max(start, a), min(end, b)
        if hi - lo > EPS: runs.append((at + lo - a, at + hi - a))
    runs.sort()
    merged = []
    for lo, hi in runs:
        if merged and lo - merged[-1][1] < EPS: merged[-1] = (merged[-1][0], hi)
        else: merged.append((lo, hi))
    return max(merged, key=lambda r: r[1] - r[0]) if merged else None

def timeline_words(words, pieces):
    """Words that start inside a piece, on the timeline in order (a word's end is cut at its piece's out), each
    marked with its piece so a caption phrase never runs across a cut."""
    laid = layout(pieces); out = []
    for w in words:
        for n, (a, b, at) in enumerate(laid):
            if a <= w['start'] < b:
                out.append({**w, 'start': round(at + w['start'] - a, 6), 'end': round(at + min(w['end'], b) - a, 6), 'piece': n}); break
    return sorted(out, key=lambda w: w['start'])

def timeline_plan(plan):
    """The plan on the timeline: clips and sections moved, a clip wholly in a snip dropped, "duration" the pieces'
    total. A plan without "pieces" comes back as it is. Stills keep their clip-local times."""
    if not isinstance(plan, dict): sys.exit('A plan must be an object.')
    if 'pieces' in plan and not isinstance(plan['pieces'], list): sys.exit('pieces must be a list of source ranges.')
    if plan.get('media'):
        check_plan_parts(plan)
        media = plan['media']
        timeline = media_timeline(media, plan.get('duration', 0))
        sections = []
        for section in plan.get('sections', []):
            if not section.get('placement'):
                sections.append(section)
                continue
            spans = media_spans(media, section['placement'], section['start'], section['end'], plan.get('duration', 0), section.get('cycle'))
            for index, part in enumerate(spans):
                sections.append({**section, 'id': section['id'] if index == 0 else f'{section["id"]}~part-{index + 1}',
                    'name': f'{section["name"]} (part {index + 1})' if len(spans) > 1 else section['name'],
                    'start': part['start'], 'end': part['end'], **({'partOf': section['id']} if len(spans) > 1 else {})})
        clips = []
        for clip in plan.get('clips', []):
            if not clip.get('placement'):
                clips.append(clip)
                continue
            spans = media_spans(media, clip['placement'], clip['in'], clip['out'], plan.get('duration', 0), clip.get('cycle'))
            part = spans[0] if len(spans) == 1 else None
            if not part or abs(part['sourceStart'] - clip['in']) > ATTACHED_RANGE_TOLERANCE or abs(part['sourceEnd'] - clip['out']) > ATTACHED_RANGE_TOLERANCE:
                clips.append({**clip, 'attachmentBroken': True})
                continue
            section = next((s for s in sections if (s['id'] == clip.get('section') or s.get('partOf') == clip.get('section')) and s['start'] <= part['start'] and s['end'] >= part['end']), None)
            clips.append({**clip, 'in': part['start'], 'out': part['end'], 'attachmentBroken': False, **({'section': section['id']} if section else {})})
        return {**plan, 'duration': timeline['duration'], 'sections': sections, 'clips': clips}
    if not plan.get('pieces'): return plan
    laid = layout(plan['pieces']); clips = []
    for c in plan['clips']:
        r = span(laid, c['in'], c['out'])
        if r: clips.append({**c, 'in': round(r[0], 6), 'out': round(r[1], 6), **({'stills': [s for s in c['stills'] if s['from'] < r[1] - r[0]]} if 'stills' in c else {})})
    sections = []
    for s in plan.get('sections', []):
        r = span(laid, s['start'], s['end'])
        if r: sections.append({**s, 'start': round(r[0], 6), 'end': round(r[1], 6)})
    return {**{k: v for k, v in plan.items() if k != 'pieces'}, 'clips': clips, 'duration': round(total(laid), 6),
            **({'sections': sections} if 'sections' in plan else {})}
