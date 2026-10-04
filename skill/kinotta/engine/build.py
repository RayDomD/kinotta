"""Assemble clip fragments + engine + fonts into self-contained HTML files.
usage: python3 build.py <out_dir> clips/01-name.html [clips/02-name.html ...]
       python3 build.py --plan plan.json <out.html>      (a whole b-roll plan as one Kinotta version page)
Each page is one Kinotta scene (data-scene, data-start, data-duration) named after its file. The shape is
data-el="shape", the cursor data-el="cursor", and every element with an id gets data-el set to that id,
except the zero-size .L layer anchors (Kinotta can't outline an element with no box).
With --plan, each clip is a scene at its in-point on the video's timeline, as long as its slot (in to out).
Its CSS is nested under its scene and its script sees only its scene's elements, so clips sharing ids don't
interfere. Both sit inside the scene, so Kinotta sees a clip whose motion alone changed as a changed section.
A clip's fragment is the plan clip's "clip" path, else clips/<id>-*.html or <id>-*.html beside the
plan. The page lasts the plan's "duration" (the video's length), else until the last clip's out-point.
With "captions" (true, or { "look": "highlight" | "phrase" | "words", "color" }) and "transcript" (its path from
the plan), each caption phrase is a scene cap-001, … holding one element named caption, a span per word.
Captions can be moved: "position" { x, y } offsets every caption and "phrases" [{ at, x, y }] one more, the phrase
whose first word starts at source second "at" (within CAPTION_AT); px of the 1920x1080 page, CSS translate on the caption.
With "pieces" ([{ "in", "out" }], see pieces.py) the plan's source times are mapped to the reel's timeline: a clip in a
snipped stretch is dropped, one straddling a snip is trimmed to its edge, and words in a snip get no caption."""
import base64, html, json, re, sys, pathlib
E = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(E))
from pieces import timeline_plan, timeline_words
b64 = lambda p: base64.b64encode(open(p, 'rb').read()).decode()
CURSOR = '<svg id="cursor" data-el="cursor" viewBox="0 0 40 56"><path d="M3 3 L3 41 L12.5 32 L19 47 L25.5 44.2 L19.2 29.8 L32 29.8 Z" fill="#0B0B0B" stroke="#fff" stroke-width="2.6" stroke-linejoin="round"/></svg>'
# A composed page draws only the scenes running at t, over the footage: transparent wherever no clip paints.
PAGE_CSS = 'html,body{background:transparent}[data-scene]{position:absolute;left:0;top:0;display:none}[data-scene].active{display:block}'
ID_TAG = re.compile(r'<[a-zA-Z][^>]*?(?<![\w-])id="([^"]+)"[^>]*>')
def name_parts(html):
    def add(m):
        tag, id_ = m.group(0), m.group(1)
        if 'data-el=' in tag or re.search(r'(?<![\w-])class="(?:[^"]*\s)?L(?:\s[^"]*)?"', tag): return tag
        return tag.replace(f'id="{id_}"', f'id="{id_}" data-el="{id_}"', 1)
    return ID_TAG.sub(add, html)
def clip_length(src, js):
    m = re.search(r'M\.scene\(\s*\{.*?\bT\s*:\s*([0-9]*\.?[0-9]+)', js, re.S)
    if not m: sys.exit(f'{src}: M.scene has no T (clip length in seconds)')
    return m.group(1)
def parts(src):
    frag = open(src, encoding='utf-8').read()
    m = re.search(r'<title>(.*?)</title>', frag); title = m.group(1) if m else pathlib.Path(src).stem
    slot = lambda n: name_parts((re.search(rf'<div data-slot="{n}">(.*?)</div><!--/{n}-->', frag, re.S) or [None, ''])[1])
    js = ''.join(re.findall(r'<script>(.*?)</script>', frag, re.S))
    return dict(name=pathlib.Path(src).stem, title=title, css=''.join(re.findall(r'<style>(.*?)</style>', frag, re.S)), js=js, T=clip_length(src, js),
                stage=lambda scene='': f'<div id="wrap"><div id="stage"{scene}><div id="world">{slot("world")}<div id="shape" data-el="shape">{slot("shape")}</div>{slot("over")}</div>{CURSOR}</div></div>')
