const clamp = (x) => Math.max(0, Math.min(1, x));
const span = (t, at, duration) => clamp((t - at) / duration);
const ease = (x) => globalThis.M?.curves?.state?.(x) ?? (x * x * (3 - 2 * x));
const rise = (x) => globalThis.M?.curves?.rise?.(x) ?? (1 - Math.pow(1 - x, 4));
const mix = (a, b, k) => a + (b - a) * k;
const root = document.querySelector('[data-scene="motif-carry"]');
const motif = root.querySelector('.motif');
const outgoing = root.querySelector('.outgoing');
const incoming = root.querySelector('.incoming');
export function seek(local) {
  const at = Number(root.dataset.carryAt);
  const k = ease(span(local, at, .65));
  // The underline at A's end is the spine at B's start, with no position jump.
  motif.style.width = `${mix(560, 12, k)}px`;
  motif.style.height = `${mix(12, 280, k)}px`;
  motif.style.transform = `translate(${mix(230, 180, k)}px, ${mix(570, 300, k)}px)`;
  outgoing.style.opacity = String(1 - span(local, at - .25, .2));
  incoming.style.opacity = String(span(local, at + .65, .2));
  incoming.style.transform = `translateX(${24 * (1 - rise(span(local, at + .65, .4)))}px)`;
}
