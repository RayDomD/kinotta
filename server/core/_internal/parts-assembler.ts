import { parse } from 'node-html-parser';
import { KinottaError } from './errors.ts';
import { DURATION_TOLERANCE, checkPartsManifest } from './parts.ts';
import type { PartsManifest } from './types.ts';

export interface ShotRevision { html: string; css: string; js: string }
export interface PartsInputs { shared: Record<string, { css: string }>; shots: Record<string, ShotRevision> }
export interface PartsOverride { shot: string; revision: string }

export function partsAlternateManifest(manifest: PartsManifest, override: PartsOverride): PartsManifest {
  const shot = manifest.shots.find((shot) => shot.name === override.shot);
  const alternate = shot?.alternates?.find((alternate) => alternate.revision === override.revision);
  if (!shot || !alternate) throw new KinottaError('invalid', 'That shot revision is not an alternate in this version.');
  const shots = manifest.shots.map((current) => current === shot ? { ...current, revision: alternate.revision, duration: alternate.duration, title: alternate.title } : current);
  return { ...manifest, shots, duration: shots.reduce((sum, shot) => sum + shot.duration, 0) };
}

/** CSS and JS strings/comments do not define rules or module statements. Keep offsets for source rewriting. */
function codeMask(text: string): string {
  const chars = text.split('');
  let quote = '';
  for (let i = 0; i < chars.length; i++) {
    const char = text[i]!;
    if (quote) {
      chars[i] = ' ';
      if (char === '\\') { if (i + 1 < chars.length) chars[++i] = ' '; }
      else if (char === quote) quote = '';
    } else if (char === '"' || char === "'" || char === '`') { quote = char; chars[i] = ' '; }
    else if (char === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      const last = end < 0 ? text.length : end + 2;
      while (i < last) chars[i++] = ' ';
      i--;
    } else if (char === '/' && text[i + 1] === '/') {
      while (i < chars.length && text[i] !== '\n') chars[i++] = ' ';
      i--;
    }
  }
  return chars.join('');
}

/** Find a delimiter outside CSS functions and attribute selectors. */
function delimiter(text: string, from: number, wanted: string): number {
  let parens = 0;
  let brackets = 0;
  for (let i = from; i < text.length; i++) {
    const char = text[i]!;
    if (!parens && !brackets && wanted.includes(char)) return i;
    if (char === '(') parens++; else if (char === ')') parens--;
    else if (char === '[') brackets++; else if (char === ']') brackets--;
  }
  return -1;
}

function scopedCss(css: string, name: string): void {
  // Preserve quoted scene names when checking selectors, while ignoring comments and strings for brace boundaries.
  const masked = codeMask(css);
  const scope = new RegExp(`^\\[data-scene\\s*=\\s*(['"]?)${name}\\1\\s*\\]`);
  const failure = () => new KinottaError('invalid', `Shot ${name} CSS must scope every selector under [data-scene="${name}"]. Use shared styles for global rules.`);
  function rules(from: number, end: number, keyframes = false): void {
    let cursor = from;
    while (cursor < end) {
      while (cursor < end && /\s/.test(masked[cursor]!)) cursor++;
      if (cursor === end) return;
      const open = delimiter(masked, cursor, '{;');
      if (open < 0 || open >= end || masked[open] !== '{') throw failure();
      let level = 1;
      let close = open + 1;
      for (; close < end && level; close++) {
        if (masked[close] === '{') level++; else if (masked[close] === '}') level--;
      }
      if (level) throw failure();
      const prelude = css.slice(cursor, open).replace(/\/\*[\s\S]*?\*\//g, '').trim();
      if (/^@(media|supports|container|layer|starting-style)\b/i.test(prelude)) rules(open + 1, close - 1);
      else if (/^@(?:-webkit-)?keyframes\b/i.test(prelude)) {
        if (!new RegExp(`^@(?:-webkit-)?keyframes\\s+${name}--[\\w-]+$`, 'i').test(prelude)) throw failure();
        rules(open + 1, close - 1, true);
      } else {
        let selectorStart = 0;
        while (selectorStart < prelude.length) {
          const comma = delimiter(codeMask(prelude), selectorStart, ',');
          const selector = prelude.slice(selectorStart, comma < 0 ? undefined : comma).trim();
          const prefix = scope.exec(selector);
          if (keyframes ? !/^(from|to|[\d.]+%)$/i.test(selector) : !prefix || /^[+~]/.test(selector.slice(prefix[0].length).trim())) throw failure();
          if (comma < 0) break;
          selectorStart = comma + 1;
        }
        // Expand nesting into full scoped rules. It must not hide an escaping selector in declarations.
        if (delimiter(masked, open + 1, '{') >= 0 && delimiter(masked, open + 1, '{') < close - 1) throw failure();
      }
      cursor = close;
    }
  }
  rules(0, css.length);
}

const localReference = (value: string, base: string): string => /^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(value) ? value : `${base}${value}`;
const cssAssets = (css: string, base: string): string => css.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (_whole, quote: string, reference: string) => `url(${quote}${localReference(reference.trim(), base)}${quote})`);
const safeScript = (text: string): string => text.replace(/<\/script/gi, '<\\/script');
const safeStyle = (text: string): string => text.replace(/<\/style/gi, '<\\/style');

