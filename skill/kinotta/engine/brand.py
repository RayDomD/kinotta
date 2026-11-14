"""Embed one page's brand sources before any clip runs."""
import base64, json, re, sys
from templates import EFFECTS

def script_json(value):
    return json.dumps(value).replace('<', '\\u003c')

def brand_assets(plan_dir, brand, templates):
    if not brand and not templates: return '', ''
    css = ''.join((EFFECTS / name).read_text(encoding='utf-8') for name in ('shared.css', 'presets.css'))
    tokens = brand.get('tokens', {})
    rules = []
    for name, value in tokens.items():
        if not re.fullmatch(r'(?:fx|cap|grade)-[a-z0-9-]+', name) or not isinstance(value, str) or re.search(r'[;{}<>]', value):
            sys.exit(f'brand token {name}: expected an fx-, cap- or grade- CSS value')
        rules.append(f'--{name}:{value}')
    fonts = []
    for font in brand.get('fonts', []):
        file = plan_dir / font['file']
        if not file.is_file(): sys.exit(f'brand font: missing file {file}')
        fonts.append({ 'family': font['family'], 'weight': str(font.get('weight', '400')), 'bytes': base64.b64encode(file.read_bytes()).decode() })
    if fonts and 'fx-font' not in tokens: rules.append('--fx-font:' + json.dumps(fonts[0]['family']))
    curves = {}
    for name, value in brand.get('curves', {}).items():
        if name not in ('rise', 'state', 'sink'): sys.exit(f'brand curve: unknown {name}')
        if isinstance(value, str):
            match = re.fullmatch(r'cubic-bezier\(([^)]+)\)', value.strip())
            if not match: sys.exit(f'brand curve {name}: expected cubic-bezier or four numbers')
            try: value = [float(n.strip()) for n in match[1].split(',')]
            except ValueError: sys.exit(f'brand curve {name}: expected four numbers')
        import math
        if not isinstance(value, list) or len(value) != 4 or not all(isinstance(n, (int, float)) and math.isfinite(n) for n in value) or not all(0 <= value[i] <= 1 for i in (0, 2)):
            sys.exit(f'brand curve {name}: expected four numbers with x coordinates in 0..1')
        curves[name] = value
    js = '''(function(){
M.curves=M.curves||{};
for(const [name,points] of Object.entries(CURVES))M.curves[name]=M.bezier(...points);
const fonts=FONTS.map(font=>{
  const bytes=Uint8Array.from(atob(font.bytes),c=>c.charCodeAt(0));
  const face=new FontFace(font.family,bytes,{weight:font.weight});
  document.fonts.add(face);return face.loaded;
});
M.fontsReady=Promise.all(fonts);
// Adapt only template/brand pages: existing fragment pages keep their synchronous page runner.
const page=M.page;
M.page=duration=>{
  let pending=[];
  for(const clip of M.clips){
    const own=clip.seek;
    clip.seek=t=>{const result=own(t);if(result&&typeof result.then==='function')pending.push(result);};
  }
  const seek=page(duration);
  window.seek=t=>{pending=[];seek(t);return Promise.all([M.fontsReady,...pending]);};
  return window.seek;
};
})();'''.replace('CURVES', script_json(curves)).replace('FONTS', script_json(fonts))
    return css + (':root{' + ';'.join(rules) + '}' if rules else '') + '#stage{font-family:var(--fx-font)}', '<script>' + js + '</script>'
