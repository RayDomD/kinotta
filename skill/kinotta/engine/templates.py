"""Adapt the shared parts templates to footage scenes; keep their seek functions private."""
import copy, html, mimetypes, pathlib, re, sys
from html.parser import HTMLParser

EFFECTS = pathlib.Path(__file__).resolve().parent.parent / 'templates/effects'
VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}

class Element:
    def __init__(self, tag='', attrs=()):
        self.tag, self.attrs, self.children = tag, dict(attrs), []

    def walk(self):
        yield self
        for child in self.children:
            if isinstance(child, Element): yield from child.walk()

    def render(self):
        inner = ''.join(c.render() if isinstance(c, Element) else html.escape(c, quote=False) for c in self.children)
        if not self.tag: return inner
        attrs = ''.join(f' {k}' if v is None else f' {k}="{html.escape(str(v), quote=True)}"' for k, v in self.attrs.items())
        return f'<{self.tag}{attrs}>' + ('' if self.tag in VOID else inner + f'</{self.tag}>')

class Markup(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.root = Element()
        self.stack = [self.root]
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        node = Element(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in VOID: self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID: self.stack.pop()

    def handle_endtag(self, tag):
        if self.stack[-1].tag != tag: sys.exit(f'template: mismatched closing tag {tag}')
        self.stack.pop()

    def handle_data(self, text): self.stack[-1].children.append(text)

def fill_element(node, value, local_time):
    if isinstance(value, str): value = {'text': value}
    if not isinstance(value, dict): sys.exit('template fill: expected text or an object')
    if 'text' in value:
        # Keep icons and decoration beside the copy, including each chip's SVG tick.
        node.children = [c for c in node.children if isinstance(c, Element) and c.tag == 'svg'] + [str(value['text'])]
    if 'at' in value:
        at = local_time(value['at'])
        # Keep nodes that template scripts look up by name, but never show a snipped cue.
        node.attrs['data-at'] = at if at is not None else 'Infinity'
    if 'src' in value: node.attrs['src'] = value['src']

def template_parts(plan_dir, clip, local_time):
    name = clip['template']
    if not isinstance(name, str) or not re.fullmatch(r'[a-z0-9-]+', name): sys.exit('template: expected an effect name')
    folder = plan_dir / clip['clip'] if clip.get('clip') else EFFECTS / name / 'r1'
    if not folder.is_dir(): sys.exit(f'template {name}: missing shot folder {folder}')
    tree = Markup((folder / 'shot.html').read_text(encoding='utf-8')).root
    roots = [e for e in tree.walk() if 'data-scene' in e.attrs]
    if len(roots) != 1: sys.exit(f'template {name}: expected one data-scene root')
    root = roots[0]
    old_scene, scene = root.attrs['data-scene'], clip['id']
    root.attrs.update({'data-scene': scene, 'data-start': clip['in'], 'data-duration': round(clip['out'] - clip['in'], 6)})
    fill = clip.get('fill', {})
    for key, value in fill.items():
        node = next((e for e in root.walk() if e.attrs.get('data-el') == key), None)
        if node is None: sys.exit(f'template {name}: no fill element {key}')
        if isinstance(value, list):
            value = [item for item in value if not isinstance(item, dict) or 'at' not in item or local_time(item['at']) is not None]
            children = [c for c in node.children if isinstance(c, Element)]
            if not children and value: sys.exit(f'template {name}: {key} has no item to fill')
            # Reuse the template's inter-item whitespace, including for cloned items.
            separator = ''.join(c for c in node.children[node.children.index(children[0]) + 1:node.children.index(children[1])]
                                if isinstance(c, str) and c.isspace()) if len(children) > 1 else ''
            node.children = []
            for i, item in enumerate(value):
                child = copy.deepcopy(children[min(i, len(children) - 1)])
                fill_element(child, item, local_time)
                if i and separator: node.children.append(separator)
                node.children.append(child)
        else: fill_element(node, value, local_time)
    keep = clip.get('keepLayers', [])
    if name == 'text-behind':
        if not isinstance(fill.get('subject'), dict) or not fill['subject'].get('src'):
            sys.exit('template text-behind: fill.subject.src must supply the subject matte')
        keep = [*keep, 'subject']
    for node in list(root.walk()):
        node.children = [c for c in node.children if not (isinstance(c, Element) and
            ((c.attrs.get('data-el') in ('plate', 'subject') and c.attrs['data-el'] not in keep) or
             ('plate' in c.attrs.get('class', '').split() and 'plate' not in keep)))]
    for node in root.walk():
        src = node.attrs.get('src')
        if src and not re.match(r'(?:[a-z]+:|//)', src):
            asset = folder / src
            if not asset.is_file(): sys.exit(f'template {name}: missing asset {asset}')
            import base64
            node.attrs['src'] = f'data:{mimetypes.guess_type(asset)[0] or "application/octet-stream"};base64,' + base64.b64encode(asset.read_bytes()).decode()
    css = (folder / 'shot.css').read_text(encoding='utf-8')
    js = (folder / 'shot.js').read_text(encoding='utf-8')
    # Use the composed scene as the template's root without changing private descendant lookups.
    selector = f'[data-scene="{old_scene}"]'
    css = css.replace(selector, '&')
    js = js.replace(f"document.querySelector('{selector}')", 'M.root')
    js = re.sub(r'\bexport\s+(?=(?:async\s+)?function\b|const\b|let\b|var\b)', '', js)
    return root, css, js
