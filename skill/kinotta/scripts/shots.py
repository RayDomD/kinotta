"""A footage version's shots.json from its b-roll plan: one shot per clip. Run it last; shots.json appearing is
the editor's signal that the version is ready.
usage: python3 shots.py plan.json reels/<slug>/v<n>/shots.json [changedSection ...]
The plan needs "duration" and "sections" ([{ "id", "name", "start", "end" }]), and each clip a "section". A shot
starts "still" seconds into its clip (default 1, at most half the slot), where the clip has settled, since a
clip opens on an empty canvas. Its line is the clip's span, so its spoken line is the words said under it.
"full" clips are cutaways, "panel" clips are panels. Changed sections (v2 on) follow the output path."""
import json, sys, pathlib

DEFAULT_STILL = 1.0
TYPES = {'full': 'cutaway', 'panel': 'panel'}

def shots(plan):
    for key in ('duration', 'sections'):
        if key not in plan: sys.exit(f'plan.json has no "{key}"')
    ids = {s['id'] for s in plan['sections']}
    out = []
    # In time order, since Kinotta runs each shot to the next one's start; a batch's new clip can come earlier.
    for c in sorted(plan['clips'], key=lambda c: c['in']):
        if c.get('section') not in ids: sys.exit(f'clip {c["id"]}: "section" must be one of {sorted(ids)}')
        if c['kind'] not in TYPES: sys.exit(f'clip {c["id"]}: kind must be full or panel')
        still = min(c.get('still', DEFAULT_STILL), (c['out'] - c['in']) / 2)
        out.append({'number': c['id'], 'start': round(c['in'] + still, 3), 'title': c['title'], 'description': c.get('description', c['title']),
                    'section': c['section'], 'type': TYPES[c['kind']], 'line': {'start': c['in'], 'end': c['out']}})
    return {'contract': 1, 'duration': plan['duration'], 'sections': plan['sections'], 'shots': out}

if __name__ == '__main__':
    result = shots(json.load(open(sys.argv[1], encoding='utf-8')))
    if len(sys.argv) > 3: result['changedSections'] = sys.argv[3:]
    out = pathlib.Path(sys.argv[2]); out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'{len(result["shots"])} shots -> {out}')
