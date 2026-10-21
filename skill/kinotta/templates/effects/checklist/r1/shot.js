const clamp = (v) => Math.max(0, Math.min(1, v));
const span = (t, at, dur) => clamp((t - at) / dur);
const outExpo = (x) => globalThis.M?.curves?.rise?.(x) ?? (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
const outQuart = (x) => globalThis.M?.curves?.state?.(x) ?? (1 - Math.pow(1 - x, 4));
const inQuad = (x) => globalThis.M?.curves?.sink?.(x) ?? (x * x);
const exitAt = (local, root, len = 0.2) => 1 - inQuad(span(local, (Number(root.dataset.duration) || 1e9) - len, len));
const root = document.querySelector('[data-scene="checklist"]');
const panel = root.querySelector('.panel');
const items = [...root.querySelectorAll('li')].map((el) => ({ el, at: Number(el.dataset.at), tick: el.querySelector('.tick'), box: el.querySelector('.box') }));
const STAGGER = 0.06;
export function seek(local) {
  const out = exitAt(local, root);
  const p = outExpo(span(local, 0, 0.35));
  panel.style.opacity = String(p * out);
  panel.style.transform = `scale(${0.97 + 0.03 * p})`;
  items.forEach(({ el, at, tick, box }, i) => {
    const a = outQuart(span(local, 0.12 + i * STAGGER, 0.35));
    el.style.opacity = String(a);
    el.style.transform = `translateY(${14 * (1 - a)}px)`;
    const k = outQuart(span(local, at, 0.3));
    tick.style.clipPath = `inset(0 ${100 - 100 * k}% 0 0)`;
    box.style.transform = `scale(${1 - 0.08 * Math.sin(Math.PI * span(local, at, 0.18))})`;
  });
}