base_css = lambda: open(E/'base.css').read().replace('__GEIST__', b64(E/'fonts/Geist-Variable.woff2')).replace('__GEISTMONO__', b64(E/'fonts/GeistMono-Medium.woff2'))
engine = lambda: f'<script>{open(E/"motion.js").read()}</script>'
page = lambda title, css, body, scripts, engine_first=False: (
    f'<!doctype html><html><head><meta charset="utf-8"><title>{title}</title><style>{base_css()}{css}</style></head><body>\n'
    f'{engine() + chr(10) if engine_first else ""}{body}\n{"" if engine_first else engine()}{scripts}</body></html>')
def build(src, dst):
    p = parts(src)
    body = p['stage'](f' data-scene="{p["name"]}" data-start="0" data-duration="{p["T"]}"')
    open(dst, 'w', encoding='utf-8').write(page(p['title'], p['css'], body, f'<script>{p["js"]}</script>'))
def clip_source(plan_dir, c):
    if c.get('clip'): return plan_dir/c['clip']
    found = sorted(plan_dir.glob(f'clips/{c["id"]}-*.html')) or sorted(plan_dir.glob(f'{c["id"]}-*.html'))
    if not found: sys.exit(f'clip {c["id"]}: no "clip" path and no clips/{c["id"]}-*.html beside the plan')
    return found[0]
CAPTION_LOOKS = ('highlight', 'phrase', 'words')
CAPTION_COLOR = '#FF5A1F'   # the engine's accent
CAPTION_WORDS = 6           # a phrase's usual cap; it runs up to two over to reach a clause end
CAPTION_PAUSE = 0.3         # a gap between words this long ends a phrase
CAPTION_AT = 0.005          # a phrase position names its first word's source start to within this
CAPTION_HOLD = 0.6          # a phrase stays up until the next starts when the gap is shorter than this
# Bottom centre, clear of left-side panels; the scene lets clicks through to the clips under it, the caption takes them.
CAPTION_CSS = ('[data-caption]{pointer-events:none}'
    '[data-caption] .caption{position:fixed;left:50%;bottom:72px;transform:translateX(-50%);width:max-content;max-width:1180px;'
    'text-align:center;font:600 50px/1.18 "Geist",system-ui,sans-serif;letter-spacing:-.01em;color:#fff;pointer-events:auto}'
    '.caption .ph{padding:.08em .32em;-webkit-box-decoration-break:clone;box-decoration-break:clone;background:rgba(11,11,11,.72);border-radius:10px}'
    '.caption[data-look=highlight] .now{color:var(--cap-color)}'
    '.caption[data-look=words] .ph{padding:0;background:none}'
    '.caption[data-look=words] [data-t]{display:inline-block;padding:.08em .22em;margin:0 -.06em .14em;background:rgba(11,11,11,.72);border-radius:10px;opacity:0}'
    '.caption[data-look=words] .said{opacity:1}')
def caption_style(value):
    opts = {} if value is True else value
    look = opts.get('look', 'highlight')
    if look not in CAPTION_LOOKS: sys.exit(f'captions look must be one of {", ".join(CAPTION_LOOKS)}')
    return look, opts.get('color', CAPTION_COLOR)
def caption_shift(value, first):
    """The offset (x, y) of the phrase whose first word starts at source second `first`: the reel-wide position plus
    that phrase's own, or None when it is not moved."""
    opts = {} if value is True else value
    pos = opts.get('position') or {}
    own = min((e for e in opts.get('phrases') or [] if abs(e['at'] - first) <= CAPTION_AT), key=lambda e: abs(e['at'] - first), default={})
    x, y = pos.get('x', 0) + own.get('x', 0), pos.get('y', 0) + own.get('y', 0)
    return None if x == 0 and y == 0 else (x, y)
