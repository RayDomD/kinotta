"""A footage plan's pieces: an ordered list of { "in", "out" } stretches of the source video that make up the reel.
Source time is the video's own clock; timeline time is the reel's, with the pieces laid end to end in list order.
Whatever lies outside every piece is snipped. A plan without "pieces" is one piece covering the whole video.
Plans keep clip in/out, word times and section bounds in source time; build.py and shots.py call timeline_plan() and
timeline_words() to get them on the timeline. server/core/_internal/pieces.ts does the same mapping for Kinotta."""
import sys

EPS = 1e-9

def layout(pieces):
    """The pieces with their timeline start: [(in, out, at)]. Stops on a malformed or overlapping piece."""
    out, at = [], 0.0
    for i, p in enumerate(pieces):
        a, b = p.get('in'), p.get('out')
        if not all(isinstance(x, (int, float)) and not isinstance(x, bool) for x in (a, b)) or not 0 <= a < b:
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
