const clamp = (v) => Math.max(0, Math.min(1, v));
const span = (t, at, dur) => clamp((t - at) / dur);
const outExpo = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
const outQuart = (x) => 1 - Math.pow(1 - x, 4);
const inQuad = (x) => x * x;
const exitAt = (local, root, len = 0.2) => 1 - inQuad(span(local, (Number(root.dataset.duration) || 1e9) - len, len));
const root = document.querySelector('[data-scene="title-card"]');
const card = root.querySelector('.card');
const words = [...root.querySelectorAll('.word')];
const subtitle = root.querySelector('.subtitle');
const STAGGER = 0.07;
export function seek(local) {
  const out = exitAt(local, root, 0.25);
  const c = outExpo(span(local, 0, 0.4));
  card.style.opacity = String(c * out);
  card.style.transform = `scale(${0.97 + 0.03 * c})`;
  words.forEach((word, i) => {
    const a = outExpo(span(local, 0.12 + i * STAGGER, 0.5));
    word.style.opacity = String(a);
    word.style.transform = `translateY(${36 * (1 - a)}px)`;
  });
  const s = outQuart(span(local, 0.12 + words.length * STAGGER + 0.1, 0.45));
  subtitle.style.opacity = String(s);
  subtitle.style.transform = `translateY(${16 * (1 - s)}px)`;
}