/** Pure assembly: all revision text is supplied by the caller, and author files are never modified. */
export function assembleParts(manifest: PartsManifest, inputs: PartsInputs, override?: PartsOverride): string {
  if (override) manifest = partsAlternateManifest(manifest, override);
  const checked = checkPartsManifest(manifest as unknown as Record<string, unknown>);
  if (!checked.manifest) throw new KinottaError('invalid', checked.issues.map((issue) => issue.message).join('\n'));
  const shared = inputs.shared[manifest.shared];
  if (!shared) throw new KinottaError('invalid', `Shared revision ${manifest.shared} is missing.`);
  const markup: string[] = [];
  const styles: string[] = [];
  const modules: string[] = [];
  for (const shot of checked.shots) {
    const source = inputs.shots[`${shot.name}/${shot.revision}`];
    if (!source) throw new KinottaError('invalid', `Shot ${shot.name} revision ${shot.revision} is missing.`);
    scopedCss(source.css, shot.name!);
    const fragment = parse(source.html);
    const roots = fragment.childNodes.filter((node) => node.nodeType === 1);
    const root = fragment.querySelector('section');
    if (roots.length !== 1 || roots[0] !== root || root?.getAttribute('data-scene') !== shot.name || fragment.querySelectorAll('[data-scene]').length !== 1 || fragment.querySelector('script,style,link')) {
      throw new KinottaError('invalid', `Shot ${shot.name} needs one section root with its own data-scene name and separate CSS and module files.`);
    }
    const base = `../shots/${shot.name}/${shot.revision}/`;
    for (const node of root.querySelectorAll('[src],[href],[poster]')) for (const attribute of ['src', 'href', 'poster']) {
      const reference = node.getAttribute(attribute);
      if (reference !== undefined) node.setAttribute(attribute, localReference(reference, base));
    }
    root.setAttribute('data-start', String(shot.start));
    root.setAttribute('data-duration', String(shot.duration));
    root.setAttribute('data-revision', shot.revision!);
    markup.push(root.toString());
    styles.push(`<style data-shot-style="${shot.name}">${safeStyle(cssAssets(source.css, base))}</style>`);
    const code = codeMask(source.js);
    if (/\bimport\b\s*(?!\.meta\b)/.test(code) || !/\bexport\s+(?:(?:async\s+)?function\s+seek\s*\(|(?:const|let)\s+seek\s*=)/.test(code)) throw new KinottaError('invalid', `Shot ${shot.name} needs a self-contained module exporting seek(local).`);
    let script = source.js;
    for (const match of [...code.matchAll(/\bimport\.meta\.url\b/g)].reverse()) {
      const at = match.index!;
      script = script.slice(0, at) + `new URL(${JSON.stringify(`${base}shot.js`)},document.baseURI).href` + script.slice(at + match[0].length);
    }
    modules.push(`<script type="module" data-shot-module="${shot.name}">${safeScript(script)}\nwindow.__kinottaParts.seekers[${JSON.stringify(shot.name)}]=seek;if(Object.keys(window.__kinottaParts.seekers).length===window.__kinottaParts.nodes.length){window.__kinottaParts.ready=true;window.seek(0);}</script>`);
  }
  const runtime = `window.DURATION=${manifest.duration};window.__kinottaParts={nodes:Array.from(document.querySelectorAll('#stage > [data-scene]')),seekers:Object.create(null),ready:false};window.seek=function(t){if(!Number.isFinite(t))throw new Error('Seek needs a finite time.');const time=Math.max(0,Math.min(window.DURATION,t));let pending;for(const node of window.__kinottaParts.nodes){const start=Number(node.dataset.start),duration=Number(node.dataset.duration),end=start+duration;const active=time>=start&&(time<end||node===window.__kinottaParts.nodes.at(-1)&&time>=end&&time-end<=${DURATION_TOLERANCE});node.classList.toggle('active',active);node.style.visibility=active?'visible':'hidden';node.style.pointerEvents=active?'auto':'none';if(active){const seek=window.__kinottaParts.seekers[node.dataset.scene];if(typeof seek!=='function')throw new Error('Shot '+node.dataset.scene+' has no seek(local).');pending=seek(time-start);}}return pending;};`;
  return `<!doctype html><html${manifest.alpha ? ' class="alpha"' : ''}><head><meta charset="utf-8"><style>html,body{margin:0}#stage{position:relative;width:1920px;height:1080px;overflow:hidden}#stage>[data-scene]{position:absolute;inset:0;visibility:hidden}</style><style data-shared-style="${manifest.shared}">${safeStyle(cssAssets(shared.css, `../shared/${manifest.shared}/`))}</style>${styles.join('')}</head><body><div id="stage">${markup.join('')}</div><script>${runtime}</script>${modules.join('')}</body></html>`;
}
