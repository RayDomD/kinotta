const clamp = (v) => Math.max(0, Math.min(1, v));
const span = (t, at, dur) => clamp((t - at) / dur);
const outExpo = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
const inQuad = (x) => x * x;
const exitAt = (local, root, len = 0.2) => 1 - inQuad(span(local, (Number(root.dataset.duration) || 1e9) - len, len));
const root = document.querySelector('[data-scene="prompt"]');
const field = root.querySelector('.field');
const text = root.querySelector('.text');
const send = root.querySelector('.send');
const line = text.textContent;
const typeAt = Number(text.dataset.typeAt), cps = Number(text.dataset.cps);
const typedBy = typeAt + line.length / cps;
const caret = document.createElement('span');
caret.className = 'caret';
export function seek(local) {
  const out = exitAt(local, root);
  const a = outExpo(span(local, 0, 0.4));
  field.style.opacity = String(a * out);
  field.style.transform = `translateY(${-24 * (1 - a)}px) scale(${0.97 + 0.03 * a})`;
  text.textContent = line.slice(0, Math.floor(span(local, typeAt, typedBy - typeAt) * line.length));
  caret.style.opacity = local < typedBy || Math.floor(local * 2) % 2 === 0 ? '1' : '0';
  text.append(caret);
  const press = span(local, typedBy + 0.35, 0.16);
  send.style.transform = `scale(${1 - 0.06 * Math.sin(Math.PI * press)})`;
}
