"""A footage version's shots.json from its b-roll plan: one shot per clip. Run it last; shots.json appearing is
the editor's signal that the version is ready.
usage: python3 shots.py plan.json reels/<slug>/v<n>/shots.json [changedSection ...]
The plan needs "duration" and "sections" ([{ "id", "name", "start", "end" }]), and each clip a "section". A shot
starts "still" seconds into its clip (default 1, at most half the slot; a set "still" must fall inside the
slot), where the clip has settled, since a clip opens on an empty canvas. Its line is the clip's span, so its spoken line is the words said under it.
"full" clips are cutaways, "panel" clips are panels. Changed sections (v2 on) follow the output path.
A clip with "stills" ([{ "from", "title" }], "from" = clip-local seconds the state begins, the first at 0) gets
one shot per state, numbered 05a, 05b, … with "clip": "05"; each state's line runs to the next state. A state's
"still" is seconds into the state (the first state falls back to the clip's).
With "captions" on, one Captions overlay spans the transcript's words ("transcript" is its path from the plan).
With "pieces" (see engine/pieces.py) every time in the list is on the reel's timeline: dropped clips have no shot,
trimmed clips are cut to their edge, and words in a snip are not in the Captions span."""
import json, sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / 'engine'))
from pieces import timeline_plan, timeline_words

DEFAULT_STILL = 1.0
TYPES = {'full': 'cutaway', 'panel': 'panel'}

def shot(number, start, end, still):
    """Where a shot's still is drawn and its spoken span. A set still is used as given; the default is capped at
    half the span, so a short slot still shows its clip."""
    if still is None: still = min(DEFAULT_STILL, (end - start) / 2)
    elif not 0 <= still < end - start: sys.exit(f'shot {number}: "still" must fall inside it (0 to {round(end - start, 3)} s)')
    return round(start + still, 3), {'start': start, 'end': end}

def shots(plan, plan_dir=pathlib.Path(".")):
    pieces = plan.get('pieces'); plan = timeline_plan(plan)
    for key in ('duration', 'sections'):
        if key not in plan: sys.exit(f'plan.json has no "{key}"')
    ids = {s['id'] for s in plan['sections']}
    out = []
    # In time order, since Kinotta runs each shot to the next one's start; a batch's new clip can come earlier.
    for c in sorted(plan['clips'], key=lambda c: c['in']):
        if c.get('section') not in ids: sys.exit(f'clip {c["id"]}: "section" must be one of {sorted(ids)}')
        if c['kind'] not in TYPES: sys.exit(f'clip {c["id"]}: kind must be full or panel')
        def add(number, title, start, end, still, extra={}):
            at, line = shot(number, start, end, still)
            out.append({'number': number, **extra, 'start': at, 'title': title, 'description': c.get('description', c['title']),
                        'section': c['section'], 'type': TYPES[c['kind']], 'line': line})
        if 'stills' not in c:
            add(c['id'], c['title'], c['in'], c['out'], c.get('still'))
            continue
        froms = [s['from'] for s in c['stills']]
        if not froms or froms[0] != 0 or froms != sorted(set(froms)) or froms[-1] >= c['out'] - c['in']:
            sys.exit(f'clip {c["id"]}: "stills" must start at 0 and rise, each "from" inside the clip')
        for i, s in enumerate(c['stills']):
            start = c['in'] + s['from']
            end = c['in'] + froms[i + 1] if i + 1 < len(froms) else c['out']
            still = s.get('still', c.get('still') if i == 0 else None)
            add(c['id'] + chr(ord('a') + i), s['title'], start, end, still, {'clip': c['id']})
    result = {'contract': 1, 'duration': plan['duration'], 'sections': plan['sections'], 'shots': out}
    if plan.get('captions'):
        if not plan.get('transcript'): sys.exit('captions need "transcript", the transcript path from the plan')
        words = json.load(open(plan_dir / plan['transcript'], encoding='utf-8'))['words']
        if pieces: words = timeline_words(words, pieces)
        if words: result['overlays'] = [{'kind': 'CAPTIONS', 'name': 'Captions', 'start': words[0]['start'], 'end': words[-1]['end']}]
    return result

if __name__ == '__main__':
    result = shots(json.load(open(sys.argv[1], encoding='utf-8')), pathlib.Path(sys.argv[1]).resolve().parent)
    if len(sys.argv) > 3: result['changedSections'] = sys.argv[3:]
    out = pathlib.Path(sys.argv[2]); out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'{len(result["shots"])} shots -> {out}')
