const clamp = (x) => Math.max(0, Math.min(1, x));
const span = (t, at, duration) => clamp((t - at) / duration);
const ease = (x) => globalThis.M?.curves?.state?.(x) ?? (x * x * (3 - 2 * x));
const rise = (x) => globalThis.M?.curves?.rise?.(x) ?? (1 - Math.pow(1 - x, 4));
const mix = (a, b, k) => a + (b - a) * k;
const root = document.querySelector('[data-scene="shape-morph"]');
const shape = root.querySelector('.shape');
const title = root.querySelector('.title');
export function seek(local) {
  const first = ease(span(local, Number(root.dataset.barAt), .6));
  const second = ease(span(local, Number(root.dataset.frameAt), .7));
  const w = mix(mix(220, 940, first), 1280, second);
  const h = mix(mix(220, 110, first), 700, second);
  shape.style.width = `${w}px`;
  shape.style.height = `${h}px`;
  shape.style.borderRadius = `${mix(mix(110, 55, first), 44, second)}px`;
  shape.style.transform = `translate(-50%, -50%) translateX(${mix(-420, 0, first)}px)`;
  shape.style.background = `color-mix(in srgb, var(--fx-accent) ${100 * (1 - second)}%, transparent)`;
  shape.style.boxShadow = `inset 0 0 0 ${mix(0, 8, second)}px var(--fx-accent)`;
  title.style.opacity = String(span(local, Number(root.dataset.frameAt) + .7, .2));
}