def phrases(words):
    """Caption phrases: a break at a pause, at a clause end once the phrase has 3 words, or at the cap (up to two
    words over it when that reaches a clause end)."""
    ends = lambda w: re.search(r'[.,!?;:]$', w['text'])
    out, cur = [], []
    for i, w in enumerate(words):
        cur.append(w)
        nxt = words[i + 1] if i + 1 < len(words) else None
        reach = any(ends(x) for x in words[i + 1:i + 1 + CAPTION_WORDS + 2 - len(cur)])
        full = len(cur) >= CAPTION_WORDS and (not reach or len(cur) >= CAPTION_WORDS + 2)
        if not nxt or full or nxt.get('piece') != w.get('piece') or nxt['start'] - w['end'] > CAPTION_PAUSE or (ends(w) and len(cur) >= 3):
            out.append({'start': cur[0]['start'], 'end': cur[-1]['end'], 'words': cur}); cur = []
    for a, b in zip(out, out[1:]):
        if b['start'] - a['end'] < CAPTION_HOLD: a['end'] = b['start']
    return out
def caption_scenes(plan_dir, P, pieces=None):
    if not P.get('transcript'): sys.exit('captions need "transcript", the transcript path from the plan')
    look, color = caption_style(P['captions'])
    words = [{**w, 'at': w['start']} for w in json.load(open(plan_dir/P['transcript'], encoding='utf-8'))['words']]
    if pieces: words = timeline_words(words, pieces)
    scenes = []
    for n, ph in enumerate(phrases(words), 1):
        spans = ' '.join(f'<span data-t="{w["start"]}" data-e="{w["end"]}">{html.escape(w["text"])}</span>' for w in ph['words'])
        shift = caption_shift(P['captions'], ph['words'][0]['at'])
        moved = f';translate:{shift[0]:g}px {shift[1]:g}px' if shift else ''
        scenes.append(f'<section data-scene="cap-{n:03d}" data-caption data-start="{ph["start"]}" data-duration="{round(ph["end"] - ph["start"], 6)}">'
                      f'<div class="caption" data-el="caption" data-look="{look}" style="--cap-color:{color}{moved}"><span class="ph">{spans}</span></div></section>')
    return scenes
def compose(plan_path, dst):
    plan_dir = pathlib.Path(plan_path).resolve().parent; source = json.load(open(plan_path, encoding='utf-8')); P = timeline_plan(source)
    # The engine loads before the scenes, so each clip's style and script can sit inside its own scene: Kinotta
    # compares scene markup between versions, and a clip whose motion alone changed must count as changed.
    body = []
    for c in P['clips']:
        p = parts(clip_source(plan_dir, c)); sel = f'[data-scene="{p["name"]}"]'
        style = f'<style>{sel}{{{p["css"]}}}</style>' if p['css'].strip() else ''
        script = f'<script>M.root=document.querySelector(\'{sel}\');(function(document){{{p["js"]}\n}})(M.scope(M.root));M.root=null;</script>'
        body.append(f'<section data-scene="{p["name"]}" data-start="{c["in"]}" data-duration="{round(c["out"] - c["in"], 6)}">{p["stage"]()}{style}{script}</section>')
    captions = P.get('captions')
    if captions: body += caption_scenes(plan_dir, P, source.get('pieces'))
    duration = P['duration'] if 'duration' in P else max(c['out'] for c in P['clips'])
    pathlib.Path(dst).parent.mkdir(parents=True, exist_ok=True)
    open(dst, 'w', encoding='utf-8').write(page(P.get('title', 'B-roll'), PAGE_CSS + (CAPTION_CSS if captions else ''),'\n'.join(body), f'<script>M.page({duration});</script>', engine_first=True))
if __name__ == '__main__':
    if sys.argv[1] == '--plan':
        compose(sys.argv[2], sys.argv[3]); print('built', sys.argv[3])
    else:
        out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
        for s in sys.argv[2:]:
            d = out/(pathlib.Path(s).stem + '.html'); build(s, d); print('built', d)
