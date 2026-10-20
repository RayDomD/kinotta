const clamp = (v) => Math.max(0, Math.min(1, v));
const span = (t, at, dur) => clamp((t - at) / dur);
const outExpo = (x) => globalThis.M?.curves?.rise?.(x) ?? (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
const outQuart = (x) => globalThis.M?.curves?.state?.(x) ?? (1 - Math.pow(1 - x, 4));
const inQuad = (x) => globalThis.M?.curves?.sink?.(x) ?? (x * x);
const exitAt = (local, root, len = 0.2) => 1 - inQuad(span(local, (Number(root.dataset.duration) || 1e9) - len, len));
const root = document.querySelector('[data-scene="before-after"]');
const sides = [...root.querySelectorAll('.side')];
const times = [...root.querySelectorAll('.time')];
const features = [...root.querySelectorAll('.features li')];
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const STAGGER = 0.07;
export function seek(local) {
  const out = exitAt(local, root);
  sides.forEach((side, i) => {
    const a = outExpo(span(local, i * 0.12, 0.5));
    side.style.opacity = String(a * out);
    side.style.transform = `translateX(${(i === 0 ? -80 : 80) * (1 - a)}px)`;
  });
  const count = outQuart(span(local, 0.7, 0.9));
  times.forEach((el) => {
    const from = Number(el.dataset.from), to = Number(el.dataset.to);
    el.textContent = clock(Math.round(from + (to - from) * count));
  });
  features.forEach((li, i) => {
    const a = outExpo(span(local, 1.7 + i * STAGGER, 0.4));
    li.style.opacity = String(a * out);
    li.style.transform = `translateY(${30 * (1 - a)}px) scale(${0.97 + 0.03 * a})`;
  });
}
