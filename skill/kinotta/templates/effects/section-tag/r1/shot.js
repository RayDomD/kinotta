const clamp = (v) => Math.max(0, Math.min(1, v));
const span = (t, at, dur) => clamp((t - at) / dur);
const outExpo = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
const outQuart = (x) => 1 - Math.pow(1 - x, 4);
const inQuad = (x) => x * x;
const exitAt = (local, root, len = 0.2) => 1 - inQuad(span(local, (Number(root.dataset.duration) || 1e9) - len, len));
const root = document.querySelector('[data-scene="section-tag"]');
const num = root.querySelector('.num');
const label = root.querySelector('.label');
export function seek(local) {
  const out = exitAt(local, root);
  const a = outExpo(span(local, 0, 0.4));
  num.style.opacity = String(a * out);
  num.style.transform = `scale(${0.96 + 0.04 * a})`;
  const b = outQuart(span(local, 0.06, 0.45));
  label.style.opacity = String(Math.min(1, b * 2) * out);
  label.style.clipPath = `inset(0 ${100 - 100 * b}% 0 0 round 10px)`;
}
