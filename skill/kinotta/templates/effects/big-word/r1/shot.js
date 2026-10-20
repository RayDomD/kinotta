const clamp = (v) => Math.max(0, Math.min(1, v));
const span = (t, at, dur) => clamp((t - at) / dur);
const outExpo = (x) => globalThis.M?.curves?.rise?.(x) ?? (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
const outQuart = (x) => globalThis.M?.curves?.state?.(x) ?? (1 - Math.pow(1 - x, 4));
const inQuad = (x) => globalThis.M?.curves?.sink?.(x) ?? (x * x);
const exitAt = (local, root, len = 0.2) => 1 - inQuad(span(local, (Number(root.dataset.duration) || 1e9) - len, len));
const root = document.querySelector('[data-scene="big-word"]');
const words = [...root.querySelectorAll('.word')].map((el) => ({ el, at: Number(el.dataset.at) }));
export function seek(local) {
  const out = exitAt(local, root, 0.15);
  words.forEach(({ el, at }, i) => {
    const next = words[i + 1]?.at ?? Infinity;
    const shown = local >= at && local < next;
    const a = outExpo(span(local, at, 0.22));
    el.style.opacity = shown ? String(a * out) : '0';
    el.style.transform = `scale(${1.04 - 0.04 * a})`;
  });
}
